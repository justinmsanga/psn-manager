import { supabase, ADMIN_NAME, today, plusSixMonths, isFutureDate, dbTransactionToUi, logActivity, fetchTransactions, fetchAccountRaw } from './db.js';
import { assertSufficientBusinessBalance, buildSaleNote, pickAvailableSlot, hasOnlineSale } from './logic.js';

const SPEND_TYPES = new Set(['account_purchase', 'psn_deposit', 'withdrawal', 'expense']);

// Mirrors the Supabase branch of addTransaction in StoreContext.jsx.
export async function recordTransaction({ type, amount, accountId, slotId, gameId, customer, note, saleType, consoleType }) {
  const amt = Number(amount || 0);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount greater than zero.');

  if (SPEND_TYPES.has(type)) {
    const txs = await fetchTransactions();
    assertSufficientBusinessBalance(amt, txs);
  }

  const payload = {
    type,
    amount: amt,
    account_id: accountId || null,
    slot_id: slotId || null,
    game_id: gameId || null,
    customer: customer || null,
    note: note || null,
    admin: ADMIN_NAME,
    transaction_date: today(),
    sale_type: saleType || 'offline_online',
    console: consoleType || null,
  };
  const { data: inserted, error } = await supabase.from('money_transactions').insert(payload).select('*').single();
  if (error) throw error;

  if (accountId && type === 'psn_deposit') {
    const account = await fetchAccountRaw(accountId);
    await supabase.from('accounts').update({ psn_deposits: Number(account.psnDeposits || 0) + amt }).eq('id', accountId);
  }

  if (accountId && type === 'slot_sale') {
    const account = await fetchAccountRaw(accountId);
    await supabase.from('accounts').update({ revenue: Number(account.revenue || 0) + amt }).eq('id', accountId);
    if (slotId) {
      await supabase.from('slots').update({ status: 'sold', price: amt, customer: customer || null, sold_date: today() }).eq('id', slotId);
    }
  }

  await logActivity(`transaction_${type}`, 'transaction', inserted.id, { type, amount: amt, accountId });
  return dbTransactionToUi(inserted);
}

// Mirrors sellSlot + the slot-picking / gating logic in SellSlot.jsx.
export async function sellSlot({ account, game, consoleType, saleType = 'offline_online', price, customer, note, payment = 'paid' }) {
  if (!['ps4', 'ps5'].includes(consoleType)) throw new Error('console must be "ps4" or "ps5".');
  if (!['offline_online', 'offline_only', 'online_only'].includes(saleType)) {
    throw new Error('sale_type must be one of "offline_online", "offline_only", "online_only".');
  }

  const txs = await fetchTransactions();
  let slot = null;
  if (saleType === 'online_only') {
    if (hasOnlineSale(txs, account.id, consoleType)) {
      throw new Error(`The online-only copy for ${consoleType.toUpperCase()} on ${account.email} is already sold.`);
    }
  } else {
    slot = pickAvailableSlot(account, consoleType);
    if (!slot) {
      throw new Error(`No available ${consoleType.toUpperCase()} slot on ${account.email}. Use sale_type "online_only" instead, or pick a different account/console.`);
    }
  }

  const saleNote = buildSaleNote({ gameName: game.name, payment, saleType, note });
  return recordTransaction({
    type: 'slot_sale',
    amount: price,
    accountId: account.id,
    slotId: slot?.id || null,
    gameId: game.id,
    customer,
    note: saleNote,
    saleType,
    consoleType,
  });
}

// Mirrors recordGamePurchase's Supabase branch.
export async function buyGameForAccount({ account, game, cost }) {
  const amount = Number(cost || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid game cost greater than zero.');
  const psnBalance = Number(account.psnDeposits || 0) - Number(account.psnGamePurchases || 0);
  if (amount > psnBalance) {
    throw new Error(`Not enough PSN wallet money on ${account.email}. Available: ${psnBalance}.`);
  }
  const nextPurchases = Number(account.psnGamePurchases || 0) + amount;
  const { error: accountError } = await supabase.from('accounts').update({ psn_game_purchases: nextPurchases }).eq('id', account.id);
  if (accountError) throw accountError;
  const { error: gameError } = await supabase.from('account_games').upsert({
    account_id: account.id,
    game_id: game.id,
    purchase_price: amount,
    purchase_date: today(),
  });
  if (gameError) throw gameError;
  await logActivity('game_purchased', 'account', account.id, { gameId: game.id, cost: amount });
}

// Mirrors markDeactivated's Supabase branch.
export async function markDeactivated(account) {
  if (isFutureDate(account.nextDeactivation)) {
    throw new Error(`Next deactivation for ${account.email} is available on ${account.nextDeactivation}.`);
  }
  const allSlots = [...account.slots.ps4, ...account.slots.ps5];
  const lockedResetSlots = allSlots.filter((s) => s.type === 'reset' && s.status === 'locked');
  const availableResetSlots = allSlots.filter((s) => s.type === 'reset' && s.status === 'available');
  if (availableResetSlots.length) {
    throw new Error(`Sell the currently available reset slot(s) on ${account.email} before starting another cycle.`);
  }
  if (lockedResetSlots.length) {
    const ps4NormalSold = account.slots.ps4.filter((s) => s.type === 'normal' && s.status === 'sold').length;
    const ps5NormalSold = account.slots.ps5.filter((s) => s.type === 'normal' && s.status === 'sold').length;
    if (ps4NormalSold < 2 || ps5NormalSold < 2) {
      throw new Error(`Sell both normal PS4 slots and both normal PS5 slots on ${account.email} before deactivation.`);
    }
  }

  const lastDeact = today();
  const nextDeact = plusSixMonths();
  const nextCycle = Math.max(0, ...allSlots.filter((s) => s.type === 'reset').map((s) => Number(s.resetCycle || 0))) + 1;

  const { error: accountError } = await supabase.from('accounts').update({ last_deactivation: lastDeact, next_deactivation: nextDeact }).eq('id', account.id);
  if (accountError) throw accountError;

  if (lockedResetSlots.length) {
    const { error: slotsError } = await supabase.from('slots').update({ status: 'available' }).eq('account_id', account.id).eq('slot_type', 'reset').eq('status', 'locked');
    if (slotsError) throw slotsError;
  } else {
    const { error: slotsError } = await supabase.from('slots').insert(['ps4', 'ps5'].map((consoleName) => ({
      account_id: account.id, console: consoleName, slot_number: 3, slot_type: 'reset', status: 'available', reset_cycle: nextCycle,
    })));
    if (slotsError) throw slotsError;
  }

  const { error: cycleError } = await supabase.from('reset_cycles').insert({ account_id: account.id, deactivated_at: lastDeact, next_available_at: nextDeact, created_by: ADMIN_NAME });
  if (cycleError) throw cycleError;
  await logActivity('account_deactivated', 'account', account.id);
  return { lastDeactivation: lastDeact, nextDeactivation: nextDeact };
}

const DEFAULT_SLOT_ROWS = (accountId) => [
  { account_id: accountId, console: 'ps4', slot_number: 1, slot_type: 'normal', status: 'available' },
  { account_id: accountId, console: 'ps4', slot_number: 2, slot_type: 'normal', status: 'available' },
  { account_id: accountId, console: 'ps4', slot_number: 3, slot_type: 'reset', status: 'locked' },
  { account_id: accountId, console: 'ps5', slot_number: 1, slot_type: 'normal', status: 'available' },
  { account_id: accountId, console: 'ps5', slot_number: 2, slot_type: 'normal', status: 'available' },
  { account_id: accountId, console: 'ps5', slot_number: 3, slot_type: 'reset', status: 'locked' },
];

// Mirrors addAccount's Supabase branch.
export async function addAccount({ email, password, region = 'US', cost, notes, gameIds = [] }) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Email is required.');
  const amount = Number(cost || 0);
  if (amount > 0) {
    const txs = await fetchTransactions();
    assertSufficientBusinessBalance(amount, txs);
  }

  const { data, error } = await supabase.from('accounts').insert({
    email: cleanEmail,
    password: password || null,
    region,
    purchase_cost: amount,
    notes: notes || null,
    condition: 'clean',
    status: 'active',
  }).select('*').single();
  if (error) throw error;

  const accountId = data.id;
  const { error: slotsError } = await supabase.from('slots').insert(DEFAULT_SLOT_ROWS(accountId));
  if (slotsError) throw slotsError;

  if (gameIds.length) {
    const { error: gamesError } = await supabase.from('account_games').insert(
      gameIds.map((gameId) => ({ account_id: accountId, game_id: gameId, purchase_price: 0 }))
    );
    if (gamesError) throw gamesError;
  }

  await recordTransaction({ type: 'account_purchase', amount, accountId, note: `New account: ${cleanEmail}` });
  await logActivity('account_created', 'account', accountId, { email: cleanEmail });
  return fetchAccountRaw(accountId);
}

// Mirrors createGame's Supabase branch.
export async function createGame({ name, defaultPs4Price = 0, defaultPs5Price = 0 }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Game name is required.');
  const { data, error } = await supabase
    .from('games')
    .upsert({ name: cleanName, default_ps4_price: Number(defaultPs4Price || 0), default_ps5_price: Number(defaultPs5Price || 0) }, { onConflict: 'name' })
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('game_created', 'game', data.id, { name: cleanName });
  return data;
}

// Mirrors updateAccount's Supabase branch (subset: condition/status/notes/password/region/purchaseCost).
export async function updateAccount(account, patch) {
  const nextCost = patch.purchaseCost === undefined ? Number(account.purchaseCost || 0) : Number(patch.purchaseCost || 0);
  const costDifference = nextCost - Number(account.purchaseCost || 0);
  if (costDifference > 0) {
    const txs = await fetchTransactions();
    assertSufficientBusinessBalance(costDifference, txs);
  }

  const payload = {};
  if (patch.condition !== undefined) payload.condition = patch.condition;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.password !== undefined) payload.password = patch.password;
  if (patch.region !== undefined) payload.region = patch.region;
  if (patch.purchaseCost !== undefined) payload.purchase_cost = nextCost;

  const { error } = await supabase.from('accounts').update(payload).eq('id', account.id);
  if (error) throw error;

  if (patch.purchaseCost !== undefined) {
    const { data: purchaseRows } = await supabase
      .from('money_transactions').select('id').eq('account_id', account.id).eq('type', 'account_purchase')
      .order('created_at', { ascending: true }).limit(1);
    if (purchaseRows?.length) {
      await supabase.from('money_transactions').update({ amount: nextCost }).eq('id', purchaseRows[0].id);
    }
  }

  await logActivity('account_updated', 'account', account.id, payload);
  return fetchAccountRaw(account.id);
}

// Mirrors deleteAccount's Supabase branch. Destructive - the caller should confirm before invoking.
export async function deleteAccount(accountId) {
  await supabase.from('account_games').delete().eq('account_id', accountId);
  await supabase.from('slots').delete().eq('account_id', accountId);
  await supabase.from('money_transactions').delete().eq('account_id', accountId);
  const { error } = await supabase.from('accounts').delete().eq('id', accountId);
  if (error) throw error;
  await logActivity('account_deleted', 'account', accountId, {});
}

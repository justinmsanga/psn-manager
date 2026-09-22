export const formatTzs = (value) => new Intl.NumberFormat('en-TZ', {
  style: 'currency',
  currency: 'TZS',
  maximumFractionDigits: 0,
}).format(Number(value || 0));

// Mirrors computeBusinessBalance in src/context/StoreContext.jsx - keep in sync.
export function computeBusinessBalance(transactions) {
  let capitalIn = 0, accountPurchase = 0, psnDeposit = 0, slotSale = 0, withdrawal = 0, expense = 0, adjustment = 0;
  transactions.forEach((t) => {
    const amount = Number(t.amount || 0);
    switch (t.type) {
      case 'capital_in': capitalIn += amount; break;
      case 'account_purchase': accountPurchase += amount; break;
      case 'psn_deposit': psnDeposit += amount; break;
      case 'slot_sale': slotSale += amount; break;
      case 'withdrawal': withdrawal += amount; break;
      case 'expense': expense += amount; break;
      case 'adjustment': adjustment += amount; break;
      default: break;
    }
  });
  return Math.max(0, (capitalIn + slotSale + adjustment) - (accountPurchase + psnDeposit + withdrawal + expense));
}

// Mirrors the walletStats useMemo in StoreContext.jsx.
export function computeWalletStats(transactions, accounts) {
  let capitalIn = 0, accountPurchase = 0, psnDeposit = 0, slotSale = 0, withdrawal = 0, expense = 0, adjustment = 0;
  transactions.forEach((t) => {
    const amount = Number(t.amount || 0);
    switch (t.type) {
      case 'capital_in': capitalIn += amount; break;
      case 'account_purchase': accountPurchase += amount; break;
      case 'psn_deposit': psnDeposit += amount; break;
      case 'slot_sale': slotSale += amount; break;
      case 'withdrawal': withdrawal += amount; break;
      case 'expense': expense += amount; break;
      case 'adjustment': adjustment += amount; break;
      default: break;
    }
  });
  const balance = computeBusinessBalance(transactions);
  const psnWalletsBalance = accounts.reduce((sum, acc) => sum + (Number(acc.psnDeposits || 0) - Number(acc.psnGamePurchases || 0)), 0);
  const totalInvested = accountPurchase + psnDeposit + expense;
  const revenue = slotSale;
  const profit = revenue + psnWalletsBalance - totalInvested;
  const cashIn = capitalIn + slotSale + adjustment;
  const cashOut = accountPurchase + psnDeposit + withdrawal + expense;
  return { balance, cashIn, cashOut, capitalIn, accountPurchase, psnDeposit, slotSale, withdrawal, expense, adjustment, psnWalletsBalance, totalInvested, revenue, profit, totalSpent: totalInvested };
}

// Mirrors getAccountStats in StoreContext.jsx.
export function getAccountStats(account, transactions) {
  const expenseTotal = transactions
    .filter((t) => t.accountId === account.id && t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalInvested = Number(account.purchaseCost || 0) + Number(account.psnDeposits || 0) + expenseTotal;
  const psnBalance = Number(account.psnDeposits || 0) - Number(account.psnGamePurchases || 0);
  const profit = Number(account.revenue || 0) + psnBalance - totalInvested;
  return { totalInvested, psnBalance, profit };
}

export function assertSufficientBusinessBalance(amount, transactions) {
  const balance = computeBusinessBalance(transactions);
  if (amount > balance) {
    throw new Error(
      balance <= 0
        ? `Not enough money. Business wallet balance is ${formatTzs(balance)}. Add capital before spending.`
        : `Not enough money. Business wallet balance is ${formatTzs(balance)}. You can spend up to ${formatTzs(balance)}.`
    );
  }
}

// Mirrors chooseSlot's pick order in SellSlot.jsx: normal slot first, then reset.
export function pickAvailableSlot(account, consoleType) {
  const slots = account.slots[consoleType] || [];
  return slots.find((s) => s.type === 'normal' && s.status === 'available')
    || slots.find((s) => s.type === 'reset' && s.status === 'available')
    || null;
}

// Mirrors hasOnlineSale in Accounts.jsx / SellSlot.jsx.
export function hasOnlineSale(transactions, accountId, consoleType) {
  return transactions.some((t) =>
    t.type === 'slot_sale' && t.saleType === 'online_only' && t.accountId === accountId && t.console === consoleType);
}

export const SALE_TYPE_LABELS = {
  offline_online: 'offline + online slot',
  offline_only: 'offline-only slot',
  online_only: 'online-only copy',
};

export function buildSaleNote({ gameName, payment, saleType, note }) {
  if (note?.trim()) return note.trim();
  const paymentTag = payment && payment !== 'paid' ? ` (${payment})` : '';
  const copyTag = saleType && saleType !== 'offline_online' ? ` [${SALE_TYPE_LABELS[saleType]}]` : '';
  return `Sold slot for game: ${gameName}${paymentTag}${copyTag}`;
}

export function resolveAccount(accounts, { id, email }) {
  if (id) {
    const byId = accounts.find((a) => a.id === id);
    if (!byId) throw new Error(`No account found with id "${id}".`);
    return byId;
  }
  if (email) {
    const needle = email.trim().toLowerCase();
    const matches = accounts.filter((a) => a.email.toLowerCase().includes(needle));
    if (matches.length === 0) throw new Error(`No account found matching email "${email}".`);
    if (matches.length > 1 && !matches.some((a) => a.email.toLowerCase() === needle)) {
      throw new Error(`Multiple accounts match "${email}": ${matches.map((a) => a.email).join(', ')}. Use the exact email or the account id.`);
    }
    return matches.find((a) => a.email.toLowerCase() === needle) || matches[0];
  }
  throw new Error('Provide either an account id or an account email.');
}

export function resolveGame(games, { id, name }) {
  if (id) {
    const byId = games.find((g) => g.id === id);
    if (!byId) throw new Error(`No game found with id "${id}".`);
    return byId;
  }
  if (name) {
    const needle = name.trim().toLowerCase();
    const exact = games.find((g) => g.name.toLowerCase() === needle);
    if (exact) return exact;
    const partial = games.filter((g) => g.name.toLowerCase().includes(needle));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) throw new Error(`Multiple games match "${name}": ${partial.map((g) => g.name).join(', ')}. Be more specific.`);
    throw new Error(`No game found matching "${name}". Use add_game to create it first.`);
  }
  throw new Error('Provide either a game id or a game name.');
}

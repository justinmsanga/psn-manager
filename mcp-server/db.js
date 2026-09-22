import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in ../.env.local).'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
export const ADMIN_NAME = process.env.MCP_ADMIN_NAME || 'MCP Agent';

export const today = () => new Date().toISOString().split('T')[0];
export const plusSixMonths = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return date.toISOString().split('T')[0];
};
export const isFutureDate = (dateString) =>
  Boolean(dateString) && new Date(`${dateString}T23:59:59`) > new Date();

export const dbGameToUi = (game) => ({
  id: game.id,
  name: game.name,
  defaultPs4Price: Number(game.default_ps4_price || 0),
  defaultPs5Price: Number(game.default_ps5_price || 0),
});

export const dbSlotToUi = (slot) => ({
  id: slot.id,
  console: slot.console,
  slotNumber: slot.slot_number,
  type: slot.slot_type,
  status: slot.status,
  price: Number(slot.price || 0),
  customer: slot.customer || '',
  date: slot.sold_date || '',
  resetCycle: slot.reset_cycle || 0,
});

export const dbAccountToUi = (account) => {
  const accountGames = account.account_games || [];
  const slots = account.slots || [];
  return {
    id: account.id,
    email: account.email,
    password: account.password || '',
    region: account.region || 'US',
    condition: account.condition || 'clean',
    status: account.status || 'active',
    notes: account.notes || '',
    purchaseCost: Number(account.purchase_cost || 0),
    psnDeposits: Number(account.psn_deposits || 0),
    psnGamePurchases: Number(account.psn_game_purchases || 0),
    revenue: Number(account.revenue || 0),
    games: accountGames.map((item) => item.game_id),
    gameDetails: accountGames.map((item) => item.games).filter(Boolean).map(dbGameToUi),
    slots: {
      ps4: slots.filter((slot) => slot.console === 'ps4').sort((a, b) => a.slot_number - b.slot_number || a.reset_cycle - b.reset_cycle).map(dbSlotToUi),
      ps5: slots.filter((slot) => slot.console === 'ps5').sort((a, b) => a.slot_number - b.slot_number || a.reset_cycle - b.reset_cycle).map(dbSlotToUi),
    },
    lastDeactivation: account.last_deactivation,
    nextDeactivation: account.next_deactivation,
    createdAt: account.created_at?.split('T')[0] || today(),
  };
};

export const dbTransactionToUi = (tx) => ({
  id: tx.id,
  type: tx.type,
  amount: Number(tx.amount || 0),
  date: tx.transaction_date,
  accountId: tx.account_id,
  slotId: tx.slot_id,
  gameId: tx.game_id,
  customer: tx.customer || '',
  note: tx.note || '',
  admin: tx.admin || 'Admin',
  saleType: tx.sale_type || 'offline_online',
  console: tx.console || null,
});

const ACCOUNT_SELECT = '*, account_games(game_id, purchase_price, purchase_date, games(*)), slots(*)';

export async function fetchGames() {
  const { data, error } = await supabase.from('games').select('*').order('name');
  if (error) throw error;
  return data.map(dbGameToUi);
}

export async function fetchAccounts() {
  const { data, error } = await supabase.from('accounts').select(ACCOUNT_SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(dbAccountToUi);
}

export async function fetchAccountRaw(id) {
  const { data, error } = await supabase.from('accounts').select(ACCOUNT_SELECT).eq('id', id).single();
  if (error) throw error;
  return dbAccountToUi(data);
}

export async function fetchTransactions({ limit } = {}) {
  let query = supabase.from('money_transactions').select('*').order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(dbTransactionToUi);
}

export async function logActivity(action, entityType, entityId, metadata = {}) {
  const { error } = await supabase.from('activity_log').insert({
    actor: ADMIN_NAME,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    metadata,
  });
  if (error) console.error('Activity log skipped:', error.message);
}

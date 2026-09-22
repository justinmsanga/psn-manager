import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { fetchGames, fetchAccounts, fetchAccountRaw, fetchTransactions } from './db.js';
import { computeWalletStats, getAccountStats, resolveAccount, resolveGame, formatTzs } from './logic.js';
import {
  recordTransaction, sellSlot, buyGameForAccount, markDeactivated,
  addAccount, createGame, updateAccount, deleteAccount,
} from './ops.js';

const server = new McpServer({ name: 'psn-manager', version: '1.0.0' });

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const errorText = (error) => ({ isError: true, content: [{ type: 'text', text: error.message || String(error) }] });

const accountRef = {
  account_id: z.string().uuid().optional().describe('Account id (from list_accounts / get_account).'),
  account_email: z.string().optional().describe('Account email or a fragment of it, if you don\'t have the id.'),
};
const gameRef = {
  game_id: z.string().uuid().optional().describe('Game id (from list_games).'),
  game_name: z.string().optional().describe('Game name (exact or unambiguous partial match), if you don\'t have the id.'),
};

// ---- read tools --------------------------------------------------------

server.registerTool('list_games', {
  title: 'List games',
  description: 'List every game in the catalog, with default PS4/PS5 slot prices.',
  inputSchema: {},
}, async () => {
  try {
    const games = await fetchGames();
    return text(games);
  } catch (error) { return errorText(error); }
});

server.registerTool('list_accounts', {
  title: 'List PSN accounts',
  description: 'List PSN accounts with their slot status (PS4/PS5 normal+reset availability) and money stats (invested, revenue, profit/loss, PSN wallet balance). Optionally filter by a search term matched against email/region/condition.',
  inputSchema: {
    query: z.string().optional().describe('Filter accounts whose email/region/condition contains this text (case-insensitive).'),
  },
}, async ({ query }) => {
  try {
    const [accounts, transactions] = await Promise.all([fetchAccounts(), fetchTransactions()]);
    const needle = query?.trim().toLowerCase();
    const filtered = needle ? accounts.filter((a) => `${a.email} ${a.region} ${a.condition}`.toLowerCase().includes(needle)) : accounts;
    const summarized = filtered.map((a) => ({
      id: a.id,
      email: a.email,
      region: a.region,
      condition: a.condition,
      status: a.status,
      games: a.gameDetails.map((g) => g.name),
      slots: {
        ps4: a.slots.ps4.map((s) => `${s.type}:${s.status}`),
        ps5: a.slots.ps5.map((s) => `${s.type}:${s.status}`),
      },
      ...getAccountStats(a, transactions),
      revenue: a.revenue,
      nextDeactivation: a.nextDeactivation,
    }));
    return text(summarized);
  } catch (error) { return errorText(error); }
});

server.registerTool('get_account', {
  title: 'Get one account in full detail',
  description: 'Get full detail for one PSN account: every slot (id, console, type, status, price, customer), games, and money stats. Use this before selling a slot to see exact slot ids/status.',
  inputSchema: accountRef,
}, async ({ account_id, account_email }) => {
  try {
    const accounts = await fetchAccounts();
    const account = resolveAccount(accounts, { id: account_id, email: account_email });
    const transactions = await fetchTransactions();
    return text({ ...account, stats: getAccountStats(account, transactions) });
  } catch (error) { return errorText(error); }
});

server.registerTool('get_dashboard_stats', {
  title: 'Get business dashboard stats',
  description: 'Get the business-wide money picture: wallet balance, cash in/out, sales revenue, total invested, locked PSN wallet money, and overall profit - matches the app\'s Dashboard/Money screens exactly.',
  inputSchema: {},
}, async () => {
  try {
    const [transactions, accounts] = await Promise.all([fetchTransactions(), fetchAccounts()]);
    const stats = computeWalletStats(transactions, accounts);
    const formatted = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, formatTzs(v)]));
    return text({ raw: stats, formatted });
  } catch (error) { return errorText(error); }
});

server.registerTool('list_transactions', {
  title: 'List recent money transactions',
  description: 'List recent money transactions (capital_in, account_purchase, psn_deposit, slot_sale, withdrawal, expense, adjustment), newest first.',
  inputSchema: {
    limit: z.number().int().positive().max(200).default(25).describe('Max number of transactions to return.'),
    type: z.enum(['capital_in', 'account_purchase', 'psn_deposit', 'slot_sale', 'withdrawal', 'expense', 'adjustment']).optional(),
    account_id: z.string().uuid().optional(),
  },
}, async ({ limit, type, account_id }) => {
  try {
    let txs = await fetchTransactions({ limit: type || account_id ? undefined : limit });
    if (type) txs = txs.filter((t) => t.type === type);
    if (account_id) txs = txs.filter((t) => t.accountId === account_id);
    return text(txs.slice(0, limit));
  } catch (error) { return errorText(error); }
});

// ---- write tools --------------------------------------------------------

server.registerTool('add_game', {
  title: 'Add or update a game',
  description: 'Add a new game to the catalog, or update its default PS4/PS5 slot prices if it already exists (matched by exact name).',
  inputSchema: {
    name: z.string().min(1),
    default_ps4_price: z.number().nonnegative().optional(),
    default_ps5_price: z.number().nonnegative().optional(),
  },
}, async ({ name, default_ps4_price, default_ps5_price }) => {
  try {
    const game = await createGame({ name, defaultPs4Price: default_ps4_price, defaultPs5Price: default_ps5_price });
    return text({ created_or_updated: game });
  } catch (error) { return errorText(error); }
});

server.registerTool('add_account', {
  title: 'Buy / add a PSN account',
  description: 'Record buying a new PSN account: creates the account with 3 PS4 + 3 PS5 slots (2 normal + 1 locked reset each), optionally attaches existing games, and records the purchase cost as an account_purchase expense from the business wallet.',
  inputSchema: {
    email: z.string().email(),
    password: z.string().optional(),
    region: z.enum(['US', 'UK', 'TR', 'JP']).default('US'),
    cost: z.number().nonnegative().describe('Purchase cost in TZS. Must not exceed the current business wallet balance.'),
    notes: z.string().optional(),
    game_ids: z.array(z.string().uuid()).optional().describe('Ids of games already on this account (from list_games).'),
  },
}, async ({ email, password, region, cost, notes, game_ids }) => {
  try {
    const account = await addAccount({ email, password, region, cost, notes, gameIds: game_ids || [] });
    return text({ created: account });
  } catch (error) { return errorText(error); }
});

server.registerTool('update_account', {
  title: 'Update an account',
  description: 'Update an existing account\'s condition, status, notes, password, region, or purchase cost. Increasing purchase cost must not exceed the current business wallet balance.',
  inputSchema: {
    ...accountRef,
    condition: z.enum(['clean', 'warning', 'issue', 'archived']).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    notes: z.string().optional(),
    password: z.string().optional(),
    region: z.enum(['US', 'UK', 'TR', 'JP']).optional(),
    purchase_cost: z.number().nonnegative().optional(),
  },
}, async ({ account_id, account_email, condition, status, notes, password, region, purchase_cost }) => {
  try {
    const accounts = await fetchAccounts();
    const account = resolveAccount(accounts, { id: account_id, email: account_email });
    const updated = await updateAccount(account, { condition, status, notes, password, region, purchaseCost: purchase_cost });
    return text({ updated });
  } catch (error) { return errorText(error); }
});

server.registerTool('delete_account', {
  title: 'Delete an account',
  description: 'Permanently delete a PSN account and all its slots, game links, and money transactions. This cannot be undone - confirm with the user before calling this.',
  inputSchema: accountRef,
}, async ({ account_id, account_email }) => {
  try {
    const accounts = await fetchAccounts();
    const account = resolveAccount(accounts, { id: account_id, email: account_email });
    await deleteAccount(account.id);
    return text(`Deleted account ${account.email} and all its slots/transactions.`);
  } catch (error) { return errorText(error); }
});

server.registerTool('sell_slot', {
  title: 'Sell a PS4/PS5 slot or online-only copy',
  description: 'Record a sale for a game on a PSN account. sale_type "offline_online" or "offline_only" consumes the next available normal (then reset) slot on the given console - fails if none is available. sale_type "online_only" needs no physical slot and works even when the console is sold out, but fails if that console\'s online-only copy was already sold on this account.',
  inputSchema: {
    ...accountRef,
    ...gameRef,
    console: z.enum(['ps4', 'ps5']),
    sale_type: z.enum(['offline_online', 'offline_only', 'online_only']).default('offline_online'),
    price: z.number().positive().describe('The actual negotiated sale price in TZS.'),
    customer: z.string().optional(),
    payment: z.enum(['paid', 'partial', 'unpaid']).default('paid'),
    note: z.string().optional(),
  },
}, async ({ account_id, account_email, game_id, game_name, console: consoleType, sale_type, price, customer, payment, note }) => {
  try {
    const [accounts, games] = await Promise.all([fetchAccounts(), fetchGames()]);
    const account = resolveAccount(accounts, { id: account_id, email: account_email });
    const game = resolveGame(games, { id: game_id, name: game_name });
    const tx = await sellSlot({ account, game, consoleType, saleType: sale_type, price, customer, note, payment });
    return text({ sold: tx });
  } catch (error) { return errorText(error); }
});

server.registerTool('buy_game_for_account', {
  title: 'Buy a game using an account\'s PSN wallet',
  description: 'Spend from an account\'s PSN wallet balance (deposits minus prior game purchases) to buy/attach a game on that account. Fails if the PSN wallet balance is insufficient.',
  inputSchema: {
    ...accountRef,
    ...gameRef,
    cost: z.number().positive(),
  },
}, async ({ account_id, account_email, game_id, game_name, cost }) => {
  try {
    const [accounts, games] = await Promise.all([fetchAccounts(), fetchGames()]);
    const account = resolveAccount(accounts, { id: account_id, email: account_email });
    const game = resolveGame(games, { id: game_id, name: game_name });
    await buyGameForAccount({ account, game, cost });
    return text(`Bought "${game.name}" for ${account.email} using ${cost} from its PSN wallet.`);
  } catch (error) { return errorText(error); }
});

server.registerTool('record_transaction', {
  title: 'Record a money transaction',
  description: 'Record a business-wallet money movement: capital_in (owner adds capital), withdrawal (owner takes profit out), expense (a cost, optionally tied to an account), adjustment (manual correction), or psn_deposit (top up an account\'s PSN wallet - requires account_id/account_email). capital_in/adjustment add to the wallet; account_purchase/psn_deposit/withdrawal/expense are checked against the current wallet balance and fail if insufficient.',
  inputSchema: {
    type: z.enum(['capital_in', 'withdrawal', 'expense', 'adjustment', 'psn_deposit']),
    amount: z.number().positive(),
    ...accountRef,
    note: z.string().optional(),
  },
}, async ({ type, amount, account_id, account_email, note }) => {
  try {
    let resolvedAccountId = account_id || null;
    if (!resolvedAccountId && account_email) {
      const accounts = await fetchAccounts();
      resolvedAccountId = resolveAccount(accounts, { email: account_email }).id;
    }
    if (type === 'psn_deposit' && !resolvedAccountId) throw new Error('psn_deposit requires account_id or account_email.');
    const tx = await recordTransaction({ type, amount, accountId: resolvedAccountId, note });
    return text({ recorded: tx });
  } catch (error) { return errorText(error); }
});

server.registerTool('mark_deactivated', {
  title: 'Mark an account deactivated (start a reset cycle)',
  description: 'Mark a PSN account as deactivated to unlock its reset slot(s), starting the 6-month cycle for the next deactivation. Fails if both normal PS4 and PS5 slots aren\'t sold yet, if a reset slot is still available unsold, or if the account isn\'t eligible yet.',
  inputSchema: accountRef,
}, async ({ account_id, account_email }) => {
  try {
    const accounts = await fetchAccounts();
    const account = resolveAccount(accounts, { id: account_id, email: account_email });
    const result = await markDeactivated(account);
    return text({ account: account.email, ...result });
  } catch (error) { return errorText(error); }
});

const transport = new StdioServerTransport();
await server.connect(transport);

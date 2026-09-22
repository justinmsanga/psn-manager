# PSN Manager MCP server

Exposes PSN Manager's business operations as MCP tools, backed by the same Supabase database as the app. Any MCP-aware agent (Claude Code, Claude Desktop, etc.) can use it to add games, buy accounts, record sales, and check the books - with the same validation rules as the app (insufficient balance, no available slot, etc. all raise the same errors you'd see in the UI).

## Setup

```
cd mcp-server
npm install
```

Credentials are read from `../.env.local` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`), the same file the frontend uses. No extra config needed.

This project's `.mcp.json` already registers it for Claude Code - just approve it the first time you're prompted.

## Tools

**Read-only**
- `list_games` - full game catalog
- `list_accounts` - accounts with slot status + money stats, optional search
- `get_account` - one account in full detail (every slot id/status)
- `get_dashboard_stats` - business wallet balance, cash in/out, revenue, profit
- `list_transactions` - recent money transactions, filterable by type/account

**Write**
- `add_game` - add a game or update its default PS4/PS5 prices
- `add_account` - buy/add an account (creates the 6 default slots, records the purchase cost)
- `update_account` - edit condition/status/notes/password/region/purchase cost
- `delete_account` - permanently delete an account and everything tied to it
- `sell_slot` - sell a normal/reset slot, or an online-only copy, for a game on an account
- `buy_game_for_account` - spend from an account's PSN wallet to buy a game
- `record_transaction` - capital_in / withdrawal / expense / adjustment / psn_deposit
- `mark_deactivated` - start a reset cycle once both normal slots per console are sold

Accounts and games can be referenced by id or by a fuzzy email/name match (`account_email`, `game_name`) - handy when you don't have the id handy.

## Keeping this in sync

The formulas here (`logic.js`) are deliberately copy-pasted from `src/context/StoreContext.jsx`, not imported, since this is a standalone Node process outside the Vite/React build. If you change a money formula or a business rule in `StoreContext.jsx`, mirror the change here too - `logic.js` and `ops.js` have comments pointing at the app code they were ported from.

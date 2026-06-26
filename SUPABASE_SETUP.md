# PSN Manager Supabase Setup

## Current Project

Supabase URL is configured in `.env.local`.

The frontend is wired to Supabase. If the database tables do not exist yet, the app falls back to mock data.

## Required Setup

Open Supabase SQL Editor for your project and run these files in order:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

After running both files, refresh the app at:

```text
http://127.0.0.1:5173
```

The app should then load real Supabase data instead of mock data.

## Important Security Note

The current schema includes prototype grants that allow the frontend anon key to read and write data.

Before production, replace this with Supabase Auth and stricter RLS policies for the two admins.

## Tables Created

- admins
- games
- accounts
- account_games
- slots
- money_transactions
- reset_cycles
- activity_log

## App Behavior

The frontend now supports Supabase for:

- Loading games
- Loading accounts
- Loading slots
- Loading money transactions
- Adding accounts
- Creating default PS4/PS5 slots
- Recording money transactions
- Recording PSN deposits
- Recording slot sales
- Recording game purchases
- Marking accounts deactivated

## Next Database Work

After the schema is live, the next improvements should be:

- Supabase Auth for the two admins
- Better Buy Game flow with custom game creation
- Repeated reset-cycle slot creation after each 6-month reset
- Google Sheets backup sync
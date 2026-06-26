-- Run this in Supabase SQL Editor if saves fail with RLS errors.
-- PSN Manager prototype: allow the frontend anon key to read/write all tables.

alter table public.admins disable row level security;
alter table public.games disable row level security;
alter table public.accounts disable row level security;
alter table public.account_games disable row level security;
alter table public.slots disable row level security;
alter table public.money_transactions disable row level security;
alter table public.reset_cycles disable row level security;
alter table public.activity_log disable row level security;

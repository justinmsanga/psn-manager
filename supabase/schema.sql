-- PSN Manager Supabase schema
-- Run this in Supabase SQL Editor for project wvowvuxzirfoqfftwugz.
-- Prototype note: these grants allow the frontend anon key to read/write.
-- Before production, replace with Supabase Auth + stricter RLS policies.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_ps4_price numeric(12,2) not null default 0,
  default_ps5_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text,
  region text not null default 'US',
  condition text not null default 'clean',
  status text not null default 'active',
  notes text,
  purchase_cost numeric(12,2) not null default 0,
  psn_deposits numeric(12,2) not null default 0,
  psn_game_purchases numeric(12,2) not null default 0,
  revenue numeric(12,2) not null default 0,
  last_deactivation date,
  next_deactivation date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_games (
  account_id uuid not null references public.accounts(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  purchase_price numeric(12,2) not null default 0,
  purchase_date date not null default current_date,
  primary key (account_id, game_id)
);

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  console text not null check (console in ('ps4', 'ps5')),
  slot_number integer not null,
  slot_type text not null check (slot_type in ('normal', 'reset')),
  status text not null default 'available' check (status in ('available', 'sold', 'locked', 'issue')),
  price numeric(12,2) not null default 0,
  customer text,
  sold_date date,
  reset_cycle integer not null default 0,
  created_at timestamptz not null default now(),
  unique (account_id, console, slot_number, reset_cycle)
);

create table if not exists public.money_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('capital_in', 'account_purchase', 'psn_deposit', 'slot_sale', 'withdrawal', 'expense', 'adjustment')),
  amount numeric(12,2) not null check (amount >= 0),
  account_id uuid references public.accounts(id) on delete set null,
  slot_id uuid references public.slots(id) on delete set null,
  game_id uuid references public.games(id) on delete set null,
  customer text,
  note text,
  admin text not null default 'Admin',
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.reset_cycles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deactivated_at date not null default current_date,
  next_available_at date not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'Admin',
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounts_email on public.accounts using gin (to_tsvector('simple', email));
create index if not exists idx_accounts_region on public.accounts(region);
create index if not exists idx_accounts_status on public.accounts(status);
create index if not exists idx_accounts_next_deactivation on public.accounts(next_deactivation);
create index if not exists idx_slots_account_status on public.slots(account_id, status);
create index if not exists idx_slots_console_status on public.slots(console, status);
create index if not exists idx_money_transactions_date on public.money_transactions(transaction_date desc);
create index if not exists idx_account_games_game on public.account_games(game_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_accounts_updated_at on public.accounts;
create trigger touch_accounts_updated_at
before update on public.accounts
for each row execute function public.touch_updated_at();

-- Prototype grants. Tighten before production.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Supabase enables RLS by default on new projects. Disable for this prototype.
-- Before production, enable RLS and replace with Supabase Auth policies.
alter table public.admins disable row level security;
alter table public.games disable row level security;
alter table public.accounts disable row level security;
alter table public.account_games disable row level security;
alter table public.slots disable row level security;
alter table public.money_transactions disable row level security;
alter table public.reset_cycles disable row level security;
alter table public.activity_log disable row level security;

insert into public.admins (name, role) values
  ('Admin 1', 'admin'),
  ('Admin 2', 'admin')
on conflict do nothing;
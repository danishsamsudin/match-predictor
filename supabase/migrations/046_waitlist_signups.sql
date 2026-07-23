-- Waitlist / signup interest collection (no auth accounts yet).
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  username text,
  full_name text,
  phone text,
  country text,
  plan text,
  source text not null default 'pricing',
  marketing_opt_in boolean not null default false,
  age_confirmed boolean,
  accept_terms boolean,
  accept_privacy boolean,
  accept_disclaimer boolean,
  password_provided boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_signups_email_idx on public.waitlist_signups (email);
create index if not exists waitlist_signups_created_at_idx on public.waitlist_signups (created_at desc);

alter table public.waitlist_signups enable row level security;

-- Service role inserts from API; no public read/write policies.

-- Beta access accounts: signup stores hashed password; status must be accepted to sign in.
create table if not exists public.beta_access (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  username text not null,
  full_name text,
  phone text,
  country text,
  plan text,
  billing text,
  password_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  marketing_opt_in boolean not null default false,
  age_confirmed boolean,
  accept_terms boolean,
  accept_privacy boolean,
  accept_disclaimer boolean,
  source text not null default 'signup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists beta_access_email_uidx
  on public.beta_access (lower(email));

create unique index if not exists beta_access_username_uidx
  on public.beta_access (lower(username));

create index if not exists beta_access_status_idx
  on public.beta_access (status);

create index if not exists beta_access_created_at_idx
  on public.beta_access (created_at desc);

alter table public.beta_access enable row level security;

-- Service role only from API; no public policies.

comment on table public.beta_access is
  'Beta applicants. Flip status to accepted in Table Editor to unlock login.';

comment on column public.beta_access.status is
  'pending | accepted | rejected. Only accepted users can sign in (plus env operator override).';

-- LGPD patch (idempotente)
-- Execute este script no SQL Editor do Supabase.

alter table if exists owners
  add column if not exists lgpd_consent_at timestamptz;

alter table if exists owners
  add column if not exists lgpd_consent_version text not null default 'v1';

alter table if exists owners
  add column if not exists lgpd_consent_ip text not null default '';

alter table if exists owners
  add column if not exists terms_accepted_at timestamptz;

alter table if exists owners
  add column if not exists terms_accepted_version text not null default 'v1';

alter table if exists owners
  add column if not exists terms_accepted_ip text not null default '';

alter table if exists owners
  add column if not exists privacy_accepted_at timestamptz;

alter table if exists owners
  add column if not exists privacy_accepted_version text not null default 'v1';

alter table if exists owners
  add column if not exists privacy_accepted_ip text not null default '';

alter table if exists pets
  add column if not exists is_public boolean not null default true;

create table if not exists data_deletion_requests (
  id text primary key,
  owner_id text not null references owners(id) on delete cascade,
  requested_by_email text not null default '',
  request_ip text not null default '',
  status text not null default 'pending',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_deletion_requests_status_check
    check (status in ('pending', 'processing', 'completed', 'rejected'))
);

create index if not exists idx_data_deletion_requests_owner_id
  on data_deletion_requests(owner_id);

create index if not exists idx_data_deletion_requests_status
  on data_deletion_requests(status);

alter table if exists data_deletion_requests enable row level security;

drop policy if exists "data_deletion_requests select own" on data_deletion_requests;
drop policy if exists "data_deletion_requests insert own" on data_deletion_requests;

create policy "data_deletion_requests select own" on data_deletion_requests
  for select
  to authenticated
  using (owner_id = auth.uid()::text);

create policy "data_deletion_requests insert own" on data_deletion_requests
  for insert
  to authenticated
  with check (owner_id = auth.uid()::text);

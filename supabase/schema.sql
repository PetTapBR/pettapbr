-- PETTAPBR baseline schema for Supabase
-- Demo-friendly policies so uploads and CRUD work with anon key.

create table if not exists owners (
  id text primary key,
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  plan_tier text not null default 'start',
  plan_status text not null default 'active',
  plan_provider text not null default 'manual',
  asaas_customer_id text not null default '',
  asaas_subscription_id text not null default '',
  asaas_last_payment_id text not null default '',
  asaas_last_payment_url text not null default '',
  asaas_last_processed_payment_id text not null default '',
  asaas_pending_months integer not null default 0,
  plan_expires_at timestamptz,
  plan_updated_at timestamptz not null default now(),
  alerts_receive_lost boolean not null default false,
  alerts_radius_km integer not null default 5,
  alerts_location_lat double precision,
  alerts_location_lng double precision,
  alerts_location_label text not null default '',
  created_at timestamptz not null default now()
);

alter table owners add column if not exists plan_tier text not null default 'start';
alter table owners add column if not exists plan_status text not null default 'active';
alter table owners add column if not exists plan_provider text not null default 'manual';
alter table owners add column if not exists asaas_customer_id text not null default '';
alter table owners add column if not exists asaas_subscription_id text not null default '';
alter table owners add column if not exists asaas_last_payment_id text not null default '';
alter table owners add column if not exists asaas_last_payment_url text not null default '';
alter table owners add column if not exists asaas_last_processed_payment_id text not null default '';
alter table owners add column if not exists asaas_pending_months integer not null default 0;
alter table owners add column if not exists plan_expires_at timestamptz;
alter table owners add column if not exists plan_updated_at timestamptz not null default now();
alter table owners add column if not exists alerts_receive_lost boolean not null default false;
alter table owners add column if not exists alerts_radius_km integer not null default 5;
alter table owners add column if not exists alerts_location_lat double precision;
alter table owners add column if not exists alerts_location_lng double precision;
alter table owners add column if not exists alerts_location_label text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'owners_plan_tier_check'
  ) then
    alter table owners
      add constraint owners_plan_tier_check check (plan_tier in ('start', 'pro'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'owners_plan_status_check'
  ) then
    alter table owners
      add constraint owners_plan_status_check check (plan_status in ('active', 'inactive'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'owners_plan_provider_check'
  ) then
    alter table owners
      add constraint owners_plan_provider_check check (plan_provider in ('manual', 'asaas'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'owners_asaas_pending_months_check'
  ) then
    alter table owners
      add constraint owners_asaas_pending_months_check check (asaas_pending_months >= 0);
  end if;
end
$$;

create table if not exists pets (
  id text primary key,
  owner_id text not null references owners(id) on delete cascade,
  slug text not null unique,
  name text not null,
  bio text not null default '',
  age text not null default '',
  breed text not null default '',
  weight text not null default '',
  city text not null default '',
  avatar_url text not null,
  whatsapp text not null,
  phone text not null default '',
  location_url text not null default '',
  location_lat double precision,
  location_lng double precision,
  location_label text not null default '',
  reward text not null default '',
  status text not null check (status in ('safe', 'lost', 'found')),
  allergies text not null default '',
  medications text not null default '',
  vaccines text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pet_media (
  id text primary key,
  pet_id text not null references pets(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video')),
  url text not null,
  caption text not null default ''
);

create table if not exists nfc_tags (
  id text primary key,
  code text not null unique,
  activation_code text not null,
  owner_id text references owners(id) on delete set null,
  pet_id text references pets(id) on delete set null,
  status text not null check (status in ('unlinked', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scan_events (
  id text primary key,
  pet_id text not null references pets(id) on delete cascade,
  owner_id text not null references owners(id) on delete cascade,
  source text not null check (source in ('nfc', 'direct')),
  viewer_location text not null default '',
  accessed_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  owner_id text not null references owners(id) on delete cascade,
  pet_id text not null references pets(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id text primary key,
  owner_id text not null references owners(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pets_owner_id on pets(owner_id);
create index if not exists idx_nfc_tags_owner_id on nfc_tags(owner_id);
create index if not exists idx_nfc_tags_pet_id on nfc_tags(pet_id);
create unique index if not exists uq_nfc_tags_pet_id_one_tag_per_pet
  on nfc_tags(pet_id)
  where pet_id is not null;
create unique index if not exists nfc_tags_activation_code_key
  on nfc_tags(activation_code);
create index if not exists idx_scan_events_owner_id on scan_events(owner_id);
create index if not exists idx_notifications_owner_id on notifications(owner_id);
create index if not exists idx_push_subscriptions_owner_id on push_subscriptions(owner_id);
create index if not exists idx_push_subscriptions_active on push_subscriptions(active);

alter table owners enable row level security;
alter table pets enable row level security;
alter table pet_media enable row level security;
alter table nfc_tags enable row level security;
alter table scan_events enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;

-- Remove old policies if they exist
DROP POLICY IF EXISTS "owners can read own profile" ON owners;
DROP POLICY IF EXISTS "owners can manage own pets" ON pets;
DROP POLICY IF EXISTS "owners can manage own pet media" ON pet_media;
DROP POLICY IF EXISTS "owners public all" ON owners;
DROP POLICY IF EXISTS "pets public all" ON pets;
DROP POLICY IF EXISTS "pet_media public all" ON pet_media;
DROP POLICY IF EXISTS "nfc_tags public all" ON nfc_tags;
DROP POLICY IF EXISTS "public can insert scans" ON scan_events;
DROP POLICY IF EXISTS "owners can read own scans" ON scan_events;
DROP POLICY IF EXISTS "scan_events public all" ON scan_events;
DROP POLICY IF EXISTS "owners can manage notifications" ON notifications;
DROP POLICY IF EXISTS "notifications public all" ON notifications;
DROP POLICY IF EXISTS "push_subscriptions public all" ON push_subscriptions;
DROP POLICY IF EXISTS "owners select own" ON owners;
DROP POLICY IF EXISTS "owners insert own" ON owners;
DROP POLICY IF EXISTS "owners update own" ON owners;
DROP POLICY IF EXISTS "owners delete own" ON owners;
DROP POLICY IF EXISTS "pets select own" ON pets;
DROP POLICY IF EXISTS "pets insert own" ON pets;
DROP POLICY IF EXISTS "pets update own" ON pets;
DROP POLICY IF EXISTS "pets delete own" ON pets;
DROP POLICY IF EXISTS "pet_media select own" ON pet_media;
DROP POLICY IF EXISTS "pet_media insert own" ON pet_media;
DROP POLICY IF EXISTS "pet_media update own" ON pet_media;
DROP POLICY IF EXISTS "pet_media delete own" ON pet_media;
DROP POLICY IF EXISTS "nfc_tags select own" ON nfc_tags;
DROP POLICY IF EXISTS "scan_events select own" ON scan_events;
DROP POLICY IF EXISTS "scan_events insert own" ON scan_events;
DROP POLICY IF EXISTS "notifications select own" ON notifications;
DROP POLICY IF EXISTS "notifications insert own" ON notifications;
DROP POLICY IF EXISTS "notifications delete own" ON notifications;
DROP POLICY IF EXISTS "push_subscriptions select own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions insert own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions update own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions delete own" ON push_subscriptions;

-- Owners: each authenticated tutor can only access their own owner row.
create policy "owners select own" on owners
  for select
  to authenticated
  using (id = auth.uid()::text);

create policy "owners insert own" on owners
  for insert
  to authenticated
  with check (id = auth.uid()::text);

create policy "owners update own" on owners
  for update
  to authenticated
  using (id = auth.uid()::text)
  with check (id = auth.uid()::text);

create policy "owners delete own" on owners
  for delete
  to authenticated
  using (id = auth.uid()::text);

-- Pets: tutor only manages own pets.
create policy "pets select own" on pets
  for select
  to authenticated
  using (owner_id = auth.uid()::text);

create policy "pets insert own" on pets
  for insert
  to authenticated
  with check (owner_id = auth.uid()::text);

create policy "pets update own" on pets
  for update
  to authenticated
  using (owner_id = auth.uid()::text)
  with check (owner_id = auth.uid()::text);

create policy "pets delete own" on pets
  for delete
  to authenticated
  using (owner_id = auth.uid()::text);

-- Pet media: access only if the referenced pet belongs to the tutor.
create policy "pet_media select own" on pet_media
  for select
  to authenticated
  using (
    exists (
      select 1
      from pets
      where pets.id = pet_media.pet_id
        and pets.owner_id = auth.uid()::text
    )
  );

create policy "pet_media insert own" on pet_media
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from pets
      where pets.id = pet_media.pet_id
        and pets.owner_id = auth.uid()::text
    )
  );

create policy "pet_media update own" on pet_media
  for update
  to authenticated
  using (
    exists (
      select 1
      from pets
      where pets.id = pet_media.pet_id
        and pets.owner_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from pets
      where pets.id = pet_media.pet_id
        and pets.owner_id = auth.uid()::text
    )
  );

create policy "pet_media delete own" on pet_media
  for delete
  to authenticated
  using (
    exists (
      select 1
      from pets
      where pets.id = pet_media.pet_id
        and pets.owner_id = auth.uid()::text
    )
  );

-- NFC tags: tutor can only see tags already owned by them.
create policy "nfc_tags select own" on nfc_tags
  for select
  to authenticated
  using (owner_id = auth.uid()::text);

-- Scan events: app records accesses only for pets of the current tutor.
create policy "scan_events select own" on scan_events
  for select
  to authenticated
  using (owner_id = auth.uid()::text);

create policy "scan_events insert own" on scan_events
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()::text
    and exists (
      select 1
      from pets
      where pets.id = scan_events.pet_id
        and pets.owner_id = auth.uid()::text
    )
  );

-- Notifications: tutor can read/delete own notifications. Inserts are controlled by owner_id.
create policy "notifications select own" on notifications
  for select
  to authenticated
  using (owner_id = auth.uid()::text);

create policy "notifications insert own" on notifications
  for insert
  to authenticated
  with check (owner_id = auth.uid()::text);

create policy "notifications delete own" on notifications
  for delete
  to authenticated
  using (owner_id = auth.uid()::text);

-- Push subscriptions: tutor can only manage own device subscriptions.
create policy "push_subscriptions select own" on push_subscriptions
  for select
  to authenticated
  using (owner_id = auth.uid()::text);

create policy "push_subscriptions insert own" on push_subscriptions
  for insert
  to authenticated
  with check (owner_id = auth.uid()::text);

create policy "push_subscriptions update own" on push_subscriptions
  for update
  to authenticated
  using (owner_id = auth.uid()::text)
  with check (owner_id = auth.uid()::text);

create policy "push_subscriptions delete own" on push_subscriptions
  for delete
  to authenticated
  using (owner_id = auth.uid()::text);

-- Storage bucket for uploads
insert into storage.buckets (id, name, public)
values ('pet-media', 'pet-media', true)
on conflict (id) do nothing;

-- Storage policies for bucket pet-media
DROP POLICY IF EXISTS "pet-media public read" ON storage.objects;
DROP POLICY IF EXISTS "pet-media public insert" ON storage.objects;
DROP POLICY IF EXISTS "pet-media public update" ON storage.objects;
DROP POLICY IF EXISTS "pet-media public delete" ON storage.objects;
DROP POLICY IF EXISTS "pet-media owner insert" ON storage.objects;
DROP POLICY IF EXISTS "pet-media owner update" ON storage.objects;
DROP POLICY IF EXISTS "pet-media owner delete" ON storage.objects;

-- Public profile pages need read access to photos/videos.
create policy "pet-media public read"
on storage.objects
for select
using (bucket_id = 'pet-media');

-- Authenticated tutor can upload only into own folder: <owner_id>/<pet_id>/...
create policy "pet-media owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pet-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Updates/deletes only on own files in own folder.
create policy "pet-media owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pet-media'
  and owner_id::text = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'pet-media'
  and owner_id::text = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "pet-media owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pet-media'
  and owner_id::text = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- PETTAPBR baseline schema for Supabase
-- Demo-friendly policies so uploads and CRUD work with anon key.

create table if not exists owners (
  id text primary key,
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_pets_owner_id on pets(owner_id);
create index if not exists idx_nfc_tags_owner_id on nfc_tags(owner_id);
create index if not exists idx_nfc_tags_pet_id on nfc_tags(pet_id);
create unique index if not exists uq_nfc_tags_pet_id_one_tag_per_pet
  on nfc_tags(pet_id)
  where pet_id is not null;
create index if not exists idx_scan_events_owner_id on scan_events(owner_id);
create index if not exists idx_notifications_owner_id on notifications(owner_id);

alter table owners enable row level security;
alter table pets enable row level security;
alter table pet_media enable row level security;
alter table nfc_tags enable row level security;
alter table scan_events enable row level security;
alter table notifications enable row level security;

-- Remove old policies if they exist
DROP POLICY IF EXISTS "owners can read own profile" ON owners;
DROP POLICY IF EXISTS "owners can manage own pets" ON pets;
DROP POLICY IF EXISTS "owners can manage own pet media" ON pet_media;
DROP POLICY IF EXISTS "nfc_tags public all" ON nfc_tags;
DROP POLICY IF EXISTS "public can insert scans" ON scan_events;
DROP POLICY IF EXISTS "owners can read own scans" ON scan_events;
DROP POLICY IF EXISTS "owners can manage notifications" ON notifications;

-- Demo-friendly permissive policies
create policy "owners public all" on owners
  for all using (true) with check (true);

create policy "pets public all" on pets
  for all using (true) with check (true);

create policy "pet_media public all" on pet_media
  for all using (true) with check (true);

create policy "nfc_tags public all" on nfc_tags
  for all using (true) with check (true);

create policy "scan_events public all" on scan_events
  for all using (true) with check (true);

create policy "notifications public all" on notifications
  for all using (true) with check (true);

-- Storage bucket for uploads
insert into storage.buckets (id, name, public)
values ('pet-media', 'pet-media', true)
on conflict (id) do nothing;

-- Storage policies for bucket pet-media
DROP POLICY IF EXISTS "pet-media public read" ON storage.objects;
DROP POLICY IF EXISTS "pet-media public insert" ON storage.objects;
DROP POLICY IF EXISTS "pet-media public update" ON storage.objects;
DROP POLICY IF EXISTS "pet-media public delete" ON storage.objects;

create policy "pet-media public read"
on storage.objects for select
using (bucket_id = 'pet-media');

create policy "pet-media public insert"
on storage.objects for insert
with check (bucket_id = 'pet-media');

create policy "pet-media public update"
on storage.objects for update
using (bucket_id = 'pet-media')
with check (bucket_id = 'pet-media');

create policy "pet-media public delete"
on storage.objects for delete
using (bucket_id = 'pet-media');

-- Ejecutar en Supabase SQL Editor. Bucket privado para fotos familiares.
create extension if not exists pgcrypto;

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  event_date date,
  category text default 'Otros',
  summary text,
  cover_path text,
  share_token text unique,
  share_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  title text,
  caption text check (caption is null or char_length(caption) <= 500),
  taken_at date,
  created_at timestamptz not null default now()
);

create index if not exists albums_owner_date_idx on public.albums(owner_id, event_date desc);
create index if not exists photos_album_created_idx on public.photos(album_id, created_at desc);

alter table public.albums enable row level security;
alter table public.photos enable row level security;

drop policy if exists "Owners manage albums" on public.albums;
create policy "Owners manage albums" on public.albums
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Owners manage photos" on public.photos;
create policy "Owners manage photos" on public.photos
for all to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (select 1 from public.albums a where a.id = album_id and a.owner_id = auth.uid())
);

-- Bucket PRIVADO. No usar public=true.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-photos', 'family-photos', false, 15728640, array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do update set public = false, file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic'];

-- El path es <user-id>/<album-id>/<filename>. La política valida el primer segmento.
drop policy if exists "Owner can upload family photos" on storage.objects;
create policy "Owner can upload family photos" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owner can read family photos" on storage.objects;
create policy "Owner can read family photos" on storage.objects
for select to authenticated
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owner can delete family photos" on storage.objects;
create policy "Owner can delete family photos" on storage.objects
for delete to authenticated
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Enlaces compartidos: el token es aleatorio y solo da lectura del álbum compartido.
-- Revocar el enlace invalida las futuras consultas. Los enlaces no caducan automáticamente;
-- el dueño puede revocarlos desde la aplicación/SQL.
create or replace function public.create_album_share(album_id_input uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare new_token text;
begin
  if not exists (select 1 from public.albums where id = album_id_input and owner_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;
  new_token := encode(gen_random_bytes(24), 'hex');
  update public.albums set share_token = new_token, share_enabled = true where id = album_id_input;
  return new_token;
end;
$$;

create or replace function public.revoke_album_share(album_id_input uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.albums set share_enabled = false, share_token = null
  where id = album_id_input and owner_id = auth.uid();
  if not found then raise exception 'Álbum no encontrado o no autorizado'; end if;
  return true;
end;
$$;

create or replace function public.get_shared_album(share_token_input text)
returns table (
  id uuid, title text, description text, event_date date, category text,
  summary text, cover_path text, created_at timestamptz, owner_id uuid,
  share_token text, is_shared boolean
) language sql stable security definer set search_path = public
as $$
  select a.id, a.title, a.description, a.event_date, a.category, a.summary,
         a.cover_path, a.created_at, a.owner_id, a.share_token, a.share_enabled
  from public.albums a
  where a.share_enabled = true and a.share_token = share_token_input
  limit 1;
$$;

create or replace function public.get_shared_photos(album_id_input uuid)
returns table (
  id uuid, album_id uuid, owner_id uuid, storage_path text, title text,
  caption text, taken_at date, created_at timestamptz
) language sql stable security definer set search_path = public
as $$
  select p.id, p.album_id, p.owner_id, p.storage_path, p.title, p.caption, p.taken_at, p.created_at
  from public.photos p join public.albums a on a.id = p.album_id
  where a.id = album_id_input and a.share_enabled = true and a.share_token is not null
  order by p.created_at desc;
$$;

revoke all on function public.create_album_share(uuid) from public;
revoke all on function public.revoke_album_share(uuid) from public;
revoke all on function public.get_shared_album(text) from public;
revoke all on function public.get_shared_photos(uuid) from public;
grant execute on function public.create_album_share(uuid) to authenticated;
grant execute on function public.revoke_album_share(uuid) to authenticated;
grant execute on function public.get_shared_album(text) to anon, authenticated;
grant execute on function public.get_shared_photos(uuid) to anon, authenticated;

-- Los visitantes con enlace necesitan URLs firmadas, no URLs públicas.
-- La Edge Function create-shared-photo-urls debe validar token + álbum antes de firmar.
-- Ver README: la implementación inicial solo firma imágenes al usuario autenticado.

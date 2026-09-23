create table if not exists public.matches (
 game_id uuid primary key,
 imported_at timestamptz not null,
 xml text,
 snapshot jsonb not null,
 summary jsonb not null
);

alter table public.matches enable row level security;
revoke all on public.matches from anon, authenticated;
grant select, insert, update on public.matches to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 2097152,
 array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
 public = excluded.public,
 file_size_limit = excluded.file_size_limit,
 allowed_mime_types = excluded.allowed_mime_types;

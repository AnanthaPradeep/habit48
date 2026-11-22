create table public.routine_activities (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  activity jsonb not null,
  check ((activity ->> 'id') is not distinct from id::text),
  check ((activity ->> 'editedAt') is not distinct from revision::text),
  check (coalesce(jsonb_typeof(activity -> 'points') = 'array', false)),
  check (jsonb_array_length(activity -> 'points') <= 36000)
);

create index routine_activities_owner_id_idx on public.routine_activities (user_id, id);
alter table public.routine_activities enable row level security;
revoke all on table public.routine_activities from public, anon, authenticated;
grant select, insert, update, delete on public.routine_activities to authenticated;

create policy activities_owner_select on public.routine_activities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy activities_owner_insert on public.routine_activities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy activities_owner_update on public.routine_activities
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy activities_owner_delete on public.routine_activities
  for delete to authenticated using ((select auth.uid()) = user_id);

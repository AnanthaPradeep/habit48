create table public.routine_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  position bigint generated always as identity,
  kind text not null check (kind in ('goal','schedule','plan','move')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096)
);
create unique index routine_events_owner_position on public.routine_events(user_id, position);
alter table public.routine_events enable row level security;
revoke all on public.routine_events from public, anon, authenticated;
grant select on public.routine_events to authenticated;
grant insert (id, user_id, kind, payload) on public.routine_events to authenticated;
create policy routine_events_read on public.routine_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy routine_events_insert on public.routine_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.routine_events;

alter table public.workout_sessions
  add column planned_sets integer check (planned_sets between 1 and 120),
  add column plan_id text check (char_length(plan_id) between 1 and 80);

create or replace function public.save_workout_session(workout jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  workout_id uuid := (workout->>'id')::uuid;
  created uuid;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(workout->'sets') is distinct from 'array' then raise exception 'Sets must be an array'; end if;
  if jsonb_array_length(workout->'sets') not between 1 and 120 then raise exception 'Workout requires 1 to 120 sets'; end if;

  insert into public.workout_sessions (id, user_id, workout_day, name, finished_at, seconds, energy, strength, planned_sets, plan_id)
    values (workout_id, owner_id, (workout->>'day')::date, workout->>'name',
      (workout->>'finishedAt')::timestamptz, (workout->>'seconds')::integer,
      (workout->>'energy')::integer, (workout->>'strength')::boolean,
      (workout->>'plannedSets')::integer, workout->>'planId')
    on conflict (id) do nothing returning id into created;

  if created is not null then
    insert into public.workout_sets (session_id, user_id, position, exercise_id, reps, kg)
      select created, owner_id, item.position, item."exerciseId", item.reps, item.kg
      from jsonb_to_recordset(workout->'sets') as item(position integer, "exerciseId" text, reps integer, kg integer);
  elsif not exists (select 1 from public.workout_sessions where id = workout_id and user_id = owner_id) then
    raise exception 'Workout ID is unavailable' using errcode = '42501';
  end if;
end;
$$;

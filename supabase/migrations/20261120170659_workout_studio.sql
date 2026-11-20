create table public.workout_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_day date not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  finished_at timestamptz not null,
  seconds integer not null check (seconds between 1 and 604800),
  energy integer check (energy >= 0),
  strength boolean not null,
  unique (id, user_id)
);

create table public.workout_sets (
  session_id uuid not null,
  user_id uuid not null,
  position integer not null check (position between 0 and 119),
  exercise_id text not null check (char_length(exercise_id) between 1 and 80),
  reps integer not null check (reps between 1 and 600),
  kg integer not null check (kg in (0, 5, 10)),
  primary key (session_id, position),
  foreign key (session_id, user_id) references public.workout_sessions(id, user_id) on delete cascade
);

create table public.workout_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  minutes integer not null check (minutes between 1 and 720),
  steps jsonb not null check (
    case when jsonb_typeof(steps) = 'array' then jsonb_array_length(steps) between 1 and 20 else false end
  ),
  created_at timestamptz not null default now()
);

create index workout_sessions_owner_id on public.workout_sessions(user_id, id);
create index workout_plans_owner_id on public.workout_plans(user_id, id);

alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.workout_plans enable row level security;
revoke all on public.workout_sessions, public.workout_sets, public.workout_plans from public, anon, authenticated;
grant select, insert on public.workout_sessions, public.workout_sets, public.workout_plans to authenticated;

create policy workout_sessions_read on public.workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy workout_sessions_insert on public.workout_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workout_sets_read on public.workout_sets for select to authenticated using ((select auth.uid()) = user_id);
create policy workout_sets_insert on public.workout_sets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workout_plans_read on public.workout_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy workout_plans_insert on public.workout_plans for insert to authenticated with check ((select auth.uid()) = user_id);

create function public.save_workout_session(workout jsonb)
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

  insert into public.workout_sessions (id, user_id, workout_day, name, finished_at, seconds, energy, strength)
    values (workout_id, owner_id, (workout->>'day')::date, workout->>'name',
      (workout->>'finishedAt')::timestamptz, (workout->>'seconds')::integer,
      (workout->>'energy')::integer, (workout->>'strength')::boolean)
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
revoke all on function public.save_workout_session(jsonb) from public, anon, authenticated;
grant execute on function public.save_workout_session(jsonb) to authenticated;

alter publication supabase_realtime add table public.workout_sessions, public.workout_sets, public.workout_plans;

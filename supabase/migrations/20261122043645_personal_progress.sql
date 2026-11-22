-- New event variants share the existing owner-only policies and Realtime publication.
alter table public.routine_events
  drop constraint routine_events_kind_check,
  drop constraint routine_events_payload_check;

alter table public.routine_events
  add constraint routine_events_kind_check check (kind in
    ('goal','schedule','plan','move','personal_goal','goal_log','reflection','active_workout','custom_habit','habit_log')),
  add constraint routine_events_payload_check check (jsonb_typeof(payload) = 'object' and
    octet_length(payload::text) <= case when kind = 'active_workout' then 32768 else 4096 end);

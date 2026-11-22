-- The legacy permissive owner policy bypassed the row-ownership policies.
drop policy single_owner_only on public.routine_journal;

create policy journal_allowed_account on public.routine_journal
  as restrictive for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'email') in ('anandhpradeep909@gmail.com', 'anandhpradeep707@gmail.com')
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'email') in ('anandhpradeep909@gmail.com', 'anandhpradeep707@gmail.com')
  );

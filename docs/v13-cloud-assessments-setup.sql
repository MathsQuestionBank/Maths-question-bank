-- REVIEW ONLY: apply to the Maths Question Bank Supabase project (not MathsLoop).
-- Verify this table name does not already exist before running.
create table if not exists public.saved_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  folder text not null default 'Unfiled',
  assessment jsonb not null,
  updated_at timestamptz not null default now(),
  unique(user_id, client_id)
);
create index if not exists saved_assessments_owner_idx on public.saved_assessments(user_id);
alter table public.saved_assessments enable row level security;
revoke all on public.saved_assessments from anon;
grant select, insert, update, delete on public.saved_assessments to authenticated;
create policy "Owner can read assessments" on public.saved_assessments for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owner can insert assessments" on public.saved_assessments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owner can update assessments" on public.saved_assessments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owner can delete assessments" on public.saved_assessments for delete to authenticated using ((select auth.uid()) = user_id);
-- Check API schema exposure and validate RLS with two distinct test users before release.

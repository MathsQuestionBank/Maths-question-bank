# Supabase safety and recovery checklist

## State of this repo as of 22 October 2026

The site uses Supabase for sign-in, owner approval (`profiles`), question data and private exam assets. Its live Supabase project is separate from the MathsLoop project. **No complete, verified version-controlled baseline of the live Question Bank schema currently exists in this repo.** Do not guess one.

## Before the next schema change

1. Sign in to the correct **Question Bank** Supabase account. Verify project ID and database, and make sure it is not MathsLoop's project.
2. Export a **private off-site backup** of the database using a verified Supabase CLI `supabase db dump` command or `pg_dump`. Do not upload the dump to GitHub, PRs, CI artifacts or public cloud storage.
3. Separately back up actual question images, crop files, mark schemes and other Supabase Storage objects (database dumps contain metadata, not the files themselves).
4. Inspect existing tables, functions, grants, RLS policies and migration history. Record a reviewed baseline through the documented Supabase CLI workflow (e.g. `supabase db pull`) and reconcile it with any already-applied migrations before committing the `supabase/migrations/` directory.
5. On a local disposable database, verify that the migrations reconstruct the intended schema and that approved-owner access, unapproved-user isolation and anonymous access restrictions behave correctly.
6. Only then add a dedicated GitHub Actions workflow that runs `supabase start`, `supabase db reset --local` and `supabase test db` for Question Bank. Never link this workflow to production credentials or perform `supabase db push` automatically.

## Every new table migration

- Explicitly grant the **minimum privileges** to roles that need them; never rely on Supabase's historic default grants.
- Enable RLS and add tested policies in the **same** migration as `CREATE TABLE`. Verify who can read, insert, update and delete, and whether access should be owner-only.
- Keep schema changes additive when possible; rename/drop operations require a backup and explicit review.
- If you add sequences, views or RPC functions, inspect their distinct permissions and avoid unintended public execution or RLS bypass.
- Run current Supabase Security Advisors after schema changes and investigate reported issues.

## Restoring

Periodically rehearse importing a sanitized/private dump into a disposable database and separately restoring Storage objects. Never test restore by resetting the live database. On Supabase Free, do not assume managed daily backups exist. See https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/api/securing-your-api.

## Secrets and costs

Use encrypted local/CI secrets; do not commit connection strings, raw datasets, private exports, service-role keys or database passwords. A disposable **local** Docker database is free. A separate hosted Supabase staging project or database branching might have usage charges, so do not create one automatically.

# Rules for AI developers (Maths Question Bank)

These instructions apply to Claude, Codex and other AI coding assistants working on this repository.

## Database change checklist

1. Do not modify the existing live Question Bank Supabase schema until its true migration history, table definitions, policies, storage buckets and extensions have been inspected and backed up. This database is separate from MathsLoop and is **not** assumed to be accessible via MathsLoop credentials.
2. After reconciling the live schema, record a reviewed baseline in `supabase/migrations/`. Every subsequent schema, grant, function or RLS change must be a dated, committed migration in that folder. Do not fabricate an empty baseline or replay migrations against existing production tables.
3. Every newly created table exposed through the Data API must have explicit, minimal `GRANT` statements, RLS enabled, and policies limiting access to the intended approved users. Never assume Supabase grants access automatically. Never grant anonymous access to questions, profiles, marks, exams, or private assets without a deliberate public requirement.
4. Test new migrations against an empty local database, with automated checks for anonymous users, approved owner access, and unapproved users. Treat missing policies or incorrect grants as a failed release.
5. Preserve the current authentication and owner-approval model. Do not replace it with a client-side role check or place any `service_role` / secret keys in Vite/browser code.
6. Back up both database rows and actual files in Supabase Storage (exam question images, mark schemes and imports) before large imports and schema changes. Store backups outside the repository and test restoration separately.
7. Require explicit user approval for destructive or production SQL, permission broadening, key rotation, expensive/paid resources, and automatic production migrations. Avoid destructive SQL and unapproved cost-bearing features.
8. Use a committed npm lockfile and `npm ci` for reproducible CI builds. Review SDK versions and current Supabase release notes before upgrades. Run build, unit and Playwright smoke checks before merging changes.

See `docs/SUPABASE-SAFETY.md` for the production-baseline and backup procedure.

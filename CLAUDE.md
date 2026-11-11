# Claude Code instructions — GCSE Maths Question Bank

Before making changes, read and follow **AGENTS.md** at the root of this repository. It contains the permanent Supabase migration, database-permission, privacy, backup, deployment and test requirements.

**Key rules:** never modify live Supabase data or migrations without the user's explicit approval; use versioned SQL migrations and explicit least-privilege GRANTs plus RLS for any new Data API table; never expose secrets; check permissions and the current migration history; only use disposable local databases for automated tests. Do not create paid Supabase services.

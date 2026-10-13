# Maths Question Bank

A web-based question bank and assessment creator
for UK mathematics teachers.

## Planned features
- GCSE Mathematics Foundation and Higher
- Search and filter questions by topic and grade
- Create assessments with customisable cover pages
- Export student papers and mark schemes
- Further Mathematics and GCSE Statistics
- Save and edit assessments

## Development
This project is currently in development.

## Supabase connection

The React/Vite site includes a reusable Supabase client in `src/utils/supabase.ts`.
The existing question bank still uses demonstration data; database features will be
added once tables and appropriate Row Level Security policies are configured.

### Local development

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Replace both placeholders with your project's **Project URL** and **Publishable key**
   from the Supabase dashboard.
4. Run `npm run dev`.

### Cloudflare Pages deployment

In the Cloudflare project connected to this GitHub repository, open
**Settings → Variables and Secrets** (or **Environment variables**).
Set both variables for the environment(s) you deploy:

- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable API key

Then trigger a new deployment. Vite embeds `VITE_` variables at **build time**,
so the variables must be present before the build starts.

**Security:** Both `VITE_` values are visible in browser code. Only use a
publishable key here. Never use a secret / service-role key on the frontend.
Enable Row Level Security and appropriate policies before accessing real data.

The Supabase client is intentionally not used by the existing demo interface yet,
so the website can continue to build and display before Cloudflare is configured.

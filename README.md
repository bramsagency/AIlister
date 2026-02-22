# Allister (AI Lister)

Mobile-friendly web app that turns 1–2 photos into a structured marketplace listing.

## MVP (Day 1)
Upload photo(s) → OpenAI structured JSON → save to Supabase → display result

## Tech Stack
- Vercel (Next.js + API Routes)
- Supabase (Postgres + Storage)
- OpenAI API

## Environment Variables (Vercel)
- OPENAI_API_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server-only)

## Getting Started (Local)
```bash
npm install
npm run dev

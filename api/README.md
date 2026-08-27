# AURA — AI Beauty Decision Platform (Backend)

Node.js/Express API for **AURA**, an AI-powered beauty affiliate platform.
Built with a **separation-of-concerns, module-per-domain** layout: every
feature is `controller → service → repository`, wired only through its
`interfaces/*.repository.interface.ts` contract and assembled in
`src/app/container.ts`. Changing one module's internals (e.g. swapping the
image storage backend) never requires touching another module's code.

Database: **Supabase Postgres**, accessed via Prisma. Scan-selfie storage:
**Supabase Storage**, accessed via a swappable `IStorageService` (local disk
fallback for dev — see below).

## Two API surfaces in this codebase

| Surface | Status | Used by `Frontend-3.0`? |
|---|---|---|
| `/auth`, `/affiliators`, `/listings`, `/products`, `/ai-pages`, `/leads`, `/analytics` | **Current** — the affiliate SaaS layer (creator dashboards, public AI scan pages, affiliate links) | ✅ Yes — this is the entire contract `src/services/api.ts` calls |
| `/users`, `/profile`, `/scan`, `/scan/history`, `/recommendation`, `/ingredients` | **Legacy** — an earlier authenticated-user-facing scan flow, predates the affiliate pivot | ❌ No — kept for backward compatibility, not called by the current frontend |

If you're only shipping `Frontend-3.0`, the legacy surface can be ignored (or
removed later) — it's isolated behind its own modules and doesn't affect the
current surface.

## Current (frontend-facing) flow

```
Public follower:
  GET  /ai-pages/public/:slug        → creator's branded AI page
  POST /leads  (multipart: slug + image) → AI scan → ranked product matches
  POST /leads/clicks                 → affiliate click tracking

Affiliator dashboard (JWT):
  POST /auth/login | /auth/register | /auth/google
  GET/PATCH /affiliators/me
  GET/POST/PATCH/DELETE /listings          (their own product catalog)
  GET/POST/PATCH/DELETE /ai-pages          (their branded pages)
  GET  /leads                              (their captured leads)
  GET  /analytics/summary|chart|undertone-stats|concern-stats

Admin dashboard (JWT, role=ADMIN):
  GET/POST/PATCH/DELETE /products          (master catalog)
  GET/PATCH /affiliators, /affiliators/:id/status
```

## AI service contract

The Node backend never performs inference itself — it delegates to the
sibling `ai-service/` (FastAPI, wraps `ai-pipeline/`'s `FaceAnalysisPipeline`)
over HTTP, via `src/shared/services/ai-client.ts`.

`POST {AI_SERVICE_URL}/analyze-face` (multipart, field `file`) returns the
ML pipeline's raw **nested** shape, unrelated to what the frontend expects:

```json
{
  "success": true,
  "face_shape": { "shape": "Lonjong (Oblong)" },
  "skintone": { "category": "Very Light" },
  "undertone": { "undertone": "Warm" }
}
```

`ai-client.ts` adapts this to the flat `aiPredictionSchema` the rest of the
backend (and ultimately the frontend) consumes:

- **Label aliasing** — the ML classifier's bilingual/finer-grained labels
  are collapsed to the product's supported unions, e.g.
  `"Very Light" → "Fair"`, `"Lonjong (Oblong)" → "Oval"` (see
  `SKIN_TONE_ALIASES` / `FACE_SHAPE_ALIASES`).
- **No real confidence score** — the ML pipeline is threshold/ratio-based,
  not a probabilistic model, so it never returns a numeric confidence. A
  fixed placeholder (`PLACEHOLDER_CONFIDENCE = 0.75`) is used until the ML
  service exposes a real one. It is **not** scaled from anything the AI
  service returns — `LeadService.toConfidencePercent()` still scales this
  placeholder to a percentage before it reaches the frontend, so every scan
  currently shows `"AI Confidence: 75.0%"` regardless of the actual photo.
- **`success: false`** (no face detected) is translated into an
  `UnprocessableError`, not silently passed through.

If you're touching the AI contract, `ai-client.ts`'s inline comments (and
`ai-service/README.md` / `ai-pipeline/README.md`) are the source of truth —
this section is a summary, not a substitute for reading them.

## Setup (Supabase)

1. Create a Supabase project.
2. **Database:** Project Settings → Database → Connection string. Copy the
   pooled (port 6543) string into `DATABASE_URL`, and the direct (port 5432)
   string into `DIRECT_URL`.
3. **Storage:** Storage → New bucket → name it `aura-scans` (or whatever you
   put in `SUPABASE_STORAGE_BUCKET`), make it **Public**. Get your service
   role key from Project Settings → API → `SUPABASE_SERVICE_ROLE_KEY`.
4. `cp .env.example .env` and fill in the values above.
5. Install & migrate:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate      # applies prisma/migrations/*
npm run prisma:seed         # optional: demo data
npm run dev
```

If `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are left empty, scan images
fall back to local disk storage (served from `/uploads`) — fine for local
dev, **not recommended in production**.

## Optional: AI narrative (Gemini)

`src/shared/services/gemini-client.ts` generates a short Bahasa Indonesia
summary of a scan result, grounded in the already-resolved color
palette/product matches (a lightweight RAG step, not a separate retrieval
system). Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, default
`gemini-flash-latest`) to enable it. Leave it unset and this feature simply
returns `null` — it never blocks or fails the scan flow it's attached to.

## Run without Docker vs. with Docker

`docker-compose.yml` is still available if you'd rather run a local Postgres
instead of Supabase (e.g. offline development) — in that case set
`DATABASE_URL` and `DIRECT_URL` to the same local connection string and
leave the Supabase Storage variables empty.

## Tests

```bash
npm test
```

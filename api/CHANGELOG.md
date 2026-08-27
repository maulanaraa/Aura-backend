# Changelog — vs. original `Backend-Capstone-aura`

Fixes applied after diffing this backend against `Frontend-3.0/src/services/api.ts`
(the frontend's actual API contract) and the PRD/RFC docs. Each entry lists
the files touched — every fix is scoped to its own module, nothing else was
modified.

## Fixed — contract bugs (frontend was silently broken)

### 1. Master products always showed as "Draft" in the Admin Dashboard
`ProductDto` (returned by `GET/POST/PATCH /products`) never included
`isActive`, even though the frontend's `mapMasterProductToProduct()` reads
`p.isActive` to compute `status: p.isActive ? 'Active' : 'Draft'`. Every
product — active or not — rendered as "Draft".

- `src/modules/product/interfaces/product.repository.interface.ts` — added
  `isActive: boolean` to `ProductDto`, and `isActive?: boolean` to
  `CreateProductInput`.
- `src/modules/product/repositories/product.repository.ts` — `mapProduct()`
  now returns `isActive`; `create()` accepts an initial value (defaults to
  `true`, unchanged behavior if omitted).
- `src/modules/product/controllers/product.controller.ts` — `isActive` is
  now accepted on both create and update (previously update-only).

### 2. AI confidence displayed as e.g. "1.0%" instead of "99.0%"
The AI service returns `confidence` as a 0–1 fraction. The backend forwarded
it unchanged, but the frontend renders it directly as a percentage
(`` `${scanResult.confidence.toFixed(1)}%` `` in `PublicAIExperience.tsx`).

- `src/modules/lead/services/lead.service.ts` — added
  `toConfidencePercent()`, applied once at the AI-service/frontend boundary
  (used for both the `Scan.confidence` DB column and the `LeadScanResultDto`
  response, so they never drift apart).

### 3. `face_shape` enum included a value the frontend doesn't support
The AI service contract allowed `'Oblong'`, which isn't in the frontend's
`FaceShape` union (`'Oval' | 'Round' | 'Square' | 'Heart' | 'Diamond'`) or
in RFC-001 §6. Not a crash (rendered as plain text), but a silent contract
mismatch.

- `src/shared/services/ai-client.ts` — removed `'Oblong'` from
  `aiPredictionSchema`.
- `src/constants/index.ts` — removed `'Oblong'` from `FACE_SHAPES`.

### 4. `CustomerLead.selfieUrl` was always `null`
The frontend's `CustomerLead` type has a `selfieUrl` field (shown in the
affiliator's Customers view), but nothing on the backend ever set it —
uploaded selfies were saved to local disk and never linked back.

- Fixed as a side effect of the Supabase Storage migration below — the
  storage service's public URL is now written to `CustomerLead.selfieUrl`
  on every scan.

## Added — Supabase integration

- `prisma/schema.prisma` — datasource now has both `url` (pooled,
  runtime queries) and `directUrl` (direct connection, required by
  `prisma migrate` since pgbouncer's transaction pooling doesn't support the
  session-level features migrations need).
- `src/shared/services/storage.service.ts` — new `IStorageService`
  interface (`uploadScanImage(buffer, mimetype) → { key, publicUrl }`).
- `src/shared/services/supabase-storage.service.ts` — Supabase Storage
  implementation (service-role key, bucket configurable via
  `SUPABASE_STORAGE_BUCKET`).
- `src/shared/services/local-storage.service.ts` — local-disk fallback
  implementation, used automatically when Supabase credentials are absent
  (dev/CI only).
- `src/app/container.ts` — picks the storage implementation based on
  `appConfig.supabase.isConfigured`; every consumer only ever sees
  `IStorageService`, so switching providers later touches one function.
- `src/config/env.ts` / `src/config/index.ts` — new env vars: `DIRECT_URL`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`,
  `APP_BASE_URL`. Supabase URL + service role key are validated as
  "both or neither" (`env.ts` `.refine()`).
- `.env.example` — rewritten for Supabase (pooled + direct connection
  strings, storage bucket, etc.), grouped and commented.
- `package.json` — added `@supabase/supabase-js`.

### Why the public `/leads` scan flow moved from disk to memory buffers

`POST /leads` used to write the uploaded selfie straight to local disk via
`multer.diskStorage`, then read it back with `fs.createReadStream` to
forward to the AI service. Local disk isn't reliable storage for
Supabase-paired hosting (containers/functions redeployed on every push don't
guarantee a persistent filesystem) — so the image now stays in memory
(`multer.memoryStorage`) and is hashed out to two places directly from the
buffer: the AI service (`IAiClient.predict`) and `IStorageService`
(Supabase Storage or local fallback), in parallel.

**This only touches the `/leads` module.** The legacy authenticated `/scan`
route (unused by the current frontend) still uses disk-based multer exactly
as before — see `src/middlewares/index.ts`, which now exports both
`uploadScanImage` (disk, legacy `/scan`) and `uploadScanImageToMemory`
(buffer, `/leads`) as separate, independent middlewares.

- `src/shared/services/ai-client.ts` — `IAiClient.predict()` now accepts
  `Buffer | string` (buffer for `/leads`, file path still supported for
  legacy `/scan` — no changes needed in `scan.service.ts`).
- `src/middlewares/index.ts` — added `uploadScanImageToMemory`.
- `src/modules/lead/index.ts`, `controllers/lead.controller.ts`,
  `services/lead.service.ts`, `interfaces/lead.repository.interface.ts` —
  updated to pass buffers through and use `IStorageService`.
- `src/app/routes.ts` — passes `container.storageService` into the lead
  module.
- `src/app/create-app.ts` — serves `/uploads` statically, but **only**
  when Supabase Storage isn't configured (so the local fallback's URLs are
  actually fetchable in dev).

## Known gap — not fixed (needs a frontend change too)

`GET /analytics/concern-stats` will always return `[]`. It reads
`Scan.concerns`, but nothing populates that column in the public scan flow
— the frontend's `/leads` submission never sends preference/concern data,
and the AI service contract doesn't return concerns either. Left alone
since closing it means adding a new field to the `/leads` request contract,
which is a frontend change too — flagging it here rather than guessing at
a shape the frontend doesn't send yet.

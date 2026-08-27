# AURA — Struktur Proyek (Backend Updated)

Repo ini berisi **3 layanan terpisah** yang bareng-bareng jadi backend AURA.
Masing-masing punya tanggung jawab sendiri dan bisa dijalankan/dites secara
independen:

```
Backend Updated/
├── ai-pipeline/                Library Python murni: logika computer vision. TIDAK ada server HTTP di sini.
│   ├── README.md
│   ├── main.py
│   ├── evaluate.py
│   ├── requirements.txt
│   ├── models/
│   │   └── face_landmarker.task
│   └── src/
│       ├── __init__.py
│       ├── landmark_constants.py
│       ├── preprocessing.py
│       ├── landmark_extractor.py
│       ├── face_shape.py
│       ├── color_utils.py
│       ├── skintone_undertone.py
│       ├── personal_color.py
│       └── pipeline.py
│
├── ai-service/                 Web service tipis (FastAPI) yang membungkus ai-pipeline jadi endpoint HTTP.
│   ├── api.py
│   ├── requirements.txt
│   ├── .env
│   └── .env.example
│
└── api/                        Backend bisnis utama (Node.js/Express). Ini yang diakses langsung oleh Frontend-3.0.
    ├── package.json
    ├── tsconfig.json / tsconfig.build.json
    ├── eslint.config.js / .prettierrc
    ├── vitest.config.ts
    ├── prisma.config.ts
    ├── Dockerfile
    ├── docker-compose.yml
    ├── .dockerignore / .gitignore
    ├── .env / .env.example
    ├── README.md
    ├── CHANGELOG.md
    ├── .claude/settings.local.json
    │
    ├── prisma/
    │   ├── schema.prisma
    │   ├── seed.ts
    │   ├── seed-demo-affiliator.ts
    │   ├── soco-makeup-seeder.ts
    │   └── migrations/
    │       ├── 20260809025918_init_baseline/
    │       ├── 20260809031042_add_affiliate_saas_layer/
    │       ├── 20260809065623_remove_wishlist/
    │       ├── 20260811172004_add_scan_match_summary/
    │       └── migration_lock.toml
    │
    ├── dataset/data/
    │   ├── aura_seed.sql
    │   ├── products.csv / products.json
    │   ├── recommendations.csv / recommendations.json
    │   └── shade_mapping.csv / shade_mapping.json
    │
    ├── scripts/
    │   ├── import-dataset.ts
    │   └── scrape-soco-makeup.ts
    │
    ├── src/
    │   ├── main.ts
    │   ├── app/
    │   │   ├── create-app.ts
    │   │   ├── routes.ts
    │   │   └── container.ts
    │   ├── config/
    │   │   ├── env.ts
    │   │   └── index.ts
    │   ├── constants/index.ts
    │   ├── database/prisma.ts
    │   ├── docs/swagger.ts
    │   ├── middlewares/
    │   │   ├── authenticate.ts
    │   │   ├── authorize.ts
    │   │   ├── error-handler.ts
    │   │   ├── resolve-affiliator.ts
    │   │   ├── validate.ts
    │   │   └── index.ts
    │   ├── modules/
    │   │   ├── auth/            (controllers, dto, interfaces, repositories, services, validators)
    │   │   ├── affiliator/      (controllers, interfaces, repositories, services)
    │   │   ├── listing/         (controllers, interfaces, repositories, services)
    │   │   ├── product/         (controllers, interfaces, repositories, services)
    │   │   ├── ai-page/         (controllers, interfaces, repositories, services)
    │   │   ├── lead/            (controllers, interfaces, services)
    │   │   ├── analytics/       (index.ts saja)
    │   │   ├── health/          (index.ts saja)
    │   │   ├── user/            (controllers, interfaces, repositories, services)      ← legacy
    │   │   ├── profile/         (controllers, dto, interfaces, repositories, services, validators) ← legacy
    │   │   ├── scan/            (controllers, repositories, services)                  ← legacy
    │   │   ├── history/         (index.ts saja)                                        ← legacy
    │   │   ├── ingredient/      (controllers, repositories, services)                  ← legacy
    │   │   └── recommendation/  (controllers, dto, engine, repositories, services)      ← legacy
    │   └── shared/
    │       ├── errors/app-error.ts
    │       ├── services/
    │       │   ├── ai-client.ts
    │       │   ├── gemini-client.ts
    │       │   ├── storage.service.ts
    │       │   ├── supabase-storage.service.ts
    │       │   └── local-storage.service.ts
    │       ├── types/express.d.ts
    │       └── utils/
    │           ├── api-response.ts
    │           ├── async-handler.ts
    │           ├── crypto.ts
    │           ├── jwt.ts
    │           ├── logger.ts
    │           └── password.ts
    │
    ├── tests/
    │   ├── setup.ts
    │   ├── unit/
    │   │   ├── ai-client.schema.test.ts
    │   │   ├── color-palette.test.ts
    │   │   ├── dataset-rule-engine.test.ts
    │   │   ├── import-dataset.test.ts
    │   │   └── rule-engine.test.ts
    │   └── integration/http.smoke.test.ts
    │
    └── uploads/                 (fallback penyimpanan gambar lokal)
```

Penjelasan tiap file ada di tabel-tabel di bawah, dikelompokkan per layanan
lalu per sub-folder.

**Alur request satu scan foto:**

```
Frontend-3.0  ──POST /leads (multipart: slug + foto)──▶  api/ (Node.js)
                                                              │
                                                              ▼ POST /analyze-face (multipart)
                                                          ai-service/ (FastAPI)
                                                              │
                                                              ▼ import Python langsung (bukan HTTP)
                                                          ai-pipeline/ (FaceAnalysisPipeline)
```

`api/` menerjemahkan struktur JSON nested dari `ai-service` jadi struktur
flat yang dipakai `Frontend-3.0` (lihat `api/src/shared/services/ai-client.ts`),
lalu mencocokkan hasilnya ke katalog produk affiliator dan menyimpan lead.

---

## 1. `ai-pipeline/` — Logika Computer Vision

Kode Python murni tanpa dependensi web framework — supaya bisa dites lewat
CLI/notebook, bukan cuma lewat HTTP. Berbasis MediaPipe (`FaceLandmarker`
Tasks API) + OpenCV, deterministik (rasio geometris & threshold warna),
bukan deep learning.

| File | Isinya buat apa |
|---|---|
| `README.md` | Dokumentasi pipeline ML ini sendiri: cara setup, cara unduh model, contoh output JSON, status validasi & kalibrasi threshold. |
| `main.py` | Entry-point CLI (`python main.py --image foto.jpg`) + contoh (komentar, tidak dijalankan otomatis) cara mengintegrasikan `FaceAnalysisPipeline` ke FastAPI. |
| `evaluate.py` | Script evaluasi/kalibrasi pipeline terhadap sekumpulan foto uji. |
| `requirements.txt` | Dependensi Python: `opencv-python-headless`, `mediapipe`, `numpy`, `matplotlib`. |
| `models/face_landmarker.task` | Model resmi MediaPipe FaceLandmarker (diunduh manual dari Google, tidak ikut ter-bundle di `pip install`). |
| `src/landmark_constants.py` | Indeks-indeks titik landmark wajah (dari 478 titik total MediaPipe) yang dipakai modul lain — diverifikasi dari struktur resmi library, bukan dikarang. |
| `src/preprocessing.py` | Load & normalisasi gambar sebelum deteksi. Menjaga **dua versi gambar terpisah**: satu boleh dinormalisasi (buat deteksi landmark), satu lagi harus tetap asli (buat ambil warna kulit — kalau dinormalisasi, warnanya jadi tidak valid). |
| `src/landmark_extractor.py` | Wrapper ke MediaPipe `FaceLandmarker` (Tasks API — versi terbaru, bukan `mp.solutions.face_mesh` yang sudah legacy). |
| `src/face_shape.py` | Klasifikasi bentuk wajah (Oval, Bulat, Persegi, Hati, Diamond, Lonjong) dari rasio jarak Euclidean antar landmark. |
| `src/color_utils.py` | Konversi ruang warna (BGR↔HSV/Lab) + penyaringan piksel bayangan/pantulan cahaya berlebih sebelum warna kulit dirata-ratakan. |
| `src/skintone_undertone.py` | Ambil ROI kulit (dahi, pipi kiri/kanan) → klasifikasi skin tone (kecerahan) & undertone (warm/cool/neutral). |
| `src/personal_color.py` | Pemetaan (skin tone + undertone) → 4 musim personal color klasik (Spring/Summer/Autumn/Winter). |
| `src/pipeline.py` | **Orkestrator utama** — kelas `FaceAnalysisPipeline`, satu-satunya titik masuk yang dipanggil dari luar (`analyze_static_image()`). Menyatukan semua langkah di atas jadi satu hasil JSON. |

## 2. `ai-service/` — Pembungkus HTTP untuk `ai-pipeline`

FastAPI tipis yang sengaja tidak menduplikasi logika ML — hanya jembatan
HTTP ke `FaceAnalysisPipeline`.

| File | Isinya buat apa |
|---|---|
| `api.py` | Satu-satunya file logic. Endpoint `POST /analyze-face` (terima 1 file gambar multipart, field `file`, maks 5 MB, JPEG/PNG/WEBP) dan `GET /health` (cek model sudah ke-load). Model dimuat **sekali** saat startup (`lifespan()`), bukan per-request, supaya tidak lambat. Meng-import `FaceAnalysisPipeline` dari `../ai-pipeline` lewat `sys.path.insert` (karena `ai-pipeline` belum dikemas jadi package pip). |
| `requirements.txt` | Dependensi: `fastapi`, `uvicorn`, `python-multipart`, `python-dotenv`. |
| `.env.example` | Template env: `ML_PROJECT_PATH` (lokasi folder `ai-pipeline`), `MODEL_PATH`, `ALLOWED_ORIGINS` (CORS — origin FE yang diizinkan). |
| `.env` | Env aktual (isi sendiri dari `.env.example`, jangan di-commit). |

## 3. `api/` — Backend Bisnis Utama (Node.js/Express)

Ini yang dipanggil langsung oleh `Frontend-3.0`. Arsitektur *separation of
concerns*: tiap domain punya folder modul sendiri di `src/modules/`, isinya
`controller → service → repository`, dihubungkan lewat `interfaces/` supaya
gampang diganti/dites tanpa mengganggu modul lain.

### Root & konfigurasi

| File/Folder | Isinya buat apa |
|---|---|
| `package.json` | Daftar dependensi & script (`npm run dev`, `build`, `test`, `prisma:*`, `seed:*`). |
| `tsconfig.json` / `tsconfig.build.json` | Konfigurasi kompilasi TypeScript (dev vs build produksi). |
| `eslint.config.js` / `.prettierrc` | Aturan linting & format kode. |
| `vitest.config.ts` | Konfigurasi test runner (Vitest). |
| `prisma.config.ts` | Konfigurasi CLI Prisma (pengganti field `"prisma"` di `package.json`, format baru Prisma 6+). |
| `Dockerfile` | Build image produksi multi-stage (deps → build → runtime), jalan sebagai user non-root, otomatis `prisma migrate deploy` saat container start. |
| `docker-compose.yml` | Stack lokal: Postgres, Redis, dan API itu sendiri — alternatif kalau tidak mau pakai Supabase langsung saat development. |
| `.dockerignore` / `.gitignore` | File yang dikecualikan dari image Docker / git. |
| `.env` / `.env.example` | Konfigurasi environment (koneksi Supabase, JWT secret, AI service URL, dll). |
| `README.md` | Dokumentasi setup proyek ini (cara install, jalanin, setup Supabase). |
| `CHANGELOG.md` | Riwayat perbaikan bug kontrak FE↔BE yang pernah dilakukan (isActive produk, skala confidence, dll). |
| `.claude/settings.local.json` | Konfigurasi lokal Claude Code untuk proyek ini (tidak memengaruhi aplikasi). |

### `prisma/` — Skema & seed database

| File/Folder | Isinya buat apa |
|---|---|
| `schema.prisma` | Definisi seluruh model database (User, AffiliatorProfile, Product, AffiliatorListing, AIPage, Scan, CustomerLead, dll) beserta relasinya. Sumber kebenaran struktur tabel. |
| `migrations/` | Riwayat perubahan skema secara bertahap: `init_baseline` (skema awal) → `add_affiliate_saas_layer` (fitur affiliator/listing/ai-page) → `remove_wishlist` (fitur dihapus) → `add_scan_match_summary` (kolom ringkasan hasil scan). |
| `seed.ts` | Seed dasar: taksonomi kategori makeup, akun admin, produk dari SOCO. |
| `seed-demo-affiliator.ts` | Bikin 1 akun affiliator demo + AI Page terpublikasi + katalog listing, supaya Frontend-3.0 punya data nyata (bukan mock) tanpa perlu daftar manual. |
| `soco-makeup-seeder.ts` | Logika scraping/import produk makeup dari API publik SOCO (`catalog-api.soco.id`), dipakai oleh `seed.ts` dan `scripts/scrape-soco-makeup.ts`. |

### `dataset/data/` — Data mentah untuk di-import

CSV/JSON produk, rekomendasi, dan pemetaan shade warna hasil kurasi manual —
diproses oleh `scripts/import-dataset.ts`. File `.sql` di sini adalah
peninggalan skema lama dan **tidak dipakai** (lihat komentar di
`scripts/import-dataset.ts`).

### `scripts/` — CLI utilitas

| File | Isinya buat apa |
|---|---|
| `import-dataset.ts` | Import `dataset/data/*.csv` (produk, rekomendasi, shade mapping) ke database. |
| `scrape-soco-makeup.ts` | Scrape/refresh katalog produk makeup dari SOCO langsung dari API publik mereka. |

### `src/app/` — Bootstrap aplikasi

| File | Isinya buat apa |
|---|---|
| `create-app.ts` | Membuat instance Express: pasang middleware global (helmet, cors, compression, morgan, rate-limit), mount Swagger docs di `/docs`, serve `/uploads` (fallback lokal), lalu pasang semua route. |
| `routes.ts` | Daftarkan setiap modul ke path API-nya masing-masing (`/auth`, `/leads`, `/products`, dst). |
| `container.ts` | **Dependency injection container** — satu tempat yang merakit semua repository/service dan menyuntikkannya ke tiap modul. Di sinilah dipilih implementasi storage (Supabase vs lokal) yang aktif dipakai. |

### `src/config/` — Konfigurasi environment

| File | Isinya buat apa |
|---|---|
| `env.ts` | Validasi *seluruh* environment variable pakai Zod (fail-fast kalau ada yang salah/kosong saat startup) — termasuk kredensial Supabase (DB + Storage). |
| `index.ts` | Objek `appConfig` yang sudah dirapikan & siap pakai di seluruh aplikasi (turunan dari `env.ts`), termasuk `predictPath: '/analyze-face'` untuk memanggil `ai-service`. |

### `src/constants/`, `src/database/`, `src/docs/`

| File | Isinya buat apa |
|---|---|
| `constants/index.ts` | Konstanta bersama: kode HTTP status, nama role, kode error, daftar kategori makeup, skin tone/undertone/face shape yang valid. |
| `database/prisma.ts` | Singleton `PrismaClient` (satu koneksi pool per proses) + fungsi connect/disconnect. |
| `docs/swagger.ts` | Dokumen OpenAPI 3 (ditulis manual) yang dirender di `/docs` (Swagger UI). |

### `src/middlewares/`

| File | Isinya buat apa |
|---|---|
| `authenticate.ts` | Verifikasi JWT access token dari header `Authorization`, isi `req.user`. |
| `authorize.ts` | Cek role user (mis. hanya `ADMIN` yang boleh akses endpoint tertentu). |
| `resolve-affiliator.ts` | Ambil `affiliatorId` dari user yang sedang login, dipakai modul listing/ai-page/lead. |
| `validate.ts` | Wrapper validasi body/query request pakai skema Zod dari tiap modul. |
| `index.ts` | Rate limiter, konfigurasi upload file (multer — disk buat flow `/scan` lama, memory buffer buat flow `/leads`), error handler khusus multer, HTTP request logger. |

### `src/modules/` — Satu folder per domain bisnis

Tiap modul mengikuti pola yang sama: `index.ts` (routing + wiring), lalu
sub-folder `controllers/`, `services/`, `repositories/`, `interfaces/`
(kontrak tipe data), dan kadang `dto/` atau `validators/` sesuai kebutuhan.

**Modul aktif — dipanggil oleh `Frontend-3.0`:**

| Modul | Isinya buat apa |
|---|---|
| `auth/` | Register/login (email+password & Google), refresh token, JWT. |
| `affiliator/` | Profil affiliator (bio, tier langganan, API key), termasuk endpoint admin untuk approve/suspend affiliator. |
| `listing/` | Katalog produk milik masing-masing affiliator (link ke master product + harga/link afiliasi custom). |
| `product/` | Katalog produk master (dikelola admin) — sumber semua listing. |
| `ai-page/` | Halaman publik bermerek milik affiliator (tempat follower scan foto). |
| `lead/` | **Inti fitur scan AI**: terima foto → panggil `ai-service` → cocokkan ke listing affiliator → simpan sebagai lead → catat klik afiliasi. |
| `analytics/` | Agregasi statistik untuk dashboard affiliator (ringkasan, grafik, distribusi undertone/concern). |
| `health/` | Endpoint `/health` sederhana untuk cek server hidup. |

**Modul legacy — sisa arsitektur lama, tidak dipanggil `Frontend-3.0` saat ini** (dibiarkan agar tidak mengganggu, bisa dihapus nanti kalau memang tak terpakai):

| Modul | Isinya buat apa |
|---|---|
| `user/`, `profile/` | Akun & preferensi kecantikan user biasa (bukan affiliator). |
| `scan/`, `history/` | Flow scan versi lama untuk user login biasa (beda dari `lead/` yang publik). |
| `ingredient/` | Data bahan/kandungan produk. |
| `recommendation/` | Mesin rekomendasi rule-based versi lama (`engine/rule-engine.ts`, `engine/dataset-rule-engine.ts`, `engine/color-palette.ts` — logika pencocokan produk & palet warna, sebagian masih dipakai `lead/`). |

### `src/shared/` — Kode lintas-modul

| File | Isinya buat apa |
|---|---|
| `errors/app-error.ts` | Kelas-kelas error terstandardisasi (`ValidationError`, `NotFoundError`, `UnauthorizedError`, dll) yang otomatis dipetakan ke HTTP status & format response yang benar. |
| `services/ai-client.ts` | Klien HTTP ke `ai-service` (`POST /analyze-face`). Mem-parse struktur JSON nested dari ML, mengonversinya ke struktur flat yang dipakai backend/FE (termasuk alias label & confidence placeholder — lihat `CHANGELOG.md`). |
| `services/gemini-client.ts` | Klien ke Google Gemini API — menghasilkan narasi ringkas Bahasa Indonesia untuk hasil scan (fitur RAG, opsional; gagal diam-diam kalau tidak dikonfigurasi). |
| `services/storage.service.ts` | Interface `IStorageService` — abstraksi penyimpanan file foto scan, supaya modul lain tidak peduli implementasinya Supabase atau disk lokal. |
| `services/supabase-storage.service.ts` | Implementasi penyimpanan ke Supabase Storage (dipakai kalau kredensial Supabase diisi). |
| `services/local-storage.service.ts` | Implementasi fallback ke disk lokal (dev/testing tanpa Supabase). |
| `types/express.d.ts` | Tambahan tipe TypeScript untuk `Request` Express (`req.user`, `req.requestId`, dll). |
| `utils/api-response.ts` | Helper format response sukses/error yang konsisten (`{ success, data }` / `{ success, error }`). |
| `utils/async-handler.ts` | Wrapper supaya error di controller `async` otomatis diteruskan ke error handler Express. |
| `utils/crypto.ts` | Helper token acak/hash (mis. API key affiliator). |
| `utils/jwt.ts` | Sign & verify JWT access/refresh token. |
| `utils/logger.ts` | Konfigurasi logger terstruktur (Winston). |
| `utils/password.ts` | Hash & bandingkan password (bcrypt). |

### `tests/`

| File/Folder | Isinya buat apa |
|---|---|
| `setup.ts` | Env variable khusus mode test, dijalankan sebelum semua test. |
| `unit/` | Test unit murni tanpa database: skema AI client, mesin rekomendasi, palet warna, import dataset. |
| `integration/http.smoke.test.ts` | Smoke test HTTP dasar dengan container/dependency yang di-mock. |

### `uploads/`

Folder tujuan tulis file lokal — dipakai flow `/scan` lama (selalu) dan
flow `/leads` (hanya kalau Supabase Storage *tidak* dikonfigurasi).

---

## Menjalankan ketiganya bersamaan (dev)

```bash
# Terminal 1 — ai-service (butuh ai-pipeline/models/face_landmarker.task sudah diunduh)
cd ai-service
pip install -r requirements.txt
uvicorn api:app --reload --port 8000

# Terminal 2 — api (backend utama)
cd api
npm install
cp .env.example .env   # isi kredensial Supabase, AI_SERVICE_URL=http://localhost:8000
npm run prisma:generate && npm run prisma:migrate
npm run dev

# Terminal 3 — Frontend-3.0
npm run dev
```

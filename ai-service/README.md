# Face Analysis API (`ai-service`)

Lapisan HTTP tipis untuk `FaceAnalysisPipeline` dari `../ai-pipeline/`.
**Sengaja dipisah** dari folder ML: logika computer vision (landmark,
threshold, ruang warna) sepenuhnya milik `ai-pipeline/` dan tidak boleh
diduplikasi di sini — file ini cuma jembatan HTTP: terima upload gambar,
teruskan ke pipeline, kembalikan hasil JSON apa adanya.

## Struktur
```
ai-service/
├── api.py             # Satu-satunya file logic (lihat di bawah)
├── requirements.txt   # fastapi, uvicorn, python-multipart, python-dotenv
├── .env.example
└── .env                # (isi sendiri, jangan di-commit)
```

## Cara jalankan
```bash
pip install -r requirements.txt
cp .env.example .env   # sesuaikan kalau lokasi ai-pipeline berbeda
uvicorn api:app --reload --port 8000
```

Prasyarat: `../ai-pipeline/models/face_landmarker.task` sudah diunduh
(lihat `../ai-pipeline/README.md`).

## Cara kerja `api.py`

- **Import ML tanpa `pip install`.** `ai-pipeline` belum dikemas jadi
  package (belum ada `pyproject.toml`/`setup.py`), jadi `api.py` menambahkan
  folder itu ke `sys.path` secara manual (`ML_PROJECT_PATH`, default
  `../ai-pipeline`) lalu `import FaceAnalysisPipeline` langsung. Kalau
  struktur foldernya kamu ubah (folder ML dipindah), set `ML_PROJECT_PATH`
  di `.env`.
- **Model dimuat sekali saat startup**, bukan per-request — lewat
  `lifespan()` FastAPI. Re-inisialisasi `FaceLandmarker` di setiap request
  adalah penyebab paling umum latensi tinggi, jadi ini dihindari.
- **Validasi upload**: hanya `image/jpeg`, `image/png`, `image/webp`, maks
  5 MB (`MAX_UPLOAD_SIZE_BYTES`) — ditolak duluan sebelum sempat diproses
  pipeline.
- Gambar ditulis dulu ke file sementara (`tempfile`) sebelum diteruskan ke
  `pipeline.analyze_static_image()`, karena fungsi itu menerima **path**
  file, bukan bytes di memori. File sementara selalu dihapus di blok
  `finally`, sukses maupun gagal.

## Endpoint

### `GET /health`
Cek server & model sudah siap (dipakai load balancer/uptime monitor).
```json
{ "status": "ok", "model_loaded": true }
```

### `POST /analyze-face`
Multipart form-data, field **`file`** (bukan `image`) berisi satu foto.

Response — **struktur nested apa adanya dari `FaceAnalysisPipeline`**
(lihat `../ai-pipeline/README.md` untuk detail tiap field):
```json
{
  "success": true,
  "face_shape": { "shape": "Oval", "raw_ratios": { "...": "..." } },
  "skintone": { "category": "Light", "lightness_l_value": 71.76 },
  "undertone": { "undertone": "Warm", "undertone_index": 14.0 },
  "personal_color": { "season": "Spring", "palette_hint": "..." },
  "metadata": { "source_type": "static_image", "face_detected": true }
}
```
Kalau wajah tidak terdeteksi, `success: false` disertai `error_message`
(bukan HTTP error) — endpoint tetap mengembalikan status 200, karena "wajah
tidak terdeteksi" dianggap hasil valid, bukan kegagalan server.

> **Tidak ada field `confidence` di response ini.** Pipeline berbasis
> rasio/threshold (bukan model probabilistik), jadi tidak menghasilkan skor
> keyakinan numerik. Kalau kamu lihat field `confidence` di respons API
> backend (`api/`), itu nilai placeholder yang ditambahkan di lapisan
> `api/src/shared/services/ai-client.ts`, bukan dari service ini.

Error HTTP yang bisa muncul:
| Status | Kapan |
|---|---|
| `415` | Tipe file bukan JPEG/PNG/WEBP |
| `413` | Ukuran file > 5 MB |
| `422` | Gagal diproses (file korup / format tak terbaca) |
| `503` | Model belum selesai dimuat saat startup |

## Environment (`.env`)

| Variabel | Default | Keterangan |
|---|---|---|
| `ML_PROJECT_PATH` | `../ai-pipeline` | Lokasi folder ML yang di-import |
| `MODEL_PATH` | `{ML_PROJECT_PATH}/models/face_landmarker.task` | Path model MediaPipe |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Origin FE yang diizinkan CORS (pisah koma jika >1). **Ganti ke domain asli saat produksi** — jangan pakai `*` di endpoint yang menerima upload publik. |

## Siapa yang memanggil service ini

`api/` (backend Node.js) — lihat `api/src/shared/services/ai-client.ts`.
Backend itu yang bertanggung jawab menerjemahkan struktur nested di atas
jadi struktur flat yang dipakai `Frontend-3.0`, termasuk menambahkan
placeholder `confidence` dan memetakan label (mis. `"Lonjong (Oblong)"` →
`"Oval"`) ke union tipe yang dikenal frontend.

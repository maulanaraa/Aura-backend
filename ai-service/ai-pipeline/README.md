# Face Analysis Pipeline

Deteksi **Bentuk Wajah**, **Skintone**, **Undertone**, dan **Personal Color**
berbasis MediaPipe Tasks API (`FaceLandmarker`) + OpenCV — deterministik
(rasio geometris & threshold warna, bukan deep learning), ringan, siap
diintegrasikan ke backend lewat HTTP (lihat `../ai-service/`) maupun
disimpan langsung sebagai baris tabel Supabase.

## Struktur Proyek
```
ai-pipeline/
├── main.py                    # Entry-point CLI + contoh (komentar) integrasi ke FastAPI
├── evaluate.py                 # Script evaluasi akurasi terhadap dataset publik berlabel
├── requirements.txt
├── models/                    # Taruh face_landmarker.task di sini
└── src/
    ├── __init__.py
    ├── landmark_constants.py  # Indeks landmark (terverifikasi dari library resmi)
    ├── preprocessing.py       # Load, resize, normalisasi cahaya (khusus deteksi — gambar asli dijaga terpisah untuk sampling warna)
    ├── landmark_extractor.py  # Wrapper MediaPipe FaceLandmarker (Tasks API)
    ├── face_shape.py          # Kalkulasi rasio & klasifikasi bentuk wajah
    ├── color_utils.py         # Konversi warna + mitigasi shadow/highlight
    ├── skintone_undertone.py  # Sampling ROI kulit + klasifikasi warna
    ├── personal_color.py      # Pemetaan ke sistem 4-musim
    └── pipeline.py            # Orkestrator utama (FaceAnalysisPipeline)
```

## Setup
```bash
pip install -r requirements.txt

# WAJIB: unduh model resmi (tidak ikut ter-bundle di pip install)
mkdir -p models

# Linux/Colab
wget -O models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

# Windows
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile "models/face_landmarker.task"
```

## Penggunaan Cepat (CLI)
```bash
python main.py --image "C:\Users\muham\Downloads\Foto Formal.jpg"
```

## Output JSON (contoh struktur)
```json
{
  "success": true,
  "face_shape": {"shape": "Oval", "raw_ratios": {...}},
  "skintone": {"category": "Light", "lightness_l_value": 71.76},
  "undertone": {"undertone": "Warm", "undertone_index": 14.0},
  "personal_color": {"season": "Spring", "palette_hint": "..."},
  "debug": {"skin_roi_samples": [...]},
  "metadata": {"source_type": "static_image", "face_detected": true, ...}
}
```
Struktur ini **nested**, bukan flat — kalau dikonsumsi lewat `ai-service/`
(`POST /analyze-face`), pihak pemanggil (`api/src/shared/services/ai-client.ts`)
yang bertanggung jawab menerjemahkannya ke bentuk flat yang dipakai backend
Node.js & frontend.

> **Catatan:** pipeline ini tidak menghasilkan skor "confidence" numerik apa
> pun — klasifikasinya berbasis rasio/threshold, bukan model probabilistik.
> Field `confidence` yang muncul di API `api/` adalah nilai placeholder yang
> ditambahkan di lapisan backend, bukan sesuatu yang dikembalikan pipeline
> ini.

## Evaluasi Akurasi

`evaluate.py` menjalankan `FaceAnalysisPipeline` terhadap dataset publik
berlabel (format folder-per-kelas standar) untuk dua task: `face_shape` dan
`personal_color` (evaluasi otomatis untuk skintone/undertone belum
didukung — lihat komentar di bagian bawah `evaluate.py`).

```bash
python evaluate.py --dataset-dir path/ke/dataset --task face_shape
python evaluate.py --dataset-dir path/ke/dataset --task face_shape --max-per-class 20
```

Output tersimpan di `--output-dir` (default `eval_results/`): `results_detail.csv`
(hasil per-foto), `confusion_matrix.csv`, dan `summary.txt` (ringkasan akurasi
per kelas). Pemetaan nama label dataset ke label internal pipeline ada di
bagian atas `evaluate.py` — sesuaikan kalau dataset kamu pakai penamaan lain.

## Status Validasi
- ✅ Seluruh modul lolos `py_compile` (syntax valid).
- ✅ Signature API MediaPipe (`FaceLandmarkerOptions`, `BaseOptions`, `RunningMode`, dll) diverifikasi langsung terhadap `inspect.signature()` pada package terinstal — bukan hasil ingatan/karangan.
- ✅ Indeks landmark `FACE_OVAL` diverifikasi dari `FaceLandmarksConnections` resmi.
- ✅ End-to-end pipeline diuji dengan landmark & citra sintetis — menghasilkan output JSON valid untuk jalur sukses maupun jalur "wajah tidak terdeteksi".
- ⚠️ Validasi akurasi terhadap foto wajah manusia asli/dataset publik belum
  dijalankan di lingkungan ini — jalankan `evaluate.py` dengan dataset asli
  sebelum kalibrasi threshold produksi.

## Kalibrasi Threshold (Wajib Sebelum Produksi)
Seluruh angka ambang (threshold) pada `face_shape.py` dan
`skintone_undertone.py` adalah baseline heuristik awal, bukan hasil validasi
statistik. Gunakan `evaluate.py` terhadap dataset berlabel untuk mengukur
akurasi aktual dan menyesuaikan threshold sebelum dipakai produksi.

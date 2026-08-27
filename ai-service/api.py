"""
api.py
=======
Lapisan BE (service HTTP) untuk `FaceAnalysisPipeline`. File ini SENGAJA
dipisah dari folder ML (`ai-pipeline/`) -- lihat README.md di
folder ini untuk alasan pemisahan arsitektur.

Tanggung jawab file ini HANYA:
1. Menerima file gambar via HTTP multipart (dari FE).
2. Meneruskannya ke `FaceAnalysisPipeline` (folder ML, diimpor tanpa diubah).
3. Mengembalikan hasil JSON apa adanya.
Logika computer vision (landmark, threshold, color space) TIDAK boleh
diduplikasi atau ditulis ulang di sini -- itu tetap sepenuhnya milik ML.

Cara jalankan (dari dalam folder ini):
    uvicorn api:app --reload --port 8000
"""

import os
import sys
import tempfile
import time
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# Muat variabel dari file ".env" di folder ini (kalau ada) SEBELUM dibaca
# lewat os.environ.get() di bawah. Tidak error kalau file .env tidak ditemukan
# (mis. saat deploy, variabel di-set langsung lewat environment platform).
load_dotenv()

# ---------------------------------------------------------------------------
# Jembatan import ke folder ML.
# MENGAPA sys.path.insert, bukan `pip install ai-pipeline`:
# folder ML belum dikemas sebagai package (belum ada pyproject.toml/setup.py).
# Ini pendekatan paling sederhana untuk skala proyek capstone -- cukup pastikan
# struktur folder BE & ML bertetangga persis seperti di README.md.
# ---------------------------------------------------------------------------
ML_PROJECT_PATH = os.environ.get(
    "ML_PROJECT_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ai-pipeline"),
)
sys.path.insert(0, ML_PROJECT_PATH)

try:
    from src.pipeline import FaceAnalysisPipeline  # noqa: E402  (import setelah sys.path insert -- disengaja)
except ImportError as import_error:
    raise ImportError(
        f"Gagal import FaceAnalysisPipeline dari '{ML_PROJECT_PATH}'. "
        "Pastikan variabel env ML_PROJECT_PATH menunjuk ke folder "
        "ai-pipeline yang benar, atau jalankan uvicorn dari "
        "lokasi yang sesuai struktur README.md."
    ) from import_error

MODEL_PATH = os.environ.get(
    "MODEL_PATH", os.path.join(ML_PROJECT_PATH, "models", "face_landmarker.task")
)

# Origin FE yang diizinkan mengakses API ini. Untuk produksi, GANTI ke domain
# asli (bukan localhost) -- jangan pernah pakai "*" bersamaan dengan endpoint
# yang menerima upload file dari publik.
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

# Instance pipeline global -- diisi SEKALI saat startup lewat lifespan(),
# BUKAN dibuat ulang per-request. Re-inisialisasi FaceLandmarker per-request
# adalah penyebab paling umum latensi tinggi (loading model .task lambat).
_pipeline: Optional[FaceAnalysisPipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(
            f"Model tidak ditemukan di '{MODEL_PATH}'. Unduh dulu sesuai "
            "instruksi README.md folder ML (face_landmarker.task)."
        )
    _pipeline = FaceAnalysisPipeline(model_path=MODEL_PATH, running_mode="IMAGE")
    print(f"[startup] FaceAnalysisPipeline dimuat sekali dari model: {MODEL_PATH}")
    yield
    # Cleanup saat server dimatikan (Ctrl+C / restart deploy)
    if _pipeline is not None:
        _pipeline.close()
        print("[shutdown] FaceAnalysisPipeline ditutup.")


app = FastAPI(title="Face Analysis API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST"],
    allow_headers=["*"],
)

# Batas ukuran file upload (15 MB) -- mendukung resolusi kamera smartphone modern
MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/jfif",
    "image/pjpeg",
    "application/octet-stream",
}


@app.get("/health")
async def health_check():
    """Endpoint sederhana untuk memastikan server & model sudah siap (mis. dipakai load balancer/uptime monitor)."""
    return {"status": "ok", "model_loaded": _pipeline is not None}


@app.post("/analyze-face")
async def analyze_face(file: UploadFile = File(...)):
    """
    Menerima 1 file gambar wajah, mengembalikan hasil JSON dari
    `FaceAnalysisPipeline` apa adanya (field `success`, `face_shape`,
    `skintone`, `undertone`, `personal_color`, `metadata`, atau `error_message`
    jika wajah tidak terdeteksi -- lihat src/pipeline.py di folder ML).
    """
    if _pipeline is None:
        raise HTTPException(status_code=503, detail="Model belum siap, coba lagi sesaat lagi.")

    # Normalisasi format content type
    raw_content_type = (file.content_type or "").split(";")[0].strip().lower()
    if raw_content_type and raw_content_type not in ALLOWED_CONTENT_TYPES and not raw_content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail=f"Tipe file '{file.content_type}' tidak didukung. Gunakan JPEG, PNG, atau WEBP.",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Ukuran file melebihi batas 15 MB.")

    suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"
    tmp_file = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp_file.write(contents)
        tmp_file.close()

        result = _pipeline.analyze_static_image(tmp_file.name)
        return result
    except Exception as processing_error:
        err_msg = str(processing_error)
        raise HTTPException(
            status_code=422,
            detail=err_msg or "Gagal memproses gambar. Pastikan wajah terlihat jelas.",
        ) from processing_error
    finally:
        if os.path.exists(tmp_file.name):
            try:
                os.unlink(tmp_file.name)
            except Exception:
                pass

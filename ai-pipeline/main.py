"""
main.py
========
Entry-point produksi (.py) — contoh pemakaian FaceAnalysisPipeline dari CLI.
Untuk integrasi ke backend RAG LLM/Supabase, import langsung `FaceAnalysisPipeline`
dari `src.pipeline` ke dalam service Anda (lihat contoh integrasi FastAPI di bawah).

Cara pakai (CLI):
    python main.py --image path/ke/foto.jpg

Prasyarat: model models/face_landmarker.task sudah diunduh (lihat README.md).
"""

import argparse
import json
import sys

from src.pipeline import FaceAnalysisPipeline


def run_cli() -> None:
    parser = argparse.ArgumentParser(
        description="Analisis wajah: Bentuk Wajah, Skintone, Undertone, Personal Color"
    )
    parser.add_argument("--image", required=True, help="Path ke file foto wajah (jpg/png)")
    parser.add_argument(
        "--model",
        default="models/face_landmarker.task",
        help="Path ke file model .task MediaPipe FaceLandmarker",
    )
    args = parser.parse_args()

    with FaceAnalysisPipeline(model_path=args.model, running_mode="IMAGE") as pipeline:
        result = pipeline.analyze_static_image(args.image)

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))

    if not result["success"]:
        sys.exit(1)


# =========================================================================
# CONTOH INTEGRASI KE FASTAPI (referensi, tidak dijalankan otomatis)
# =========================================================================
#
# from fastapi import FastAPI, UploadFile
# from src.pipeline import FaceAnalysisPipeline
#
# app = FastAPI()
# pipeline = FaceAnalysisPipeline(model_path="models/face_landmarker.task", running_mode="IMAGE")
# # ^ inisialisasi SEKALI saat startup, bukan per-request (lihat catatan optimasi di README)
#
# @app.post("/analyze-face")
# async def analyze_face(file: UploadFile):
#     temp_path = f"/tmp/{file.filename}"
#     with open(temp_path, "wb") as f:
#         f.write(await file.read())
#     result = pipeline.analyze_static_image(temp_path)
#     # result sudah berupa dict JSON-serializable, siap dikirim ke RAG LLM / disimpan ke Supabase
#     return result


if __name__ == "__main__":
    run_cli()

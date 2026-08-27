"""
pipeline.py
============
Orkestrator utama: menyatukan preprocessing -> ekstraksi landmark ->
klasifikasi bentuk wajah -> analisis skintone/undertone -> personal color,
lalu menghasilkan output JSON/dict terstruktur siap dikirim ke backend
RAG LLM dan disimpan ke Supabase.
"""

import time
from typing import Dict, Optional

import numpy as np

from . import preprocessing
from .face_shape import classify_face_shape, compute_face_metrics
from .landmark_extractor import FaceLandmarkExtractor, FaceLandmarkResult
from .personal_color import map_to_personal_color_season
from .skintone_undertone import analyze_skin


class FaceAnalysisPipeline:
    """
    Kelas fasad (facade) tunggal yang menjadi satu-satunya titik masuk
    (entry point) bagi konsumen eksternal (misal endpoint FastAPI/Flask),
    sehingga detail implementasi 5 modul internal tidak perlu diketahui
    oleh caller.
    """

    def __init__(
        self,
        model_path: str = "models/face_landmarker.task",
        running_mode: str = "IMAGE",
        target_resize_width: int = 800,
    ):
        self._extractor = FaceLandmarkExtractor(
            model_path=model_path, running_mode=running_mode
        )
        self._running_mode = running_mode
        self._target_resize_width = target_resize_width

    def analyze_static_image(self, image_path: str) -> Dict[str, object]:
        """
        Entry point untuk kasus penggunaan: FOTO STATIS (upload dari user).
        """
        if self._running_mode != "IMAGE":
            raise RuntimeError(
                "Pipeline diinisialisasi dengan running_mode != 'IMAGE'. "
                "Buat instance baru dengan running_mode='IMAGE' untuk foto statis."
            )

        image_original_bgr = preprocessing.load_image(image_path)
        image_original_bgr = preprocessing.resize_image_proportional(
            image_original_bgr, self._target_resize_width
        )

        # Citra khusus deteksi (boleh dinormalisasi) -> TIDAK dipakai untuk ambil warna
        image_for_detection = preprocessing.normalize_lighting_for_detection(
            image_original_bgr
        )
        image_rgb_for_detection = preprocessing.bgr_to_srgb_for_mediapipe(
            image_for_detection
        )

        landmark_result = self._extractor.extract_from_image(image_rgb_for_detection)

        return self._build_output(
            landmark_result=landmark_result,
            image_original_bgr=image_original_bgr,
            source_type="static_image",
        )

    def analyze_video_frame(
        self, frame_bgr: np.ndarray, timestamp_ms: int
    ) -> Dict[str, object]:
        """
        Entry point untuk kasus penggunaan: WEBCAM/VIDEO REAL-TIME.

        Catatan performa: untuk skintone/undertone pada mode video, disarankan
        TIDAK menjalankan analisis warna di SETIAP frame (boros komputasi dan
        rentan flicker akibat noise per-frame). Sebaiknya panggil fungsi ini
        hanya sesekali (misal 1 dari setiap 15 frame, atau saat user menekan
        tombol "capture") -- lihat contoh di demo_notebook.ipynb.
        """
        if self._running_mode != "VIDEO":
            raise RuntimeError(
                "Pipeline diinisialisasi dengan running_mode != 'VIDEO'. "
                "Buat instance baru dengan running_mode='VIDEO' untuk webcam."
            )

        frame_bgr_resized = preprocessing.resize_image_proportional(
            frame_bgr, self._target_resize_width
        )
        frame_for_detection = preprocessing.normalize_lighting_for_detection(
            frame_bgr_resized
        )
        frame_rgb_for_detection = preprocessing.bgr_to_srgb_for_mediapipe(
            frame_for_detection
        )

        landmark_result = self._extractor.extract_from_video_frame(
            frame_rgb_for_detection, timestamp_ms
        )

        return self._build_output(
            landmark_result=landmark_result,
            image_original_bgr=frame_bgr_resized,
            source_type="video_frame",
        )

    @staticmethod
    def _build_output(
        landmark_result: FaceLandmarkResult,
        image_original_bgr: np.ndarray,
        source_type: str,
    ) -> Dict[str, object]:
        """
        Menyusun output JSON final. Struktur ini dirancang agar langsung
        kompatibel sebagai payload JSON untuk API backend (RAG LLM) maupun
        baris tabel Supabase (setiap key top-level bisa dipetakan ke kolom).
        """
        base_metadata = {
            "source_type": source_type,
            "image_width": landmark_result.image_width,
            "image_height": landmark_result.image_height,
            "face_detected": landmark_result.face_detected,
            "processed_at_unix": time.time(),
        }

        if not landmark_result.face_detected:
            return {
                "success": False,
                "error_message": (
                    "Wajah tidak terdeteksi. Pastikan wajah menghadap kamera, "
                    "pencahayaan cukup, dan tidak ada oklusi (masker/tangan menutupi wajah)."
                ),
                "metadata": base_metadata,
            }

        try:
            face_metrics = compute_face_metrics(landmark_result.landmarks_px)
            face_shape_result = classify_face_shape(face_metrics)

            skin_result = analyze_skin(image_original_bgr, landmark_result.landmarks_px)

            personal_color_result = map_to_personal_color_season(
                skintone_category=skin_result["skintone"]["category"],
                undertone=skin_result["undertone"]["undertone"],
            )

            return {
                "success": True,
                "face_shape": face_shape_result,
                "skintone": skin_result["skintone"],
                "undertone": skin_result["undertone"],
                "personal_color": personal_color_result,
                "debug": {"skin_roi_samples": skin_result["roi_debug"]},
                "metadata": base_metadata,
            }

        except ValueError as extraction_error:
            # Contoh: seluruh ROI kulit tertutup bayangan total (lihat color_utils.py)
            return {
                "success": False,
                "error_message": f"Gagal ekstraksi warna kulit: {extraction_error}",
                "metadata": base_metadata,
            }

    def close(self) -> None:
        self._extractor.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

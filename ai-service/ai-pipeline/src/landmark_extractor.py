"""
landmark_extractor.py
=======================
Wrapper untuk MediaPipe Face Landmarker (Tasks API).

CATATAN TECH LEAD - PERUBAHAN API:
MediaPipe versi terbaru (>=0.10.x) TIDAK LAGI menyediakan modul legacy
`mp.solutions.face_mesh`. API resmi saat ini adalah Tasks API:
    mediapipe.tasks.python.vision.FaceLandmarker

Seluruh signature fungsi/parameter di file ini SUDAH DIVERIFIKASI langsung
terhadap `inspect.signature()` pada package mediapipe terinstal (bukan
dikarang dari ingatan), sesuai aturan wajib "berbasis dokumentasi resmi".

PRASYARAT WAJIB:
Developer harus mengunduh model bundle resmi terlebih dahulu (file .task),
karena file model TIDAK ikut terbundle otomatis saat `pip install mediapipe`.

    wget -O models/face_landmarker.task \
        https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Simpan pada folder `models/` di root proyek.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np
from mediapipe import Image as MpImage
from mediapipe import ImageFormat
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import (
    FaceLandmarker,
    FaceLandmarkerOptions,
    RunningMode,
)


@dataclass
class FaceLandmarkResult:
    """Struktur hasil ekstraksi landmark yang sudah dikonversi ke koordinat piksel."""

    landmarks_px: List[Tuple[int, int, float]]  # (x_piksel, y_piksel, z_relatif)
    landmarks_normalized: List[Tuple[float, float, float]]  # (x, y, z) rentang 0-1
    image_width: int
    image_height: int
    face_detected: bool


class FaceLandmarkExtractor:
    """
    Kelas tunggal untuk inisialisasi dan menjalankan FaceLandmarker,
    mendukung dua mode operasi: citra statis (IMAGE) dan webcam real-time
    (VIDEO), sesuai kebutuhan input yang fleksibel.
    """

    def __init__(
        self,
        model_path: str = "models/face_landmarker.task",
        running_mode: str = "IMAGE",
        num_faces: int = 1,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ):
        """
        Args:
            model_path: path lokal ke file .task hasil unduhan resmi.
            running_mode: "IMAGE" untuk foto statis/upload, "VIDEO" untuk
                stream webcam/video (frame berurutan dengan timestamp naik).
            num_faces: dibatasi 1 -> use case ini adalah analisis wajah
                tunggal (personal color), bukan deteksi wajah banyak orang.
        """
        mode_map = {
            "IMAGE": RunningMode.IMAGE,
            "VIDEO": RunningMode.VIDEO,
            "LIVE_STREAM": RunningMode.LIVE_STREAM,
        }
        if running_mode not in mode_map:
            raise ValueError(
                f"running_mode '{running_mode}' tidak valid. Pilih salah satu: {list(mode_map.keys())}"
            )

        base_options = BaseOptions(model_asset_path=model_path)
        options = FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=mode_map[running_mode],
            num_faces=num_faces,
            min_face_detection_confidence=min_detection_confidence,
            min_face_presence_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
            output_face_blendshapes=False,  # tidak dibutuhkan untuk face shape/skintone
            output_facial_transformation_matrixes=False,
        )
        self._detector = FaceLandmarker.create_from_options(options)
        self._running_mode = running_mode

    def extract_from_image(self, image_rgb: np.ndarray) -> FaceLandmarkResult:
        """
        Ekstraksi landmark dari satu citra statis (mode IMAGE).

        Args:
            image_rgb: array numpy RGB (bukan BGR!) -> gunakan
                preprocessing.bgr_to_srgb_for_mediapipe() sebelum memanggil ini.
        """
        if self._running_mode != "IMAGE":
            raise RuntimeError(
                "Extractor diinisialisasi dengan running_mode selain 'IMAGE'. "
                "Gunakan extract_from_video_frame() untuk mode VIDEO."
            )

        height, width = image_rgb.shape[:2]
        mp_image = MpImage(image_format=ImageFormat.SRGB, data=image_rgb)
        result = self._detector.detect(mp_image)
        return self._parse_result(result, width, height)

    def extract_from_video_frame(
        self, image_rgb: np.ndarray, timestamp_ms: int
    ) -> FaceLandmarkResult:
        """
        Ekstraksi landmark dari satu frame video/webcam (mode VIDEO).

        Mengapa timestamp_ms wajib naik monoton?
        -> Tasks API menggunakan timestamp untuk tracking internal antar-frame
           (mempercepat inferensi berikutnya dengan estimasi pergerakan).
           Timestamp yang mundur/tidak konsisten akan memicu RuntimeError
           dari MediaPipe.
        """
        if self._running_mode != "VIDEO":
            raise RuntimeError(
                "Extractor diinisialisasi dengan running_mode selain 'VIDEO'. "
                "Gunakan extract_from_image() untuk mode IMAGE."
            )

        height, width = image_rgb.shape[:2]
        mp_image = MpImage(image_format=ImageFormat.SRGB, data=image_rgb)
        result = self._detector.detect_for_video(mp_image, timestamp_ms)
        return self._parse_result(result, width, height)

    @staticmethod
    def _parse_result(result, width: int, height: int) -> FaceLandmarkResult:
        """Konversi hasil mentah FaceLandmarkerResult -> koordinat piksel siap pakai."""
        if not result.face_landmarks:
            return FaceLandmarkResult(
                landmarks_px=[],
                landmarks_normalized=[],
                image_width=width,
                image_height=height,
                face_detected=False,
            )

        # num_faces=1 -> selalu ambil wajah pertama (indeks 0)
        first_face = result.face_landmarks[0]
        landmarks_normalized = [(lm.x, lm.y, lm.z) for lm in first_face]
        landmarks_px = [
            (int(lm.x * width), int(lm.y * height), lm.z) for lm in first_face
        ]

        return FaceLandmarkResult(
            landmarks_px=landmarks_px,
            landmarks_normalized=landmarks_normalized,
            image_width=width,
            image_height=height,
            face_detected=True,
        )

    def close(self) -> None:
        """Membebaskan resource model. WAJIB dipanggil di akhir sesi (atau gunakan context manager)."""
        self._detector.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def visualize_landmarks(
    image_bgr: np.ndarray,
    landmark_result: FaceLandmarkResult,
    highlight_indices: Optional[List[int]] = None,
) -> np.ndarray:
    """
    Fungsi bantu debugging visual: menggambar seluruh titik landmark di atas
    citra, dengan opsi menyorot indeks tertentu (misal titik ROI dahi/pipi)
    dalam warna berbeda agar Developer bisa memvalidasi posisi ROI secara
    visual sebelum dipakai di produksi.
    """
    canvas = image_bgr.copy()
    highlight_set = set(highlight_indices) if highlight_indices else set()

    for idx, (x, y, _z) in enumerate(landmark_result.landmarks_px):
        if idx in highlight_set:
            cv2.circle(canvas, (x, y), radius=4, color=(0, 0, 255), thickness=-1)  # merah = ROI penting
        else:
            cv2.circle(canvas, (x, y), radius=1, color=(0, 255, 0), thickness=-1)  # hijau = mesh biasa

    return canvas

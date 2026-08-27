"""
preprocessing.py
==================
Modul praproses citra sebelum masuk ke tahap ekstraksi landmark.

CATATAN ARSITEKTUR PENTING:
Ada 2 (dua) versi citra yang harus dijaga terpisah sepanjang pipeline:

1. `image_for_detection` -> boleh dinormalisasi (CLAHE, resize) karena hanya
   dipakai model MediaPipe untuk MENEMUKAN titik landmark. Normalisasi di
   sini justru MENINGKATKAN akurasi deteksi pada kondisi cahaya buruk.

2. `image_original` -> TIDAK BOLEH diubah histogramnya sama sekali, karena
   citra inilah yang dipakai untuk MENGAMBIL WARNA kulit asli (skintone &
   undertone). Jika di-CLAHE, warna kulit akan terdistorsi dan hasil
   klasifikasi undertone menjadi tidak valid.

Aturan: selalu simpan `image_original` sebelum melakukan normalisasi apa pun.
"""

import cv2
import numpy as np


def load_image(image_path: str) -> np.ndarray:
    """
    Memuat citra dari path lokal dalam format BGR (default OpenCV).

    Mengapa BGR dipertahankan (bukan langsung dikonversi ke RGB)?
    -> OpenCV secara internal bekerja optimal dalam BGR, dan konversi ke RGB
       hanya dilakukan tepat sebelum citra dikirim ke MediaPipe (yang
       mewajibkan format SRGB). Ini menghindari konversi bolak-balik yang
       tidak perlu dan boros komputasi.
    """
    image_bgr = cv2.imread(image_path)
    if image_bgr is None:
        raise FileNotFoundError(
            f"Citra tidak ditemukan atau format tidak didukung: {image_path}"
        )
    return image_bgr


def resize_image_proportional(image_bgr: np.ndarray, target_width: int = 800) -> np.ndarray:
    """
    Mengubah ukuran citra dengan mempertahankan rasio aspek.

    Mengapa perlu resize ke lebar tetap (default 800px)?
    -> MediaPipe FaceLandmarker tetap akurat pada resolusi tinggi, namun
       resolusi yang terlalu besar (misal 4000px dari kamera HP modern)
       memperlambat inferensi tanpa menambah akurasi landmark secara
       signifikan. 800px adalah titik keseimbangan antara kecepatan dan
       presisi sub-piksel untuk kalkulasi rasio wajah.
    """
    height, width = image_bgr.shape[:2]
    if width <= target_width:
        return image_bgr  # tidak perlu upscale, hindari interpolasi palsu

    scale_ratio = target_width / float(width)
    target_height = int(height * scale_ratio)
    resized = cv2.resize(
        image_bgr, (target_width, target_height), interpolation=cv2.INTER_AREA
    )
    return resized


def normalize_lighting_for_detection(image_bgr: np.ndarray) -> np.ndarray:
    """
    Menormalisasi pencahayaan HANYA untuk keperluan deteksi landmark
    (bukan untuk ekstraksi warna kulit).

    Mengapa menggunakan CLAHE pada channel L (bukan equalizeHist biasa)?
    -> equalizeHist global sering menyebabkan over-enhancement pada area
       kecil beriluminasi ekstrem (contoh: silau di dahi), yang justru
       bisa membingungkan model deteksi. CLAHE (Contrast Limited Adaptive
       Histogram Equalization) bekerja per-region kecil (tile 8x8 default)
       sehingga peningkatan kontras lebih lokal dan tidak menimbulkan noise
       berlebih pada area datar seperti pipi.
    """
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_channel_enhanced = clahe.apply(l_channel)

    lab_enhanced = cv2.merge((l_channel_enhanced, a_channel, b_channel))
    image_enhanced_bgr = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
    return image_enhanced_bgr


def bgr_to_srgb_for_mediapipe(image_bgr: np.ndarray) -> np.ndarray:
    """
    Konversi BGR (OpenCV) -> RGB, sesuai kewajiban input MediaPipe Tasks API
    yang menggunakan mp.ImageFormat.SRGB.
    """
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

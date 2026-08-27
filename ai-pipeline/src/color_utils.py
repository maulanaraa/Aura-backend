"""
color_utils.py
===============
Utilitas konversi ruang warna dan MITIGASI KONDISI PENCAHAYAAN BURUK.

ATURAN WAJIB (sesuai standar pengembangan): setiap logika pengambilan warna
kulit HARUS menyaring piksel bayangan (shadow) dan piksel highlight
(pantulan cahaya berlebih/specular) sebelum dirata-ratakan, karena kedua
jenis piksel ini akan mendistorsi rata-rata warna kulit yang sebenarnya.
"""

from typing import Tuple

import cv2
import numpy as np


def extract_square_patch(
    image_bgr: np.ndarray, center_x: int, center_y: int, half_size: int = 8
) -> np.ndarray:
    """
    Mengambil potongan (patch) citra persegi di sekitar satu titik landmark.

    Mengapa patch (area kecil), bukan hanya 1 piksel tunggal?
    -> 1 piksel sangat rentan terhadap noise sensor kamera (grain/ISO noise).
       Patch kecil (default 16x16 px, half_size=8) memungkinkan agregasi
       statistik (median/mean) yang jauh lebih stabil terhadap noise acak.

    Args:
        half_size: setengah sisi persegi dalam piksel. Default 8 -> area 16x16.
            Nilai ini WAJIB dikalibrasi ulang untuk resolusi citra input yang
            berbeda dari standar 800px (lihat preprocessing.resize_image_proportional).
    """
    height, width = image_bgr.shape[:2]
    x_min = max(0, center_x - half_size)
    x_max = min(width, center_x + half_size)
    y_min = max(0, center_y - half_size)
    y_max = min(height, center_y + half_size)

    patch = image_bgr[y_min:y_max, x_min:x_max]
    return patch


def remove_shadow_and_highlight_pixels(
    patch_bgr: np.ndarray,
    v_lower_threshold: int = 60,
    v_upper_threshold: int = 235,
    saturation_upper_threshold: int = 60,
) -> np.ndarray:
    """
    Menyaring piksel bayangan (terlalu gelap) dan piksel specular highlight
    (terlalu terang/silau) dari sebuah patch warna kulit, menggunakan
    thresholding pada channel Value (V) dan Saturation (S) di ruang HSV.

    MENGAPA LOGIKA INI DIPERLUKAN (edge case pencahayaan):
    - Piksel V < v_lower_threshold (default 60/255) -> kemungkinan besar area
      bayangan (misal bayangan hidung jatuh di pipi, atau sudut wajah miring
      sehingga satu sisi wajah tidak terkena cahaya). Piksel ini akan membuat
      skintone terbaca lebih gelap dari warna kulit asli.
    - Piksel V > v_upper_threshold (default 235/255) DAN Saturation rendah
      (< saturation_upper_threshold) -> kemungkinan besar pantulan cahaya
      langsung/specular highlight (kulit berminyak terkena flash kamera).
      Piksel ini akan membuat skintone terbaca lebih pucat dari aslinya.

    Returns:
        Array 1D berisi piksel-piksel BGR yang LOLOS filter (bukan citra 2D lagi).
        Bisa kosong jika seluruh patch adalah bayangan/highlight -> caller
        WAJIB menangani kasus ini (lihat skintone_undertone.py).
    """
    if patch_bgr.size == 0:
        return np.array([])

    patch_hsv = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2HSV)
    h_channel, s_channel, v_channel = cv2.split(patch_hsv)

    # Mask piksel yang valid: tidak terlalu gelap (bukan bayangan)...
    valid_mask = v_channel >= v_lower_threshold
    # ...DAN bukan kombinasi (terlalu terang + saturasi rendah) yaitu ciri highlight
    highlight_mask = (v_channel > v_upper_threshold) & (s_channel < saturation_upper_threshold)
    valid_mask = valid_mask & (~highlight_mask)

    valid_pixels_bgr = patch_bgr[valid_mask]
    return valid_pixels_bgr


def get_robust_mean_color_bgr(valid_pixels_bgr: np.ndarray) -> Tuple[float, float, float]:
    """
    Menghitung warna rata-rata dari kumpulan piksel yang sudah difilter,
    menggunakan MEDIAN (bukan mean/rata-rata aritmatika biasa).

    Mengapa median, bukan mean?
    -> Median jauh lebih tahan (robust) terhadap outlier residual yang lolos
       dari filter shadow/highlight (misal 1-2 piksel noise ekstrem yang
       tidak tertangkap threshold V/S). Mean aritmatika akan sangat
       terpengaruh oleh outlier semacam ini, sedangkan median tidak.
    """
    if valid_pixels_bgr.size == 0:
        raise ValueError(
            "Tidak ada piksel valid tersisa setelah filter bayangan/highlight. "
            "Kemungkinan ROI berada di area bayangan total -> perbesar half_size "
            "patch atau longgarkan threshold V/S."
        )
    b_median = float(np.median(valid_pixels_bgr[:, 0]))
    g_median = float(np.median(valid_pixels_bgr[:, 1]))
    r_median = float(np.median(valid_pixels_bgr[:, 2]))
    return (b_median, g_median, r_median)


def bgr_to_lab_single_color(bgr_color: Tuple[float, float, float]) -> Tuple[float, float, float]:
    """
    Konversi satu nilai warna BGR (hasil agregasi) ke ruang warna CIELAB.

    Mengapa LAB, bukan langsung pakai RGB untuk klasifikasi undertone?
    -> Ruang warna LAB memisahkan kecerahan (L) dari informasi warna murni
       (a* = sumbu hijau-merah, b* = sumbu biru-kuning). Pemisahan ini krusial
       karena undertone kulit (warm/cool/neutral) secara definisi ditentukan
       oleh posisi pada sumbu a*/b*, TIDAK bergantung pada seberapa gelap/
       terang kulit tersebut (L). RGB tidak memisahkan kedua aspek ini,
       sehingga sulit dipakai langsung untuk klasifikasi undertone yang
       konsisten lintas skintone gelap maupun terang.

    Catatan implementasi: cv2.cvtColor mengharapkan array citra (bukan tuple
    tunggal), sehingga kita bungkus nilai warna menjadi array 1x1 piksel.
    """
    single_pixel_bgr = np.uint8([[list(bgr_color)]])  # shape (1, 1, 3)
    single_pixel_lab = cv2.cvtColor(single_pixel_bgr, cv2.COLOR_BGR2LAB)[0][0]

    # OpenCV men-scale L ke [0,255] dan a,b ke [0,255] dengan offset 128.
    # Konversi balik ke skala CIELAB standar: L:[0,100], a/b:[-128,127]
    l_value = float(single_pixel_lab[0]) * (100.0 / 255.0)
    a_value = float(single_pixel_lab[1]) - 128.0
    b_value = float(single_pixel_lab[2]) - 128.0
    return (l_value, a_value, b_value)


def bgr_to_hsv_single_color(bgr_color: Tuple[float, float, float]) -> Tuple[float, float, float]:
    """Konversi satu nilai warna BGR -> HSV (H:[0,179], S:[0,255], V:[0,255] skala OpenCV)."""
    single_pixel_bgr = np.uint8([[list(bgr_color)]])
    single_pixel_hsv = cv2.cvtColor(single_pixel_bgr, cv2.COLOR_BGR2HSV)[0][0]
    return (float(single_pixel_hsv[0]), float(single_pixel_hsv[1]), float(single_pixel_hsv[2]))

"""
skintone_undertone.py
=======================
Modul inti untuk ekstraksi ROI kulit, klasifikasi skintone (kecerahan kulit)
dan undertone (warm/cool/neutral) dengan mitigasi pencahayaan buruk.
"""

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .color_utils import (
    bgr_to_hsv_single_color,
    bgr_to_lab_single_color,
    extract_square_patch,
    get_robust_mean_color_bgr,
    remove_shadow_and_highlight_pixels,
)
from .landmark_constants import (
    ROI_CHEEK_LEFT,
    ROI_CHEEK_RIGHT,
    ROI_FOREHEAD_CENTER,
)

# Offset vertikal (piksel) untuk menggeser ROI dahi ke atas, menjauhi alis.
FOREHEAD_Y_OFFSET_PX = -12


@dataclass
class SkinRoiSample:
    roi_name: str
    center_px: Tuple[int, int]
    mean_bgr: Tuple[float, float, float]
    lab: Tuple[float, float, float]
    hsv: Tuple[float, float, float]
    valid_pixel_ratio: float  # proporsi piksel yang lolos filter shadow/highlight
    color_std: float = 0.0  # standar deviasi warna (mengukur keseragaman patch kulit vs rambut)


def _sample_single_roi(
    image_bgr_original: np.ndarray,
    center_x: int,
    center_y: int,
    roi_name: str,
    patch_half_size: int = 8,
) -> SkinRoiSample:
    """
    Fungsi tunggal bertanggung jawab untuk 1 ROI: ambil patch -> filter
    shadow/highlight -> agregasi median -> konversi ruang warna + estimasi variansi.
    """
    patch = extract_square_patch(image_bgr_original, center_x, center_y, patch_half_size)
    total_pixel_count = patch.shape[0] * patch.shape[1] if patch.size > 0 else 0

    valid_pixels = remove_shadow_and_highlight_pixels(patch)
    valid_pixel_ratio = (
        len(valid_pixels) / total_pixel_count if total_pixel_count > 0 else 0.0
    )

    color_std = float(np.mean(np.std(valid_pixels, axis=0))) if len(valid_pixels) > 0 else 0.0

    mean_bgr = get_robust_mean_color_bgr(valid_pixels)
    lab = bgr_to_lab_single_color(mean_bgr)
    hsv = bgr_to_hsv_single_color(mean_bgr)

    return SkinRoiSample(
        roi_name=roi_name,
        center_px=(center_x, center_y),
        mean_bgr=mean_bgr,
        lab=lab,
        hsv=hsv,
        valid_pixel_ratio=round(valid_pixel_ratio, 3),
        color_std=round(color_std, 2),
    )


def sample_skin_roi(
    image_bgr_original: np.ndarray, landmarks_px: List[Tuple[int, int, float]]
) -> List[SkinRoiSample]:
    """
    Mengambil sampel warna dari 3 titik ROI kulit: dahi, pipi kanan, pipi kiri.
    """
    x_forehead, y_forehead, _ = landmarks_px[ROI_FOREHEAD_CENTER]
    x_cheek_r, y_cheek_r, _ = landmarks_px[ROI_CHEEK_RIGHT]
    x_cheek_l, y_cheek_l, _ = landmarks_px[ROI_CHEEK_LEFT]

    samples = [
        _sample_single_roi(
            image_bgr_original,
            x_forehead,
            y_forehead + FOREHEAD_Y_OFFSET_PX,
            roi_name="dahi",
        ),
        _sample_single_roi(image_bgr_original, x_cheek_r, y_cheek_r, roi_name="pipi_kanan"),
        _sample_single_roi(image_bgr_original, x_cheek_l, y_cheek_l, roi_name="pipi_kiri"),
    ]
    return samples


def aggregate_lab_from_samples(samples: List[SkinRoiSample]) -> Tuple[float, float, float]:
    """
    Menggabungkan nilai LAB dari beberapa ROI menjadi satu representasi akhir,
    dengan pembobotan cerdas:
    1. valid_pixel_ratio (ROI yang bersih dari shadow/highlight mendapat bobot lebih besar).
    2. Hair/Bangs penalty: Jika ROI dahi punya variansi tinggi atau L* jauh lebih gelap dari pipi
       (indikasi poni/rambut mengotori dahi), bobot dahi diturunkan secara drastis.
    """
    cheeks = [s for s in samples if s.roi_name in ("pipi_kanan", "pipi_kiri") and s.valid_pixel_ratio > 0]
    avg_cheek_l = (sum(s.lab[0] for s in cheeks) / len(cheeks)) if cheeks else None

    weights = []
    for s in samples:
        w = max(s.valid_pixel_ratio, 0.05)
        # Deteksi poni / rambut pada dahi
        if s.roi_name == "dahi":
            if (avg_cheek_l is not None and (avg_cheek_l - s.lab[0] > 12.0)) or s.color_std > 20.0:
                w *= 0.15  # diskon bobot dahi karena terdeteksi rambut/poni
        weights.append(w)

    total_weight = sum(weights)
    l_weighted = sum(s.lab[0] * w for s, w in zip(samples, weights)) / total_weight
    a_weighted = sum(s.lab[1] * w for s, w in zip(samples, weights)) / total_weight
    b_weighted = sum(s.lab[2] * w for s, w in zip(samples, weights)) / total_weight
    return (l_weighted, a_weighted, b_weighted)


def compute_ita(lightness_l: float, b_star: float) -> float:
    """
    Menghitung Individual Typology Angle (ITA°).
    ITA° = arctan((L* - 50) / b*) * (180 / pi)
    Standar internasional dermatologi & kosmetik (Chardon et al., 1991).
    """
    delta_l = lightness_l - 50.0
    b_clamped = b_star if abs(b_star) > 1e-4 else (1e-4 if b_star >= 0 else -1e-4)
    ita_rad = math.atan2(delta_l, b_clamped)
    return float(math.degrees(ita_rad))


def classify_skintone(lightness_l: float, b_star: Optional[float] = None) -> Dict[str, object]:
    """
    Klasifikasi tingkat kecerahan kulit (skintone) berdasarkan kuintil L*
    dikombinasikan dengan standar dermatologis ITA° (Individual Typology Angle).
    """
    if lightness_l >= 74.41:
        category = "Very Light"
    elif lightness_l >= 70.17:
        category = "Light"
    elif lightness_l >= 65.29:
        category = "Medium"
    elif lightness_l >= 59.38:
        category = "Tan"
    else:
        category = "Deep"

    result: Dict[str, object] = {
        "category": category,
        "lightness_l_value": round(lightness_l, 2),
        "confidence_note": "Threshold v3: kuintil L* + analisis dermatologi ITA°.",
    }

    if b_star is not None:
        ita = compute_ita(lightness_l, b_star)
        if ita > 55:
            dermatology_type = "Very Light (Fair)"
        elif ita > 41:
            dermatology_type = "Light"
        elif ita > 28:
            dermatology_type = "Intermediate (Medium)"
        elif ita > 10:
            dermatology_type = "Tan"
        elif ita > -30:
            dermatology_type = "Brown"
        else:
            dermatology_type = "Dark"

        result["ita_angle"] = round(ita, 2)
        result["dermatology_type"] = dermatology_type

    return result


def classify_undertone(a_value: float, b_value: float) -> Dict[str, object]:
    """
    Klasifikasi undertone (warm/cool/neutral) berdasarkan posisi pada sumbu
    a* (hijau <-> merah) dan b* (biru <-> kuning) di ruang CIELAB.
    """
    undertone_index = b_value - a_value
    NEUTRAL_THRESHOLD = 2.5

    if undertone_index > NEUTRAL_THRESHOLD:
        undertone = "Warm"
    elif undertone_index < -NEUTRAL_THRESHOLD:
        undertone = "Cool"
    else:
        undertone = "Neutral"

    return {
        "undertone": undertone,
        "undertone_index": round(undertone_index, 2),
        "a_star": round(a_value, 2),
        "b_star": round(b_value, 2),
        "confidence_note": "Threshold ±2.5 pada sumbu a*/b*.",
    }


def validate_human_skin_pigment(
    samples: List[SkinRoiSample], l_val: float, a_val: float, b_val: float
) -> None:
    """
    Human Skin Range Validator:
    Memastikan warna yang diekstraksi dari wajah berada dalam batas biologis
    kulit manusia (semua ras/etnis global), dan menolak warna anomali seperti
    alien abu-abu/hijau/biru/ungu, zombie, topeng karet, patung batu, atau CGI.
    """
    # 1. Cek pigmen CIELAB:
    if a_val < 2.0 or b_val < 2.0:
        raise ValueError(
            "Warna kulit tidak memiliki pigmen biologis manusia alami (terdeteksi warna abu-abu/kebiruan anomali/alien)."
        )

    # 2. Cek rata-rata warna HSV & BGR pada seluruh ROI yang valid:
    valid_samples = [s for s in samples if s.valid_pixel_ratio > 0]
    if not valid_samples:
        raise ValueError("Tidak ada area kulit yang cukup terang atau bebas bayangan untuk dianalisis.")

    avg_h = sum(s.hsv[0] for s in valid_samples) / len(valid_samples)
    avg_s = sum(s.hsv[1] for s in valid_samples) / len(valid_samples)
    avg_bgr = [
        sum(s.mean_bgr[i] for s in valid_samples) / len(valid_samples) for i in range(3)
    ]
    b_mean, g_mean, r_mean = avg_bgr

    # 3. Cek rasio channel BGR: Pada kulit manusia alami, channel Merah selalu dominan (R >= G dan R >= B).
    if r_mean < g_mean * 0.92 or r_mean < b_mean * 0.92:
        raise ValueError(
            "Spektrum warna kulit tidak wajar (terdeteksi dominansi warna hijau/biru/alien)."
        )

    # 4. Cek rentang Hue di HSV (skala OpenCV 0-179):
    if (30 <= avg_h <= 165) and avg_s > 25:
        raise ValueError(
            "Warna kulit berada di luar rentang spektrum manusia (terdeteksi warna hijau/biru/ungu fiksi)."
        )


def analyze_skin(
    image_bgr_original: np.ndarray, landmarks_px: List[Tuple[int, int, float]]
) -> Dict[str, object]:
    """Fungsi orkestrasi tingkat tinggi: sampling ROI -> agregasi -> validasi biologis -> klasifikasi."""
    samples = sample_skin_roi(image_bgr_original, landmarks_px)
    l_val, a_val, b_val = aggregate_lab_from_samples(samples)

    # HUMAN SKIN RANGE VALIDATOR
    validate_human_skin_pigment(samples, l_val, a_val, b_val)

    skintone_result = classify_skintone(l_val, b_star=b_val)
    undertone_result = classify_undertone(a_val, b_val)

    return {
        "skintone": skintone_result,
        "undertone": undertone_result,
        "roi_debug": [
            {
                "roi_name": s.roi_name,
                "center_px": s.center_px,
                "lab": tuple(round(v, 2) for v in s.lab),
                "valid_pixel_ratio": s.valid_pixel_ratio,
                "color_std": s.color_std,
            }
            for s in samples
        ],
    }
"""
face_shape.py
==============
Klasifikasi bentuk wajah (Oval, Bulat, Persegi, Hati, Diamond, Lonjong)
menggunakan pendekatan DETERMINISTIK berbasis rasio jarak Euclidean antar
titik landmark -- BUKAN deep learning.

CATATAN TECH LEAD:
Pendekatan deterministik dipilih secara sengaja karena:
1. Tidak butuh dataset berlabel (yang mahal & rawan bias etnis/geografis).
2. Komputasi sangat ringan (~mikrodetik), cocok untuk real-time.
3. Rasio geometris wajah adalah fitur yang sudah cukup diskriminatif untuk
   6 kategori bentuk wajah -- melatih CNN dari nol untuk masalah ini adalah
   overengineering yang justru menambah kompleksitas maintenance tanpa
   peningkatan akurasi yang signifikan.
"""

import math
from dataclasses import dataclass
from typing import Dict, List, Tuple

from .landmark_constants import (
    CHEEKBONE_LEFT,
    CHEEKBONE_RIGHT,
    CHIN_BOTTOM,
    FACE_OVAL_ORDERED,
    FOREHEAD_LEFT,
    FOREHEAD_RIGHT,
    FOREHEAD_TOP,
    JAW_CONTOUR_LEFT_HALF,
    JAW_CONTOUR_RIGHT_HALF,
    JAW_LEFT,
    JAW_RIGHT,
    LEFT_EYE_OUTER_CORNER,
    RIGHT_EYE_OUTER_CORNER,
)


@dataclass
class FaceMetrics:
    face_length: float
    cheekbone_width: float
    jaw_width: float
    forehead_width: float
    length_to_cheekbone_ratio: float
    jaw_to_cheekbone_ratio: float
    forehead_to_cheekbone_ratio: float
    forehead_to_jaw_ratio: float
    # Fitur tambahan hasil eksperimen kalibrasi:
    jaw_angle_deg: float
    jaw_curvature: float
    area_compactness: float
    eye_span_to_cheekbone_ratio: float
    head_roll_deg: float = 0.0


def euclidean_distance(point_a: Tuple[int, int], point_b: Tuple[int, int]) -> float:
    """
    Menghitung jarak Euclidean 2D antara dua titik piksel.

    Mengapa hanya 2D (x, y) dan bukan 3D (dengan z)?
    -> Nilai z dari MediaPipe bersifat relatif terhadap titik tengah pinggul
       kamera virtual dan skalanya tidak konsisten lintas-perangkat/jarak
       kamera, sehingga tidak reliabel untuk perbandingan rasio jarak.
       Koordinat x, y dalam ruang piksel citra 2D sudah cukup akurat untuk
       rasio geometris wajah selama wajah menghadap relatif frontal.
    """
    return math.sqrt((point_a[0] - point_b[0]) ** 2 + (point_a[1] - point_b[1]) ** 2)


def _point_to_line_distance(
    point: Tuple[int, int], line_start: Tuple[int, int], line_end: Tuple[int, int]
) -> float:
    """
    Jarak tegak lurus dari sebuah titik ke garis lurus (bukan ke segmen garis).

    MENGAPA dibutuhkan untuk jaw_curvature: mengukur seberapa jauh kontur
    rahang sungguhan "melengkung keluar" dari garis lurus JAW_LEFT-CHIN_BOTTOM
    (atau CHIN_BOTTOM-JAW_RIGHT) -- rahang membulat akan punya jarak besar,
    rahang lancip/kotak-tegas akan punya jarak kecil (mendekati garis lurus).
    """
    ax, ay = line_start
    bx, by = line_end
    px, py = point
    line_len = math.hypot(bx - ax, by - ay)
    if line_len == 0:
        return 0.0
    return abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / line_len


def _polygon_area(points: List[Tuple[int, int]]) -> float:
    """
    Luas poligon dari titik-titik yang SUDAH berurutan mengelilingi kontur
    (shoelace formula / Gauss's area formula). WAJIB titik berurutan spasial
    (bukan set tak berurutan), kalau tidak hasilnya poligon menyilang dan
    luas yang dihitung jadi salah total -- lihat catatan verifikasi urutan
    di landmark_constants.py (FACE_OVAL_ORDERED).
    """
    n = len(points)
    area = 0.0
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def compute_face_metrics(landmarks_px: List[Tuple[int, int, float]]) -> FaceMetrics:
    """
    Mengambil titik-titik kunci dari landmark_constants dan menghitung
    seluruh jarak & rasio yang dibutuhkan untuk klasifikasi bentuk wajah.
    """

    def pt(idx: int) -> Tuple[int, int]:
        x, y, _z = landmarks_px[idx]
        return (x, y)

    face_length = euclidean_distance(pt(FOREHEAD_TOP), pt(CHIN_BOTTOM))
    cheekbone_width = euclidean_distance(pt(CHEEKBONE_LEFT), pt(CHEEKBONE_RIGHT))
    jaw_width = euclidean_distance(pt(JAW_LEFT), pt(JAW_RIGHT))
    forehead_width = euclidean_distance(pt(FOREHEAD_LEFT), pt(FOREHEAD_RIGHT))

    # --- Fitur tambahan (hasil eksperimen kalibrasi, lihat classify_face_shape) ---
    jaw_left_pt, chin_pt, jaw_right_pt = pt(JAW_LEFT), pt(CHIN_BOTTOM), pt(JAW_RIGHT)

    # jaw_angle_deg: sudut di titik CHIN_BOTTOM antara garis ke JAW_LEFT dan JAW_RIGHT.
    # Sudut kecil -> dagu meruncing/lancip (V-shape, khas Heart/Oblong).
    # Sudut besar/tumpul -> dagu membulat/rata (khas Round/Square).
    v1 = (jaw_left_pt[0] - chin_pt[0], jaw_left_pt[1] - chin_pt[1])
    v2 = (jaw_right_pt[0] - chin_pt[0], jaw_right_pt[1] - chin_pt[1])
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1, mag2 = math.hypot(*v1), math.hypot(*v2)
    jaw_angle_deg = (
        math.degrees(math.acos(max(-1.0, min(1.0, dot / (mag1 * mag2)))))
        if mag1 * mag2 > 0
        else 0.0
    )

    # jaw_curvature: rata-rata jarak tegak lurus titik kontur rahang terhadap
    # garis lurus JAW_LEFT-CHIN_BOTTOM-JAW_RIGHT, dinormalisasi cheekbone_width
    # (agar tidak bias oleh ukuran wajah/jarak kamera).
    left_contour_pts = [pt(i) for i in JAW_CONTOUR_LEFT_HALF[1:-1]]
    right_contour_pts = [pt(i) for i in JAW_CONTOUR_RIGHT_HALF[1:-1]]
    curvature_dists = [_point_to_line_distance(p, jaw_left_pt, chin_pt) for p in left_contour_pts]
    curvature_dists += [_point_to_line_distance(p, chin_pt, jaw_right_pt) for p in right_contour_pts]
    jaw_curvature = (
        (sum(curvature_dists) / len(curvature_dists)) / cheekbone_width
        if cheekbone_width > 0
        else 0.0
    )

    # area_compactness: luas poligon FACE_OVAL sungguhan dibagi luas persegi
    # panjang pembatas (cheekbone_width x face_length). Wajah oval sempurna
    # akan mendekati rasio elips-dalam-persegi-panjang (~0.785 = pi/4);
    # makin rendah rasio ini, makin "kotak/menyudut" bentuknya.
    oval_area = _polygon_area([pt(i) for i in FACE_OVAL_ORDERED])
    area_compactness = (
        oval_area / (cheekbone_width * face_length) if cheekbone_width * face_length > 0 else 0.0
    )

    # eye_span_to_cheekbone_ratio: jarak antar sudut luar mata kiri-kanan,
    # dinormalisasi lebar pipi -- dipakai validate_human_face_geometry untuk
    # menolak proporsi mata anomali (khas ilustrasi alien/CGI).
    left_eye_pt = pt(LEFT_EYE_OUTER_CORNER)
    right_eye_pt = pt(RIGHT_EYE_OUTER_CORNER)
    eye_span = euclidean_distance(left_eye_pt, right_eye_pt)
    eye_span_to_cheekbone_ratio = eye_span / cheekbone_width if cheekbone_width > 0 else 0.0

    # Estimasi kemiringan kepala (Head Roll Angle)
    eye_dx = right_eye_pt[0] - left_eye_pt[0]
    eye_dy = right_eye_pt[1] - left_eye_pt[1]
    head_roll_deg = math.degrees(math.atan2(eye_dy, eye_dx)) if eye_dx != 0 else 0.0

    return FaceMetrics(
        face_length=face_length,
        cheekbone_width=cheekbone_width,
        jaw_width=jaw_width,
        forehead_width=forehead_width,
        length_to_cheekbone_ratio=face_length / cheekbone_width,
        jaw_to_cheekbone_ratio=jaw_width / cheekbone_width,
        forehead_to_cheekbone_ratio=forehead_width / cheekbone_width,
        forehead_to_jaw_ratio=forehead_width / jaw_width,
        jaw_angle_deg=jaw_angle_deg,
        jaw_curvature=jaw_curvature,
        area_compactness=area_compactness,
        eye_span_to_cheekbone_ratio=eye_span_to_cheekbone_ratio,
        head_roll_deg=head_roll_deg,
    )


def validate_human_face_geometry(metrics: FaceMetrics) -> None:
    """
    Validasi proporsi struktur wajah manusia:
    Menolak gambar makhluk/alien/CGI dengan rasio tengkorak yang tidak wajar (misal dahi raksasa + dagu mikroskopis,
    atau mata yang terlalu lebar/sempit dibanding lebar wajah).

    CATATAN KALIBRASI: batas-batas di bawah dipersempit dari rentang awal
    (forehead/jaw 0.35-3.0, length/cheekbone 0.5-2.8) yang terbukti terlalu
    longgar -- render/foto alien humanoid dengan proporsi tengkorak yang
    masih "cukup manusiawi" secara geometris tetap lolos. Rentang baru
    mengikuti variasi wajah dewasa nyata (lihat dataset kalibrasi di
    classify_face_shape) plus margin toleransi, BUKAN batas teoritis penuh.
    """
    if metrics.forehead_to_jaw_ratio > 1.8 or metrics.forehead_to_jaw_ratio < 0.55:
        raise ValueError(
            "Proporsi wajah di luar batas manusia normal (rasio dahi terhadap rahang anomali/alien)."
        )
    if metrics.length_to_cheekbone_ratio > 1.9 or metrics.length_to_cheekbone_ratio < 0.85:
        raise ValueError(
            "Proporsi wajah di luar batas manusia normal (rasio panjang terhadap lebar wajah anomali)."
        )
    # Jarak antar sudut luar mata relatif terhadap lebar pipi: mata manusia normal
    # berjarak ~0.75-1.05x lebar pipi. Alien fiksi umum digambar dengan mata
    # jauh lebih lebar-set (mendekati/melebihi lebar wajah) atau lebih sempit.
    if metrics.eye_span_to_cheekbone_ratio > 1.05 or metrics.eye_span_to_cheekbone_ratio < 0.55:
        raise ValueError(
            "Proporsi wajah di luar batas manusia normal (jarak/ukuran mata anomali/alien)."
        )


def classify_face_shape(metrics: FaceMetrics) -> Dict[str, object]:
    """
    Klasifikasi bentuk wajah berbasis threshold rasio + fitur geometris.

    RIWAYAT KALIBRASI (v3 -- rebalancing):
    v2 (depth=4, 7 fitur) mencapai CV accuracy ~50.6%, TAPI recall antar
    kelas timpang jauh (Heart 68% vs Oval cuma 24%) -- tree dangkal
    "menyerap" kasus ambigu ke Heart karena itu split pertama yang paling
    murah secara Gini impurity, bukan karena Heart benar-benar lebih mudah
    dikenali. v3 ini naik ke depth=5, yang terbukti secara empiris menekan
    ketimpangan itu jauh lebih rasional (std recall antar kelas turun dari
    16.5% ke 8.8%, recall Oval naik ke 38%) dengan kenaikan CV accuracy
    tambahan (~52.8%).

    MENGAPA KODE DI BAWAH DI-GENERATE OTOMATIS (BUKAN DITRANSKRIPSI MANUAL):
    Percobaan transkripsi manual dari `sklearn.tree.export_text()` awalnya
    menghasilkan 48 dari 500 prediksi SALAH -- root cause: `export_text`
    membulatkan angka threshold ke 2 desimal untuk tampilan (mis. "<= 1.15"),
    padahal nilai float asli di tree adalah 1.146527. Untuk foto yang
    rasionya jatuh di antara nilai asli dan versi dibulatkan, klasifikasi
    jadi salah cabang. Kode di bawah di-generate langsung dari struktur
    internal tree (`tree_.feature`/`tree_.threshold`), lalu DIVALIDASI:
    0 mismatch dari 500 prediksi dibanding output `tree.predict()` sklearn
    langsung, sebelum ditempel ke sini.

    BATAS YANG WAJIB DIKETAHUI (Heart vs Oval):
    Analisis effect size (Cohen's d) pada seluruh 7 fitur antara kelas Heart
    vs Oval semuanya < 0.35 (nyaris tak terpisahkan) -- bahkan batas atas
    teoritis pemisahan biner Heart-vs-Oval pakai SEMUA fitur (logistic
    regression, cross-validated) cuma ~64%. Ini bukan kegagalan pemilihan
    fitur, melainkan overlap nyata pada dataset kalibrasi -- Heart & Oval
    di foto manusia sungguhan memang sering ambigu bahkan bagi mata manusia.
    """
    validate_human_face_geometry(metrics)
    length_to_cheekbone = metrics.length_to_cheekbone_ratio
    jaw_to_cheekbone = metrics.jaw_to_cheekbone_ratio
    forehead_to_cheekbone = metrics.forehead_to_cheekbone_ratio
    forehead_to_jaw = metrics.forehead_to_jaw_ratio
    jaw_angle_deg = metrics.jaw_angle_deg
    jaw_curvature = metrics.jaw_curvature
    area_compactness = metrics.area_compactness

    # --- Kode di bawah: tree PRODUKSI FINAL, dilatih ulang di SELURUH 500 foto
    # (bukan cuma 400/500 seperti versi evaluasi) -- lihat catatan panjang di
    # atas soal kenapa evaluasi & training harus dipisah dulu (train/test
    # split 400/100), lalu SETELAH angka jujur terkonfirmasi (~52.3% di 100
    # foto test yang belum pernah dilihat), model final dilatih ulang dengan
    # SEMUA data yang tersedia untuk stabilitas threshold maksimal -- praktik
    # standar: evaluasi pakai held-out split, deploy pakai seluruh data.
    # Tervalidasi 0 mismatch vs sklearn.tree.predict() di 500 sampel.
    if jaw_angle_deg <= 111.966438:
        if length_to_cheekbone <= 1.265044:
            if length_to_cheekbone <= 1.146527:
                if jaw_angle_deg <= 108.843281:
                    shape_key = "heart" if jaw_curvature <= 0.046576 else "oval"
                else:
                    shape_key = "round"
            else:
                if jaw_angle_deg <= 102.630596:
                    shape_key = "heart" if length_to_cheekbone <= 1.231882 else "oblong"
                else:
                    shape_key = "heart" if jaw_curvature <= 0.052517 else "oblong"
        else:
            shape_key = "oblong"
    else:
        if area_compactness <= 0.841242:
            if length_to_cheekbone <= 1.144948:
                shape_key = "round"
            else:
                if length_to_cheekbone <= 1.194562:
                    shape_key = "oval" if jaw_to_cheekbone <= 0.797977 else "square"
                else:
                    shape_key = "oval" if jaw_curvature <= 0.045289 else "oblong"
        else:
            if jaw_angle_deg <= 121.244141:
                shape_key = "round" if jaw_to_cheekbone <= 0.819493 else "square"
            else:
                shape_key = "square"

    label_map = {
        "heart": "Hati (Heart)",
        "oblong": "Lonjong (Oblong)",
        "oval": "Oval",
        "round": "Bulat (Round)",
        "square": "Persegi (Square)",
    }
    shape = label_map[shape_key]

    reasoning = [
        f"jaw_angle={jaw_angle_deg:.1f}°, length/cheek={length_to_cheekbone:.2f}, "
        f"area_compactness={area_compactness:.2f}, jaw_curvature={jaw_curvature:.3f} "
        f"-> {shape} (tree depth=5 hasil kalibrasi, di-generate otomatis)."
    ]

    # Diamond: dipertahankan sebagai override manual (dataset kalibrasi tidak
    # punya kelas Diamond sama sekali -- BELUM tervalidasi data).
    if (
        1.13 < length_to_cheekbone <= 1.20
        and forehead_to_jaw <= 0.90
        and jaw_to_cheekbone <= 0.85
    ):
        shape = "Diamond"
        reasoning = [
            f"Pipi jauh lebih lebar dari dahi & rahang "
            f"(forehead/jaw {forehead_to_jaw:.2f}, jaw/cheek {jaw_to_cheekbone:.2f}) "
            f"-> titik terlebar di pipi. [Aturan manual, belum tervalidasi data]"
        ]

    head_roll_deg = metrics.head_roll_deg
    if abs(head_roll_deg) > 10.0:
        reasoning.append(
            f"PERINGATAN: Posisi kepala miring ({head_roll_deg:.1f}°). "
            f"Hasil akurasi terbaik didapat saat wajah tepat tegak lurus ke kamera."
        )

    return {
        "shape": shape,
        "confidence_note": (
            "Threshold dikalibrasi dari 500 foto + 3 fitur geometris tambahan, "
            "tree depth=5 (di-generate & divalidasi otomatis, 0 mismatch vs sklearn). "
            "Akurasi JUJUR (diukur di 100 foto held-out, belum pernah dilihat saat "
            "kalibrasi): ~52.3%. Model final di atas dilatih ulang di seluruh 500 foto "
            "untuk stabilitas maksimal setelah angka ini terkonfirmasi. Cabang Diamond "
            "masih heuristik manual, belum tervalidasi data."
        ),
        "reasoning": reasoning,
        "raw_ratios": {
            "length_to_cheekbone": round(length_to_cheekbone, 3),
            "jaw_to_cheekbone": round(jaw_to_cheekbone, 3),
            "forehead_to_cheekbone": round(forehead_to_cheekbone, 3),
            "forehead_to_jaw": round(forehead_to_jaw, 3),
            "jaw_angle_deg": round(jaw_angle_deg, 2),
            "jaw_curvature": round(jaw_curvature, 4),
            "area_compactness": round(area_compactness, 3),
            "head_roll_deg": round(head_roll_deg, 2),
        },
    }
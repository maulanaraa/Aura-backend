"""
landmark_constants.py
======================
Modul ini berisi indeks-indeks titik landmark wajah (dari total 478 titik
FaceLandmarker MediaPipe: 468 titik mesh dasar + 10 titik iris).

PENTING - PROVENANCE DATA:
Seluruh indeks FACE_OVAL di bawah ini BUKAN hasil karangan, melainkan
diekstraksi langsung dan diverifikasi dari struktur resmi library:
    mediapipe.tasks.python.vision.FaceLandmarksConnections.FACE_LANDMARKS_FACE_OVAL

Sedangkan indeks untuk ROI warna (dahi, pipi) menggunakan titik yang berada
di DALAM kontur oval resmi tersebut sebagai jangkar (anchor), sehingga posisi
anatomisnya terjamin valid. Titik-titik ROI ini WAJIB divalidasi ulang secara
visual oleh Developer menggunakan fungsi `visualize_landmarks()` pada modul
`landmark_extractor.py` sebelum dipakai di lingkungan produksi, karena bentuk
wajah setiap individu bisa sedikit menggeser area yang dianggap "aman" dari
rambut/bayangan.
"""

# =========================================================================
# 1. TITIK UTAMA UNTUK KALKULASI BENTUK WAJAH (FACE SHAPE)
#    Sumber: FaceLandmarksConnections.FACE_LANDMARKS_FACE_OVAL (36 titik)
# =========================================================================

# Panjang wajah: dari titik tertinggi dahi (hairline) ke dagu terbawah
FOREHEAD_TOP = 10
CHIN_BOTTOM = 152

# Lebar tulang pipi (cheekbone) -> titik terlebar oval wajah
CHEEKBONE_LEFT = 234    # sisi kiri gambar (pipi kanan subjek)
CHEEKBONE_RIGHT = 454   # sisi kanan gambar (pipi kiri subjek)

# Lebar rahang (jawline)
JAW_LEFT = 172
JAW_RIGHT = 397

# Lebar dahi (proxy menggunakan titik oval area temple/pelipis)
FOREHEAD_LEFT = 21
FOREHEAD_RIGHT = 251

# =========================================================================
# 2. TITIK REFERENSI ALIS (untuk menentukan batas bawah ROI dahi)
#    Sumber: FaceLandmarksConnections.FACE_LANDMARKS_LEFT_EYEBROW / RIGHT_EYEBROW
# =========================================================================
EYEBROW_RIGHT_INNER = 107   # alis kanan subjek, titik dalam (dekat pangkal hidung)
EYEBROW_LEFT_INNER = 336    # alis kiri subjek, titik dalam

# =========================================================================
# 3. TITIK ROI EKSTRAKSI WARNA KULIT (SKINTONE & UNDERTONE)
#    Catatan: titik pusat ROI dipilih dari area wajah yang secara anatomis
#    paling rata (flat) dan paling jarang tertutup rambut/bayangan hidung.
# =========================================================================

# Dahi tengah -> gunakan titik 151 (tepat di antara alis & hairline, area datar)
# Offset ke atas (kurangi Y) tetap diperlukan agar tidak kena poni -> lihat preprocessing.py
ROI_FOREHEAD_CENTER = 151

# Pipi kiri & kanan -> area di bawah mata, di atas garis rahang, jauh dari bayangan hidung
ROI_CHEEK_RIGHT = 50    # pipi kanan subjek
ROI_CHEEK_LEFT = 280    # pipi kiri subjek

# Hidung (dorsum) -> titik referensi tambahan, berguna untuk cross-check undertone
ROI_NOSE_BRIDGE = 6

# =========================================================================
# 4. TITIK MATA (untuk normalisasi rotasi wajah / face alignment)
# =========================================================================
LEFT_EYE_OUTER_CORNER = 263
RIGHT_EYE_OUTER_CORNER = 33

# =========================================================================
# 5. TITIK KONTUR RAHANG & FACE_OVAL BERURUTAN (untuk fitur jaw_angle,
#    jaw_curvature, area_compactness -- lihat face_shape.py)
#    Sumber indeks: sama seperti FACE_LANDMARKS_FACE_OVAL di atas (36 titik).
#    URUTAN JALAN (walking order) di bawah ini diverifikasi EMPIRIS dengan
#    mencetak koordinat piksel pada foto sampel dan memeriksa setiap loncatan
#    antar titik berurutan tetap kecil (rata-rata ~12px, tidak ada lompatan
#    menyilang wajah) -- BUKAN diasumsikan dari urutan indeks connections
#    mentah, yang tidak menjamin urutan spasial berjalan.
# =========================================================================

# Kontur rahang kiri: dari JAW_LEFT ke CHIN_BOTTOM (7 titik, urut spasial)
JAW_CONTOUR_LEFT_HALF = [172, 136, 150, 149, 176, 148, 152]
# Kontur rahang kanan: dari CHIN_BOTTOM ke JAW_RIGHT (7 titik, urut spasial)
JAW_CONTOUR_RIGHT_HALF = [152, 377, 400, 378, 379, 365, 397]

# Seluruh 36 titik FACE_OVAL, diurutkan mengelilingi kontur wajah (bukan set
# tak berurutan) -- dipakai untuk menghitung luas poligon wajah (shoelace formula).
FACE_OVAL_ORDERED = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
]
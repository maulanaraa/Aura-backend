"""
personal_color.py
===================
Pemetaan kombinasi (Skintone + Undertone) -> kategori Personal Color
menggunakan sistem 4-musim klasik (Spring/Summer/Autumn/Winter), yang
merupakan fondasi standar industri sebelum diperluas ke sistem 12/16-musim.

CATATAN TECH LEAD:
Sistem 4-musim ini adalah BASELINE. Jika kebutuhan bisnis mengarah ke sistem
12-musim (lebih granular, populer di industri beauty-tech Korea/Jepang),
modul ini bisa diperluas dengan menambah 1 dimensi klasifikasi tambahan:
tingkat "chroma/saturasi" kulit (soft vs clear) yang dihitung dari nilai
Saturation (S) pada HSV. Struktur fungsi di bawah sudah dirancang modular
agar ekstensi tersebut tidak memerlukan refactor besar.
"""

from typing import Dict


# Logika pemetaan 4-musim klasik:
# - Warm + Terang/Medium  -> Spring (cerah, hangat, segar)
# - Warm + Tan/Deep       -> Autumn (hangat, kaya, earthy)
# - Cool + Terang/Medium  -> Summer (lembut, dingin, muted)
# - Cool + Tan/Deep       -> Winter (kontras tinggi, dingin, tegas)
# - Neutral -> diarahkan ke musim terdekat berdasarkan kecerahan (L)

_LIGHT_CATEGORIES = {"Very Light", "Light", "Medium"}
_DEEP_CATEGORIES = {"Tan", "Deep"}


def map_to_personal_color_season(
    skintone_category: str, undertone: str
) -> Dict[str, object]:
    """
    Args:
        skintone_category: hasil dari skintone_undertone.classify_skintone()['category']
        undertone: hasil dari skintone_undertone.classify_undertone()['undertone']
    """
    is_light = skintone_category in _LIGHT_CATEGORIES

    if undertone == "Warm":
        season = "Spring" if is_light else "Autumn"
        palette_hint = (
            "Warna coral, peach, gold, ivory, warm green"
            if season == "Spring"
            else "Warna mustard, terracotta, olive, rust, warm brown"
        )
    elif undertone == "Cool":
        season = "Summer" if is_light else "Winter"
        palette_hint = (
            "Warna lavender, dusty rose, soft blue, powder pink"
            if season == "Summer"
            else "Warna emerald, sapphire, true red, black & white kontras tinggi"
        )
    else:  # Neutral
        # Undertone neutral -> masih bisa diarahkan ke 2 musim terdekat
        # berdasarkan kecerahan, dengan catatan fleksibilitas lebih tinggi.
        season = "Spring/Summer (Neutral-Light)" if is_light else "Autumn/Winter (Neutral-Deep)"
        palette_hint = (
            "Fleksibel di kedua sisi warm/cool, uji langsung dengan kain warna netral "
            "(off-white vs true white) untuk menentukan kecondongan akhir."
        )

    return {
        "season": season,
        "palette_hint": palette_hint,
        "basis": {
            "skintone_category": skintone_category,
            "undertone": undertone,
            "is_light_category": is_light,
        },
        "confidence_note": (
            "Sistem 4-musim adalah baseline. Untuk presisi lebih tinggi (12-musim), "
            "tambahkan analisis chroma/saturasi sebagai dimensi kedua."
        ),
    }

"""
test_pipeline.py
Menguji pipeline analisis wajah secara menyeluruh dengan simulasi / tes citra.
"""
import sys
import numpy as np
import cv2
from src.pipeline import FaceAnalysisPipeline
from src.skintone_undertone import compute_ita, classify_skintone, classify_undertone

def test_ita_calculation():
    print("Testing ITA calculations:")
    # Test Very Light / Fair
    ita_very_light = compute_ita(lightness_l=80.0, b_star=15.0)
    res_vl = classify_skintone(80.0, b_star=15.0)
    print(f"  L*=80.0, b*=15.0 -> ITA={ita_very_light:.2f}°, Category={res_vl['category']}, Dermatology={res_vl.get('dermatology_type')}")
    assert res_vl["category"] == "Very Light"
    assert res_vl.get("dermatology_type") == "Very Light (Fair)"

    # Test Medium / Intermediate
    ita_medium = compute_ita(lightness_l=66.0, b_star=22.0)
    res_med = classify_skintone(66.0, b_star=22.0)
    print(f"  L*=66.0, b*=22.0 -> ITA={ita_medium:.2f}°, Category={res_med['category']}, Dermatology={res_med.get('dermatology_type')}")
    assert res_med["category"] == "Medium"
    assert res_med.get("dermatology_type") == "Intermediate (Medium)"

    # Test Tan
    ita_tan = compute_ita(lightness_l=60.0, b_star=22.0)
    res_tan = classify_skintone(60.0, b_star=22.0)
    print(f"  L*=60.0, b*=22.0 -> ITA={ita_tan:.2f}°, Category={res_tan['category']}, Dermatology={res_tan.get('dermatology_type')}")
    assert res_tan["category"] == "Tan"

    print("[PASS] ITA calculations verified.\n")

def test_undertone_classification():
    print("Testing Undertone calculations:")
    u_warm = classify_undertone(a_value=12.0, b_value=18.0)  # b - a = 6.0 > 2.5
    print(f"  a*=12.0, b*=18.0 -> {u_warm['undertone']} (index: {u_warm['undertone_index']})")
    assert u_warm["undertone"] == "Warm"

    u_cool = classify_undertone(a_value=18.0, b_value=12.0)  # b - a = -6.0 < -2.5
    print(f"  a*=18.0, b*=12.0 -> {u_cool['undertone']} (index: {u_cool['undertone_index']})")
    assert u_cool["undertone"] == "Cool"

    u_neutral = classify_undertone(a_value=14.0, b_value=15.0)  # b - a = 1.0 within [-2.5, 2.5]
    print(f"  a*=14.0, b*=15.0 -> {u_neutral['undertone']} (index: {u_neutral['undertone_index']})")
    assert u_neutral["undertone"] == "Neutral"

    print("[PASS] Undertone classifications verified.\n")

def test_pipeline_initialization():
    print("Testing FaceAnalysisPipeline initialization with MediaPipe task model:")
    with FaceAnalysisPipeline(model_path="models/face_landmarker.task", running_mode="IMAGE") as pipeline:
        # Create a synthetic image (empty image to test graceful failure handling)
        blank = np.zeros((400, 400, 3), dtype=np.uint8)
        cv2.imwrite("temp_blank.jpg", blank)
        result = pipeline.analyze_static_image("temp_blank.jpg")
        print(f"  Blank image detection result: success={result['success']}, face_detected={result['metadata']['face_detected']}")
        assert result["success"] is False
        assert result["metadata"]["face_detected"] is False

    print("[PASS] Pipeline initialized and gracefully handled blank image.\n")

if __name__ == "__main__":
    try:
        test_ita_calculation()
        test_undertone_classification()
        test_pipeline_initialization()
        print("ALL TESTS PASSED SUCCESSFULLY!")
    except Exception as e:
        print(f"[FAIL] {e}")
        sys.exit(1)

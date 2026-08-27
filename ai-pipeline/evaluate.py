"""
evaluate.py
============
Script evaluasi otomatis untuk memvalidasi akurasi FaceAnalysisPipeline
terhadap dataset publik berlabel.

Mendukung 2 task evaluasi (skintone/undertone TIDAK didukung otomatis di sini
-- lihat catatan di bagian bawah file soal kenapa):
    - face_shape     : dataset dengan struktur folder per kategori bentuk wajah
    - personal_color : dataset dengan struktur folder per kategori musim

STRUKTUR DATASET YANG DIHARAPKAN (format ImageFolder standar):
    dataset_root/
        <nama_label_1>/
            foto1.jpg
        <nama_label_2>/
            foto2.jpg
        ...

CARA PAKAI:
    python evaluate.py --dataset-dir path/ke/dataset --task face_shape
    python evaluate.py --dataset-dir path/ke/dataset --task face_shape --max-per-class 20

Output tersimpan di --output-dir (default: eval_results/):
    - results_detail.csv    -> hasil per-foto (label asli, prediksi, benar/salah)
    - confusion_matrix.csv  -> tabel confusion matrix
    - summary.txt           -> ringkasan akurasi & metrik per-kelas
"""

import argparse
import csv
import os
import time
from typing import Dict, List, Optional, Tuple

from src.pipeline import FaceAnalysisPipeline

# =========================================================================
# PEMETAAN LABEL (WAJIB DISESUAIKAN JIKA DATASET ANDA PAKAI PENAMAAN LAIN)
# =========================================================================
# Mengapa perlu 2 mapping terpisah (ground truth vs prediksi)?
# -> Nama folder dataset publik (bahasa Inggris, singkat: "oval", "spring")
#    berbeda format dengan string output pipeline kita (bahasa Indonesia,
#    dengan embel-embel: "Lonjong (Oblong)", "Bulat (Round)"). Kedua sisi
#    perlu dinormalisasi ke satu label kanonik yang sama agar bisa dibandingkan.
#
# CATATAN: string di PREDICTION_MAP ini SUDAH diverifikasi persis terhadap
# face_shape.py / personal_color.py di folder ML Anda (bukan asumsi/hallucination) --
# lihat classify_face_shape() dan map_to_personal_color_season().

FACE_SHAPE_GROUND_TRUTH_MAP: Dict[str, str] = {
    "heart": "Heart",
    "oblong": "Oblong",
    "oval": "Oval",
    "round": "Round",
    "square": "Square",
    "diamond": "Diamond",
}

FACE_SHAPE_PREDICTION_MAP: Dict[str, str] = {
    "oval": "Oval",
    "bulat (round)": "Round",
    "persegi (square)": "Square",
    "hati (heart)": "Heart",
    "lonjong (oblong)": "Oblong",
    "diamond": "Diamond",
}

PERSONAL_COLOR_GROUND_TRUTH_MAP: Dict[str, str] = {
    "spring": "Spring",
    "summer": "Summer",
    "fall": "Autumn",
    "autumn": "Autumn",
    "winter": "Winter",
}

PERSONAL_COLOR_PREDICTION_MAP: Dict[str, str] = {
    "spring": "Spring",
    "summer": "Summer",
    "autumn": "Autumn",
    "winter": "Winter",
    # Kasus undertone Neutral -> pipeline mengembalikan 2 kandidat musim
    # sekaligus (lihat personal_color.py). Ini TIDAK otomatis dianggap salah,
    # melainkan kategori tersendiri "Neutral-*" agar Anda bisa menganalisis
    # terpisah seberapa sering kasus ambigu ini muncul.
    "spring/summer (neutral-light)": "Neutral-Light",
    "autumn/winter (neutral-deep)": "Neutral-Deep",
}

TASK_CONFIG = {
    "face_shape": {
        "ground_truth_map": FACE_SHAPE_GROUND_TRUTH_MAP,
        "prediction_map": FACE_SHAPE_PREDICTION_MAP,
        "extract_prediction": lambda result: result["face_shape"]["shape"],
    },
    "personal_color": {
        "ground_truth_map": PERSONAL_COLOR_GROUND_TRUTH_MAP,
        "prediction_map": PERSONAL_COLOR_PREDICTION_MAP,
        "extract_prediction": lambda result: result["personal_color"]["season"],
    },
}

SUPPORTED_EXTENSIONS = (".jpg", ".jpeg", ".png")


def normalize_label(raw_label: str, mapping: Dict[str, str]) -> str:
    """
    Menormalisasi label mentah (dari nama folder ATAU dari output pipeline)
    ke label kanonik menggunakan mapping yang sesuai task.

    Jika label tidak ditemukan di mapping, dikembalikan sebagai
    "UNKNOWN:<label_asli>" -- ini SENGAJA tidak di-drop diam-diam, supaya
    Anda sadar ada kategori dataset yang belum dipetakan (lihat summary.txt).
    """
    key = raw_label.strip().lower()
    return mapping.get(key, f"UNKNOWN:{raw_label}")


def discover_dataset_images(dataset_dir: str, max_per_class: Optional[int]) -> List[Tuple[str, str]]:
    """
    Menelusuri struktur folder dataset dan mengembalikan list
    (image_path, ground_truth_folder_name).

    Args:
        max_per_class: batasi jumlah foto per kelas (berguna untuk smoke-test
            cepat sebelum menjalankan evaluasi penuh yang bisa memakan waktu lama).
    """
    pairs: List[Tuple[str, str]] = []
    if not os.path.isdir(dataset_dir):
        raise FileNotFoundError(f"Folder dataset tidak ditemukan: {dataset_dir}")

    for folder_name in sorted(os.listdir(dataset_dir)):
        folder_path = os.path.join(dataset_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue

        files = sorted(
            f for f in os.listdir(folder_path)
            if f.lower().endswith(SUPPORTED_EXTENSIONS)
        )
        if max_per_class is not None:
            files = files[:max_per_class]

        for filename in files:
            pairs.append((os.path.join(folder_path, filename), folder_name))

    return pairs


def evaluate_dataset(
    dataset_dir: str,
    task: str,
    model_path: str,
    max_per_class: Optional[int],
) -> Tuple[List[Dict[str, object]], Dict[str, Dict[str, int]], int, set]:
    """
    Menjalankan pipeline terhadap seluruh foto dataset, mengumpulkan hasil
    per-foto dan confusion matrix.

    MENGAPA pipeline di-load SEKALI di luar loop (bukan per-foto): re-load
    model .task per foto akan membuat evaluasi ratusan/ribuan foto menjadi
    sangat lambat -- sama seperti alasan lifespan() di api.py.
    """
    config = TASK_CONFIG[task]
    pairs = discover_dataset_images(dataset_dir, max_per_class)
    if not pairs:
        raise ValueError(f"Tidak ada foto ditemukan di {dataset_dir} (cek ekstensi: {SUPPORTED_EXTENSIONS})")

    detail_rows: List[Dict[str, object]] = []
    confusion: Dict[str, Dict[str, int]] = {}
    detection_failures = 0
    unmapped_ground_truth: set = set()

    with FaceAnalysisPipeline(model_path=model_path, running_mode="IMAGE") as pipeline:
        for idx, (image_path, folder_name) in enumerate(pairs, start=1):
            ground_truth = normalize_label(folder_name, config["ground_truth_map"])
            if ground_truth.startswith("UNKNOWN:"):
                unmapped_ground_truth.add(folder_name)

            try:
                result = pipeline.analyze_static_image(image_path)
            except Exception as processing_error:  # noqa: BLE001 -- evaluasi harus lanjut walau 1 foto korup
                detail_rows.append({
                    "image_path": image_path,
                    "ground_truth": ground_truth,
                    "prediction": "PROCESSING_ERROR",
                    "correct": False,
                    "note": str(processing_error),
                })
                detection_failures += 1
                continue

            if not result["success"]:
                detail_rows.append({
                    "image_path": image_path,
                    "ground_truth": ground_truth,
                    "prediction": "DETECTION_FAILED",
                    "correct": False,
                    "note": result.get("error_message", ""),
                })
                detection_failures += 1
                continue

            raw_prediction = config["extract_prediction"](result)
            prediction = normalize_label(raw_prediction, config["prediction_map"])
            correct = prediction == ground_truth

            detail_rows.append({
                "image_path": image_path,
                "ground_truth": ground_truth,
                "prediction": prediction,
                "correct": correct,
                "note": "",
            })

            confusion.setdefault(ground_truth, {})
            confusion[ground_truth][prediction] = confusion[ground_truth].get(prediction, 0) + 1

            if idx % 25 == 0:
                print(f"  ... {idx}/{len(pairs)} foto diproses")

    return detail_rows, confusion, detection_failures, unmapped_ground_truth


def _write_detail_csv(rows: List[Dict[str, object]], path: str) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _write_confusion_matrix_csv(confusion: Dict[str, Dict[str, int]], path: str) -> None:
    all_labels = sorted(set(confusion.keys()) | {p for preds in confusion.values() for p in preds})
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["ground_truth \\ predicted"] + all_labels)
        for true_label in all_labels:
            row = [true_label] + [confusion.get(true_label, {}).get(pred, 0) for pred in all_labels]
            writer.writerow(row)


def _compute_class_metrics(confusion: Dict[str, Dict[str, int]]) -> Dict[str, Dict[str, float]]:
    """
    Menghitung precision, recall, dan F1-score per kelas dari confusion matrix,
    tanpa dependency eksternal (scikit-learn) -- implementasi manual murni
    Python agar requirements.txt ML tetap ringan.
    """
    all_labels = sorted(set(confusion.keys()) | {p for preds in confusion.values() for p in preds})
    metrics: Dict[str, Dict[str, float]] = {}

    for label in all_labels:
        true_positive = confusion.get(label, {}).get(label, 0)
        false_negative = sum(
            count for pred, count in confusion.get(label, {}).items() if pred != label
        )
        false_positive = sum(
            confusion.get(other_true, {}).get(label, 0)
            for other_true in all_labels
            if other_true != label
        )

        precision = true_positive / (true_positive + false_positive) if (true_positive + false_positive) > 0 else 0.0
        recall = true_positive / (true_positive + false_negative) if (true_positive + false_negative) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        metrics[label] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": true_positive + false_negative,
        }

    return metrics


def _write_summary(
    detail_rows: List[Dict[str, object]],
    confusion: Dict[str, Dict[str, int]],
    detection_failures: int,
    unmapped_ground_truth: set,
    task: str,
    elapsed_seconds: float,
    path: str,
) -> None:
    total = len(detail_rows)
    evaluated = total - detection_failures
    correct_count = sum(1 for row in detail_rows if row["correct"])
    accuracy = correct_count / evaluated if evaluated > 0 else 0.0
    detection_rate = evaluated / total if total > 0 else 0.0
    metrics = _compute_class_metrics(confusion)

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"EVALUASI: {task}\n")
        f.write(f"Waktu proses: {elapsed_seconds:.1f} detik ({total} foto)\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Total foto           : {total}\n")
        f.write(f"Wajah gagal terdeteksi: {detection_failures}\n")
        f.write(f"Detection rate       : {detection_rate:.1%}\n")
        f.write(f"Akurasi (dari yg terdeteksi): {accuracy:.1%} ({correct_count}/{evaluated})\n\n")

        if unmapped_ground_truth:
            f.write("PERINGATAN -- kategori dataset berikut TIDAK ditemukan di mapping,\n")
            f.write("dilewati dari perhitungan akurasi (tambahkan manual ke *_GROUND_TRUTH_MAP):\n")
            for label in sorted(unmapped_ground_truth):
                f.write(f"  - {label}\n")
            f.write("\n")

        f.write("METRIK PER KELAS\n")
        f.write("-" * 60 + "\n")
        f.write(f"{'Kelas':<25}{'Precision':<12}{'Recall':<12}{'F1':<10}{'Support':<10}\n")
        for label, m in sorted(metrics.items()):
            f.write(f"{label:<25}{m['precision']:<12.2%}{m['recall']:<12.2%}{m['f1']:<10.2%}{int(m['support']):<10}\n")

    print(f"Hasil tersimpan di: {os.path.dirname(path) or '.'}")


def _write_confusion_matrix_png(confusion: Dict[str, Dict[str, int]], path: str, task: str) -> None:
    """
    Merender confusion matrix sebagai heatmap PNG -- lebih mudah dibaca
    polanya sekilas dibanding CSV mentah, terutama untuk melihat kelas mana
    yang paling sering "dituduh" jadi kelas lain (mis. semua tertarik ke Oval).

    MENGAPA matplotlib Agg backend secara eksplisit: skrip ini dijalankan dari
    CLI tanpa display (headless), bukan di notebook/GUI -- backend default
    matplotlib bisa gagal mencari display X11 di beberapa environment (mis.
    WSL/server tanpa GUI) kalau tidak diset manual.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    all_labels = sorted(set(confusion.keys()) | {p for preds in confusion.values() for p in preds})
    if not all_labels:
        return

    matrix = np.array([
        [confusion.get(true_label, {}).get(pred, 0) for pred in all_labels]
        for true_label in all_labels
    ])

    fig, ax = plt.subplots(figsize=(max(6, len(all_labels) * 1.2), max(5, len(all_labels) * 1.1)))
    im = ax.imshow(matrix, cmap="Blues")

    ax.set_xticks(range(len(all_labels)))
    ax.set_yticks(range(len(all_labels)))
    ax.set_xticklabels(all_labels, rotation=45, ha="right")
    ax.set_yticklabels(all_labels)
    ax.set_xlabel("Prediksi Pipeline")
    ax.set_ylabel("Ground Truth (Label Dataset)")
    ax.set_title(f"Confusion Matrix -- {task}")

    # Anotasi angka di setiap sel. Warna teks disesuaikan (putih di sel gelap,
    # hitam di sel terang) agar tetap terbaca -- ambang 50% dari nilai maksimum.
    threshold = matrix.max() / 2 if matrix.max() > 0 else 0
    for i in range(len(all_labels)):
        for j in range(len(all_labels)):
            value = matrix[i, j]
            color = "white" if value > threshold else "black"
            ax.text(j, i, str(value), ha="center", va="center", color=color, fontsize=10)

    fig.colorbar(im, ax=ax, label="Jumlah foto")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluasi akurasi FaceAnalysisPipeline terhadap dataset publik berlabel"
    )
    parser.add_argument("--dataset-dir", required=True, help="Path ke folder dataset (format ImageFolder per-kelas)")
    parser.add_argument("--task", required=True, choices=list(TASK_CONFIG.keys()), help="Task yang dievaluasi")
    parser.add_argument("--model", default="models/face_landmarker.task", help="Path ke model .task MediaPipe")
    parser.add_argument("--output-dir", default="eval_results", help="Folder output hasil evaluasi")
    parser.add_argument("--max-per-class", type=int, default=None, help="Batasi jumlah foto per kelas (untuk smoke-test cepat)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print(f"Menjalankan evaluasi task='{args.task}' terhadap dataset: {args.dataset_dir}")
    start = time.time()
    detail_rows, confusion, detection_failures, unmapped = evaluate_dataset(
        dataset_dir=args.dataset_dir,
        task=args.task,
        model_path=args.model,
        max_per_class=args.max_per_class,
    )
    elapsed = time.time() - start

    _write_detail_csv(detail_rows, os.path.join(args.output_dir, "results_detail.csv"))
    _write_confusion_matrix_csv(confusion, os.path.join(args.output_dir, "confusion_matrix.csv"))
    _write_confusion_matrix_png(confusion, os.path.join(args.output_dir, "confusion_matrix.png"), args.task)
    _write_summary(
        detail_rows, confusion, detection_failures, unmapped,
        args.task, elapsed, os.path.join(args.output_dir, "summary.txt"),
    )


if __name__ == "__main__":
    main()


# =========================================================================
# CATATAN TECH LEAD: kenapa "skintone"/"undertone" tidak punya task otomatis
# =========================================================================
# Tidak ada dataset publik besar yang dilabeli L*/undertone secara ahli dengan
# struktur ImageFolder siap pakai. Dataset MST-E (Monk Skin Tone) dari Google
# formatnya berbeda (skala referensi warna kulit, bukan folder per kategori
# undertone) -- validasinya harus manual: bandingkan urutan kecerahan L* hasil
# pipeline terhadap urutan skala referensi MST-E, bukan lewat script ini.

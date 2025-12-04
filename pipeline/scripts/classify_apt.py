import argparse, json, os, shutil, heapq
from pathlib import Path
from typing import List, Tuple, Optional
import numpy as np
import joblib

from utils.io_utils import ensure_dir, get_threshold
from utils.img_utils import IMG_EXTS

def list_features(root: Path) -> List[Path]:
    return sorted(p for p in root.rglob("*.npy"))

def find_original_image(features_dir: Path, feats_file: Path) -> Optional[Path]:
    slide = feats_file.parent.name
    stem  = feats_file.stem
    images_root = features_dir.parent / "02_bg_filter" / "no_fondo" / slide
    if not images_root.exists():
        return None
    for ext in IMG_EXTS:
        cand = images_root / f"{stem}{ext}"
        if cand.exists():
            return cand
    return None

def _is_wsl_drvfs(p: Path) -> bool:
    try:
        return str(p).startswith("/mnt/")
    except Exception:
        return False

def link_file(src: Path, dst: Path, strategy: str):
    src = src.resolve()
    ensure_dir(dst.parent)
    if dst.exists() or dst.is_symlink():
        try: dst.unlink()
        except Exception: pass
    def _try_symlink():
        try: dst.symlink_to(src); return True
        except Exception: return False
    def _try_hardlink():
        try: os.link(src, dst); return True
        except Exception: return False
    def _copy():
        shutil.copy2(src, dst); return True
    if strategy == "symlink":
        if _try_symlink(): return
        if _is_wsl_drvfs(src) and _try_hardlink(): return
        _copy(); return
    elif strategy == "hardlink":
        if _try_hardlink(): return
        if _try_symlink(): return
        _copy(); return
    elif strategy == "copy":
        _copy(); return
    elif strategy == "none":
        return
    else:
        if _try_symlink(): return
        if _try_hardlink(): return
        _copy(); return

def topk_push(heap: List[Tuple[float, Path]], score: float, path: Path, k: int):
    item = (score, path)
    if len(heap) < k:
        heapq.heappush(heap, item)
    else:
        if score > heap[0][0]:
            heapq.heapreplace(heap, item)

def iter_batches(seq: List[Path], batch_size: int):
    for i in range(0, len(seq), batch_size):
        yield seq[i:i+batch_size]

def main():
    ap = argparse.ArgumentParser(description="Apto/NoApto (scikit-learn) por lotes sobre .npy")
    ap.add_argument("--features-dir", "--features_dir", dest="features_dir", type=Path, required=True)
    ap.add_argument("--out-dir", "--out_dir", dest="out_dir", type=Path, required=True)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--threshold-path", "--threshold_path", dest="threshold_path", type=Path, default=None)
    ap.add_argument("--samples-per-class", "--samples_per_class", dest="samples_per_class", type=int, default=12)
    ap.add_argument("--link-strategy", dest="link_strategy", choices=["symlink","hardlink","copy","none"], default="symlink")
    ap.add_argument("--batch-size", dest="batch_size", type=int, default=1024)
    ap.add_argument("--stats-out", dest="stats_out", type=Path, default=None)
    args = ap.parse_args()

    out_dir = args.out_dir
    apto_dir, noapto_dir = out_dir / "apto", out_dir / "no_apto"
    samples = out_dir / "_samples"
    for d in (out_dir, apto_dir, noapto_dir, samples / "apto", samples / "no_apto"):
        ensure_dir(d)

    thr = get_threshold(args.threshold, args.threshold_path, default=0.5)
    clf = joblib.load(args.model)

    feats_paths = list_features(args.features_dir)
    processed = 0
    kept_apto = 0
    kept_noapto = 0
    missing = 0

    top_apto: List[Tuple[float, Path]] = []
    top_noapto: List[Tuple[float, Path]] = []

    for batch_paths in iter_batches(feats_paths, args.batch_size):
        X_list = []
        imgs_batch: List[Path] = []
        stems: List[Tuple[str, str]] = []
        for fp in batch_paths:
            img = find_original_image(args.features_dir, fp)
            if img is None:
                missing += 1
                continue
            try:
                v = np.load(fp)
            except Exception:
                missing += 1
                continue
            if v.ndim != 1:
                v = v.reshape(-1)
            if v.dtype != np.float32:
                v = v.astype(np.float32, copy=False)
            X_list.append(v)
            imgs_batch.append(img)
            stems.append((img.parent.name, img.stem))
        if not X_list:
            continue

        X = np.stack(X_list, axis=0)
        if hasattr(clf, "predict_proba"):
            proba = clf.predict_proba(X)[:, 1].astype(np.float32)
        elif hasattr(clf, "decision_function"):
            scores = clf.decision_function(X).astype(np.float32)
            proba = 1.0 / (1.0 + np.exp(-scores))
        else:
            pred = clf.predict(X)
            proba = pred.astype(np.float32)

        for (slide, stem), img_path, p_apto in zip(stems, imgs_batch, proba):
            processed += 1
            if p_apto >= thr:
                dst = apto_dir / slide
                out_img = dst / f"{stem}{img_path.suffix}"
                link_file(img_path, out_img, args.link_strategy)
                kept_apto += 1
                topk_push(top_apto, float(p_apto), out_img, args.samples_per_class)
            else:
                dst = noapto_dir / slide
                out_img = dst / f"{stem}{img_path.suffix}"
                link_file(img_path, out_img, args.link_strategy)
                kept_noapto += 1
                topk_push(top_noapto, float(1.0 - p_apto), out_img, args.samples_per_class)

    for i, (_, p) in enumerate(sorted(top_apto, key=lambda t: t[0], reverse=True), 1):
        link_file(p, samples / "apto" / f"{i:03d}_{p.name}", args.link_strategy)
    for i, (_, p) in enumerate(sorted(top_noapto, key=lambda t: t[0], reverse=True), 1):
        link_file(p, samples / "no_apto" / f"{i:03d}_{p.name}", args.link_strategy)

    saved = kept_apto + kept_noapto
    discarded = max(0, processed - saved)
    metrics = {
        "features_total": len(feats_paths),
        "features_valid": processed + discarded,  # válidos leídos, incluidos los descartes por score
        "missing_images": missing,
        "threshold_used": float(thr),
        "processed": processed,
        "saved": saved,
        "discarded": discarded,
        "kept_apto": kept_apto,
        "kept_no_apto": kept_noapto,
        "apto_ratio": round(kept_apto / max(1, processed), 6),
        "link_strategy": args.link_strategy,
        "batch_size": args.batch_size,
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
    if args.stats_out:
        ensure_dir(args.stats_out.parent)
        args.stats_out.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
    print(json.dumps(metrics, ensure_ascii=False))

if __name__ == "__main__":
    main()
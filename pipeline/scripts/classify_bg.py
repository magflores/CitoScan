import argparse, json, shutil, os
from pathlib import Path
from typing import List, Tuple
import numpy as np

from utils.img_utils import list_images
from utils.io_utils import ensure_dir, get_threshold
from utils.models_utils import BinaryKerasClassifier

def topk(scores: List[Tuple[Path,float]], k: int) -> List[Path]:
    scores_sorted = sorted(scores, key=lambda t: t[1], reverse=True)
    return [p for p,_ in scores_sorted[:min(k, len(scores_sorted))]]

def _is_wsl_drvfs(p: Path) -> bool:
    try:
        return str(p).startswith("/mnt/")
    except Exception:
        return False

def link_file(src: Path, dst: Path, strategy: str):
    from utils.io_utils import ensure_dir
    import os, shutil
    src = src.resolve()
    ensure_dir(dst.parent)
    if dst.exists() or dst.is_symlink():
        try: dst.unlink()
        except Exception: pass

    def _try_symlink():
        try:
            dst.symlink_to(src)
            return True
        except Exception:
            return False

    def _try_hardlink():
        try:
            os.link(src, dst)
            return True
        except Exception:
            return False

    def _copy():
        shutil.copy2(src, dst)
        return True

    if strategy == "symlink":
        if _try_symlink():
            return
        if _is_wsl_drvfs(src) and _try_hardlink():
            return
        _copy(); return
    elif strategy == "hardlink":
        if _try_hardlink():
            return
        if _try_symlink():
            return
        _copy(); return
    elif strategy == "copy":
        _copy(); return
    elif strategy == "none":
        return
    else:
        if _try_symlink(): return
        if _try_hardlink(): return
        _copy(); return


def main():
    ap = argparse.ArgumentParser(description="Fondo/NoFondo (Keras)")
    ap.add_argument("--in",  dest="in_dir",  type=Path, required=True)
    ap.add_argument("--out", dest="out_dir", type=Path, required=True)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--input-size", "--input_size", dest="input_size", type=str, default="224x224")
    ap.add_argument("--batch-size", "--batch_size", dest="batch_size", type=int, default=64)
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--threshold-path", "--threshold_path", dest="threshold_path", type=Path, default=None)
    ap.add_argument("--samples-per-class", "--samples_per_class", dest="samples_per_class", type=int, default=12)
    ap.add_argument("--link-strategy", dest="link_strategy", choices=["symlink","hardlink","copy","none"], default="symlink")
    ap.add_argument("--stats-out", dest="stats_out", type=Path, default=None)
    args = ap.parse_args()

    parse_sz = lambda s: tuple(map(int, s.lower().split("x")))
    input_size = parse_sz(args.input_size)

    out_dir = args.out_dir; ensure_dir(out_dir)
    fondo_dir = out_dir / "fondo";    ensure_dir(fondo_dir)
    nf_dir    = out_dir / "no_fondo"; ensure_dir(nf_dir)
    samples   = out_dir / "_samples"; ensure_dir(samples / "fondo"); ensure_dir(samples / "no_fondo")

    thr = get_threshold(args.threshold, args.threshold_path, default=0.5)

    paths = list_images(args.in_dir)
    if not paths:
        ensure_dir(args.out_dir)
        fondo_dir = args.out_dir / "fondo";    ensure_dir(fondo_dir)
        nf_dir    = args.out_dir / "no_fondo"; ensure_dir(nf_dir)
        samples   = args.out_dir / "_samples"; ensure_dir(samples / "fondo"); ensure_dir(samples / "no_fondo")
        metrics = {
            "input_total": 0,
            "threshold_used": float(thr),
            "processed": 0, "passed": 0, "discarded": 0,
            "kept_ratio": 0.0, "link_strategy": args.link_strategy
        }
        if args.stats_out: ensure_dir(args.stats_out.parent); args.stats_out.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
        print(json.dumps(metrics, ensure_ascii=False)); return

    clf = BinaryKerasClassifier(args.model, input_size=input_size)
    probs = clf.predict_paths(paths, batch_size=args.batch_size)  # [p(fondo), p(no_fondo)]

    kept_scores_nf, kept_scores_f = [], []
    kept, discarded = 0, 0

    for p, pr in zip(paths, probs):
        p_f, p_nf = float(pr[0]), float(pr[1])
        if p_nf >= thr:
            dst_dir = nf_dir / p.parent.name
            out_p = dst_dir / p.name
            link_file(p, out_p, args.link_strategy)
            kept += 1; kept_scores_nf.append((out_p, p_nf))
        else:
            dst_dir = fondo_dir / p.parent.name
            out_p = dst_dir / p.name
            link_file(p, out_p, args.link_strategy)
            discarded += 1; kept_scores_f.append((out_p, p_f))

    for tag, arr in [("no_fondo", kept_scores_nf), ("fondo", kept_scores_f)]:
        for i, src in enumerate(topk(arr, args.samples_per_class), 1):
            link_file(src, samples / tag / f"{i:03d}_{src.name}", args.link_strategy)

    metrics = {
        "input_total": len(paths),
        "threshold_used": float(thr),
        "processed": len(paths),
        "passed": kept,
        "discarded": discarded,
        "kept_ratio": round(kept / max(1, len(paths)), 6),
        "link_strategy": args.link_strategy,
    }
    if args.stats_out:
        ensure_dir(args.stats_out.parent); args.stats_out.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
    print(json.dumps(metrics, ensure_ascii=False))

if __name__ == "__main__":
    main()
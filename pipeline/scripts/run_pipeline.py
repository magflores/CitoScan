import argparse, json, sys, time, subprocess, os
from pathlib import Path
from copy import deepcopy
import yaml

from utils.io_utils import ensure_dir
from utils.time_utils import now_ts

ROOT = Path(__file__).resolve().parents[1]  # raíz del repo 'pipeline'

def PY():
    return os.environ.get("PIPELINE_PYTHON") or sys.executable

def run(cmd: list):
    print("[RUN]", " ".join(map(str, cmd)))
    subprocess.run(cmd, check=True, cwd=str(ROOT))

def count_images(root: Path, exts=(".png",".jpg",".jpeg",".tif",".tiff",".bmp",".webp")):
    return sum(1 for p in root.rglob("*") if p.is_file() and p.suffix.lower() in exts)

def try_read_json(p: Path, default=None):
    try:
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        pass
    return default

def fmt(s: str, sid: str) -> str:
    return s.replace("{session_id}", sid)

def main():
    ap = argparse.ArgumentParser(description="Orquestador: SVS→Tiles→BG→Features→Aptitud→Cells")
    ap.add_argument("--session_id", required=True)
    ap.add_argument("--config", type=Path, default=Path("configs/defaults.yaml"))

    # BG overrides
    ap.add_argument("--bg-model", dest="bg_model", type=Path)
    ap.add_argument("--bg-threshold-path", dest="bg_threshold_path", type=Path)
    ap.add_argument("--bg-threshold", dest="bg_threshold", type=float)
    ap.add_argument("--bg-batch", dest="bg_batch", type=int)
    ap.add_argument("--bg-samples", dest="bg_samples", type=int)
    ap.add_argument("--bg-link", dest="bg_link", type=str)

    # APT overrides
    ap.add_argument("--apt-backbone", dest="apt_backbone", type=Path)
    ap.add_argument("--apt-threshold-path", dest="apt_threshold_path", type=Path)
    ap.add_argument("--apt-threshold", dest="apt_threshold", type=float)
    ap.add_argument("--apt-batch", dest="apt_batch", type=int)
    ap.add_argument("--apt-link", dest="apt_link", type=str)

    # CELLS overrides (clasificación YOLO/CLS)
    ap.add_argument("--cells-enabled", dest="cells_enabled", type=str)
    ap.add_argument("--cells-source", dest="cells_source", type=str)
    ap.add_argument("--cells-threshold", dest="cells_threshold", type=float)
    ap.add_argument("--cells-link", dest="cells_link", type=str)
    ap.add_argument("--cells-batch", dest="cells_batch", type=int)
    ap.add_argument("--cells-img-size", dest="cells_img_size", type=str)

    args = ap.parse_args()
    sid = str(args.session_id)

    # cargar config
    cfg_path = (args.config if args.config.is_absolute() else ROOT / args.config)
    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    cfg = deepcopy(cfg)

    # paths base por sesión
    sess_root   = ROOT / "resources" / "sessions" / sid
    input_dir   = sess_root / "input"
    ws          = sess_root / "workspace"
    tiles_dir   = ws / "01_tiles"
    bg_dir      = ws / "02_bg_filter"
    feats_dir   = ws / "03_features"
    apt_dir     = ws / "04_aptitud"
    cells_dir   = ws / "05_cells"
    logs_dir    = sess_root / "artifacts" / "logs"
    reports_dir = sess_root / "artifacts" / "reports"
    ensure_dir(logs_dir)
    ensure_dir(reports_dir)

    t0 = time.time()

    # -------------------------- 01 - Extracción de tiles
    ext = cfg.get("extraction", {})
    size   = ext.get("size", 1024)
    stride = ext.get("stride", size)
    fmt    = ext.get("format", "jpg")
    jpeg_q = ext.get("jpeg_quality", 95)
    png_c  = ext.get("png_compress_level", 1)
    engine = ext.get("engine", "pyvips")
    chunk  = ext.get("chunk_size", 256)

    extract_cmd = [
        PY(), "scripts/svs_to_patches.py",
        "--size", str(size),
        "--stride", str(stride),
        "--input_path", str(input_dir),
        "--output_root", str(ws),
        "--fmt", fmt,
        "--jpeg-quality", str(jpeg_q),
        "--png-compress-level", str(png_c),
        "--engine", engine,
        "--chunk-size", str(chunk),
    ]
    run(extract_cmd)

    # -------------------------- 02 - BG filter
    fondo = cfg.get("models", {}).get("fondo", {})
    samples_per_class = cfg.get("bg", {}).get("samples_per_class", 0)
    link_strategy_bg  = cfg.get("bg", {}).get("link_strategy", "symlink")

    # overrides
    if args.bg_model: fondo["path"] = str(args.bg_model)
    if args.bg_threshold_path: fondo["threshold_path"] = str(args.bg_threshold_path)
    if args.bg_threshold is not None: fondo["threshold"] = float(args.bg_threshold)
    if args.bg_batch is not None: fondo["batch_size"] = int(args.bg_batch)
    if args.bg_samples is not None: samples_per_class = int(args.bg_samples)
    if args.bg_link: link_strategy_bg = args.bg_link

    t_bg_s = time.time()
    bg_stats_path = reports_dir / "bg_stats.json"
    bg_cmd = [
        PY(), "scripts/classify_bg.py",
        "--in", str(tiles_dir),
        "--out", str(bg_dir),
        "--model", str(fondo["path"]),
        "--input-size", f"{fondo['input_size'][0]}x{fondo['input_size'][1]}",
        "--batch-size", str(fondo.get("batch_size", 64)),
        "--samples-per-class", str(samples_per_class),
        "--link-strategy", link_strategy_bg,
        "--stats-out", str(bg_stats_path),
    ]
    if "threshold_path" in fondo and fondo["threshold_path"]:
        bg_cmd += ["--threshold-path", str(fondo["threshold_path"])]
    if "threshold" in fondo and fondo["threshold"] is not None:
        bg_cmd += ["--threshold", str(fondo["threshold"])]
    run(bg_cmd)

    # -------------------------- 03 - Features
    apt = cfg.get("models", {}).get("aptitud", {})
    t_feat_s = time.time()
    feat_stats_path = reports_dir / "feat_stats.json"
    feat_cmd = [
        PY(), "scripts/extract_features.py",
        "--in", str(bg_dir / "no_fondo"),
        "--out", str(feats_dir),
        "--input-size", f"{apt['input_size'][0]}x{apt['input_size'][1]}",
        "--batch-size", str(cfg.get("features", {}).get("batch_size", 64)),
        "--stats-out", str(feat_stats_path),
    ]
    if apt.get("backbone"):
        feat_cmd += ["--backbone", str(apt["backbone"])]
    if args.apt_backbone:       feat_cmd += ["--backbone", str(args.apt_backbone)]
    run(feat_cmd)

    # -------------------------- 04 - Aptitud
    t_apt_s = time.time()
    apt_stats_path = reports_dir / "apt_stats.json"
    link_strategy_apt = cfg.get("apt", {}).get("link_strategy", "symlink")
    infer_batch = cfg.get("apt", {}).get("infer_batch", 256)
    # overrides
    if args.apt_threshold_path: apt["threshold_path"] = str(args.apt_threshold_path)
    if args.apt_threshold is not None: apt["threshold"] = float(args.apt_threshold)
    if args.apt_batch is not None: infer_batch = int(args.apt_batch)
    if args.apt_link: link_strategy_apt = args.apt_link
    apt_model = apt.get("path")
    if not apt_model:
        raise RuntimeError("Falta configurar models.aptitud.path en el YAML para classify_apt.py")

    apt_cmd = [
        PY(), "scripts/classify_apt.py",
        "--features-dir", str(feats_dir),
        "--out-dir",      str(apt_dir),
        "--model",        str(apt_model),
        "--batch-size",   str(infer_batch),
        "--link-strategy", link_strategy_apt,
        "--stats-out",    str(apt_stats_path),
    ]
    if "threshold_path" in apt and apt["threshold_path"]:
        apt_cmd += ["--threshold-path", str(apt["threshold_path"])]
    if "threshold" in apt and apt["threshold"] is not None:
        apt_cmd += ["--threshold", str(apt["threshold"])]
    run(apt_cmd)

    # -------------------------- 05 - Cells (opcional)
    cell_stats = {}
    t_cell_s = time.time()

    cells_cfg = cfg.get("cells") or {}
    if not isinstance(cells_cfg, dict):
        cells_cfg = {}

    cells_enabled = cells_cfg.get("enabled", True)
    if args.cells_enabled is not None:
        cells_enabled = (str(args.cells_enabled).lower() in ("1","true","yes","y","on"))

    cells_stats_path = reports_dir / "cells_stats.json"
    if cells_enabled:
        source = (args.cells_source or cells_cfg.get("source", "apto")).lower()
        if source == "apto":
            in_dir = apt_dir / "apto"
        elif source in ("nofondo", "no_fondo"):
            in_dir = bg_dir / "no_fondo"
        elif source in ("fondo", "bg_fondo"):
            in_dir = bg_dir / "fondo"
        elif source in ("bg_all", "bg"):
            in_dir = bg_dir
        else:
            in_dir = apt_dir / "apto"

        out_dir = cells_dir / source
        ensure_dir(out_dir)

        img_size = cells_cfg.get("img_size", None)
        if args.cells_img_size:
            img_size = args.cells_img_size

        link_strategy_cells = cells_cfg.get("link_strategy", "symlink")
        if args.cells_link:
            link_strategy_cells = args.cells_link
        cells_batch = int(args.cells_batch) if args.cells_batch is not None else int(cells_cfg.get("infer_batch", 16))
        cells_threshold = float(args.cells_threshold) if args.cells_threshold is not None else float(cells_cfg.get("threshold", cells_cfg.get("conf", 0.25)))
        iou = str(cells_cfg.get("iou", 0.45))
        imgsz = str(cells_cfg.get("imgsz", img_size or 640))

        has_imgs = in_dir.exists() and any(in_dir.rglob("*.[pj][pn]g"))
        if not has_imgs:
            print(f"[05] cell_cls: SKIPPED (no images in {in_dir})")
            empty = {"processed": 0, "kept_pos": 0, "kept_neg": 0, "pos_ratio": 0.0}
            ensure_dir(out_dir)
            (out_dir / "stats.json").write_text(json.dumps(empty, indent=2), encoding="utf-8")
            ensure_dir(reports_dir)
            cells_stats_path.write_text(json.dumps(empty, indent=2), encoding="utf-8")
            t_cell_e = time.time()
            cell_processed = cell_pos = cell_neg = 0
            cell_ratio = 0.0
        else:
            if cells_cfg.get("type", "cls") == "yolo":
                cmd = [
                    PY(), "scripts/classify_cells_yolo.py",
                    "--in", str(in_dir),
                    "--out", str(out_dir),
                    "--weights", str(cells_cfg["weights"]),
                    "--imgsz", imgsz,
                    "--conf", str(cells_threshold),
                    "--iou", iou,
                    "--batch-size", str(cells_batch),
                    "--link-strategy", link_strategy_cells,
                    "--stats-out", str(cells_stats_path),
                ]
                if cells_cfg.get("classes"):
                    cmd += ["--classes"] + [str(c) for c in cells_cfg["classes"]]
                if cells_cfg.get("save_annot", False):
                    cmd += ["--save-annot"]
                if cells_cfg.get("by_class_links", False):
                    cmd += ["--by-class-links"]
            else:
                cmd = [
                    PY(), "scripts/classify_cells.py",
                    "--in", str(in_dir),
                    "--out", str(out_dir),
                    "--yaml_file", str(cells_cfg["yaml_file"]),
                    "--checkpoint", str(cells_cfg["checkpoint"]),
                    "--threshold", str(cells_threshold),
                    "--batch-size", str(cells_batch),
                    "--link-strategy", link_strategy_cells,
                    "--stats-out", str(cells_stats_path),
                ]
                if img_size:
                    cmd += ["--img-size", str(img_size)]

            run(cmd)

            cells_stats = try_read_json(cells_stats_path, {}) or {}
            t_cell_e = time.time()
            cell_processed = int(cells_stats.get("processed", 0))
            cell_pos = int(cells_stats.get("kept_pos", 0))
            cell_neg = int(cells_stats.get("kept_neg", 0))
            cell_ratio = float(cells_stats.get("pos_ratio", 0.0))
            print(f"[05] cell_cls: {t_cell_e - t_cell_s:.2f}s | processed={cell_processed} "
                  f"pos={cell_pos} neg={cell_neg} (ratio={cell_ratio}) | in={in_dir} | out={out_dir}")
    else:
        t_cell_e = time.time()
        print("[05] cell_cls: SKIPPED (disabled)")
        cell_processed = cell_pos = cell_neg = 0
        cell_ratio = 0.0

    # -------------------------- Reporte unificado
    total = time.time() - t0
    bg_stats   = try_read_json(bg_stats_path,   {}) or {}
    feat_stats = try_read_json(feat_stats_path, {}) or {}
    apt_stats  = try_read_json(apt_stats_path,  {}) or {}
    cells_stats = try_read_json(cells_stats_path, {}) or {}

    report = {
      "ts": now_ts(),
      "total_seconds": total,
      "slides_count": 1,
      "tiles_total": count_images(tiles_dir) if tiles_dir.exists() else 0,
      "bg": {
        "processed": bg_stats.get("processed"),
        "saved": bg_stats.get("passed"),
        "discarded": bg_stats.get("discarded"),
        "threshold_used": bg_stats.get("threshold_used"),
        "link_strategy": bg_stats.get("link_strategy"),
        "samples_per_class": bg_stats.get("samples_per_class")
      },
      "feat": {
        "processed": feat_stats.get("processed"),
        "saved": feat_stats.get("saved"),
        "failed": feat_stats.get("failed", max(0, (feat_stats.get("processed") or 0) - (feat_stats.get("saved") or 0)))
      },
      "apt": {
        "processed": apt_stats.get("processed"),
        "saved": apt_stats.get("saved"),
        "discarded": apt_stats.get("discarded"),
        "kept_apto": apt_stats.get("kept_apto"),
        "kept_no_apto": apt_stats.get("kept_no_apto"),
        "apto_ratio": apt_stats.get("apto_ratio"),
        "threshold_used": apt_stats.get("threshold_used"),
        "link_strategy": apt_stats.get("link_strategy"),
        "batch_size": apt_stats.get("batch_size")
      },
      "cells": {
        "enabled": cells_cfg.get("enabled", False),
        "source": cells_cfg.get("source", "apto"),
        "threshold": cells_cfg.get("threshold", 0.5),
        "link_strategy": cells_cfg.get("link_strategy", "symlink"),
        "batch_size": cells_cfg.get("infer_batch", 256),
        "img_size": cells_cfg.get("img_size", None),
        "stats": cells_stats
      }
    }
    ensure_dir(reports_dir)
    (reports_dir / "pipeline_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\n[FIN] total=%.2fs" % total)

if __name__ == "__main__":
    try:
        import multiprocessing as mp
        mp.set_start_method('spawn', force=True)
    except Exception:
        pass
    main()

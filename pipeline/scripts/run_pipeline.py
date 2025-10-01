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
    cells = cfg.get("cells", {})
    cells_enabled = cells.get("enabled", True)
    if args.cells_enabled is not None:
        cells_enabled = (str(args.cells_enabled).lower() in ("1","true","yes","y","on"))

    cells_stats_path = reports_dir / "cells_stats.json"
    if cells_enabled:
        in_dir  = apt_dir if cells.get("source", "apto") == "apto" else bg_dir
        out_dir = cells_dir
        ensure_dir(out_dir)

        img_size = cells.get("img_size", None)
        if args.cells_img_size:
            img_size = args.cells_img_size

        link_strategy_cells = cells.get("link_strategy", "symlink")
        if args.cells_link: link_strategy_cells = args.cells_link
        cells_batch = cells.get("infer_batch", 256)
        if args.cells_batch is not None: cells_batch = int(args.cells_batch)
        cells_threshold = cells.get("threshold", 0.5)
        if args.cells_threshold is not None: cells_threshold = float(args.cells_threshold)

        if cells.get("type", "cls") == "yolo":
            cmd = [
                PY(), "scripts/classify_cells_yolo.py",
                "--in", str(in_dir),
                "--out", str(out_dir),
                "--weights", str(cells["weights"]),
                "--imgsz", str(cells.get("imgsz", 640)),
                "--conf", str(cells.get("conf", 0.25)),
                "--iou", str(cells.get("iou", 0.45)),
                "--batch-size", str(cells.get("infer_batch", 16)),
                "--link-strategy", link_strategy_cells,
                "--stats-out", str(cells_stats_path),
            ]
            if cells.get("classes"):
                cmd += ["--classes"] + [str(c) for c in cells["classes"]]
            if cells.get("save_annot", False):
                cmd += ["--save-annot"]
            if cells.get("by_class_links", False):
                cmd += ["--by-class-links"]
            if cells.get("stats_out"):
                cmd += ["--stats-out", str(cells["stats_out"])]
        else:
            cmd = [
                PY(), "scripts/classify_cells.py",
                "--in", str(in_dir),
                "--out", str(out_dir),
                "--yaml_file", str(cells["yaml_file"]),
                "--stats-out", str(cells_stats_path),
                "--link-strategy", link_strategy_cells,
                "--batch-size", str(cells_batch),
                "--threshold", str(cells_threshold)
            ]
            if cells.get("img_size"):
                cmd += ["--img-size", str(cells["img_size"])]
            if cells.get("stats_out"):
                cmd += ["--stats-out", str(cells["stats_out"])]

        run(cmd)

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
        "enabled": cells.get("enabled", True),
        "source": cells.get("source", "apto"),
        "threshold": cells.get("threshold", 0.5),
        "link_strategy": cells.get("link_strategy", "symlink"),
        "batch_size": cells.get("infer_batch", 256),
        "img_size": cells.get("img_size", None),
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

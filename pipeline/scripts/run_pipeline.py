import argparse, json, sys, time, subprocess, os
from pathlib import Path
from copy import deepcopy
import yaml

from utils.io_utils import ensure_dir
from utils.time_utils import now_ts

def run(cmd: list):
    print("[RUN]", " ".join(map(str, cmd)))
    subprocess.run(cmd, check=True)

def count_images(root: Path, exts=(".png",".jpg",".jpeg",".tif",".tiff",".bmp",".webp")):
    return sum(1 for p in root.rglob("*") if p.is_file() and p.suffix.lower() in exts)

def try_read_json(p: Path, default=None):
    try:
        if p.exists():
            return json.loads(p.read_text())
    except Exception:
        pass
    return default

def fmt(s: str, sid: str) -> str:
    return s.replace("{session_id}", sid)

def main():
    ap = argparse.ArgumentParser(description="Orquestador: SVS→Tiles→BG→Features→Aptitud→Cells")
    ap.add_argument("--session_id", required=True)
    ap.add_argument("--config", type=Path, default=Path("config/defaults.yaml"))

    # BG overrides
    ap.add_argument("--bg-model", dest="bg_model", type=Path)
    ap.add_argument("--bg-threshold-path", dest="bg_threshold_path", type=Path)
    ap.add_argument("--bg-threshold", dest="bg_threshold", type=float)
    ap.add_argument("--bg-input-size", dest="bg_input_size", type=str)
    ap.add_argument("--bg-batch", dest="bg_batch", type=int)
    ap.add_argument("--bg-link-strategy", dest="bg_link_strategy", choices=["symlink","hardlink","copy","none"])

    # Features/Apt overrides
    ap.add_argument("--backbone", dest="backbone", type=Path)
    ap.add_argument("--feat-input-size", dest="feat_input_size", type=str)
    ap.add_argument("--feat-batch", dest="feat_batch", type=int)
    ap.add_argument("--apt-model", dest="apt_model", type=Path)
    ap.add_argument("--apt-threshold", dest="apt_threshold", type=float)

    # Extractor overrides
    ap.add_argument("--tiles-workers", dest="tiles_workers", type=int)
    ap.add_argument("--tiles-fmt", dest="tiles_fmt", choices=["png","jpg"])
    ap.add_argument("--tiles-jpeg-quality", dest="tiles_jpeg_quality", type=int)
    ap.add_argument("--tiles-png-compress-level", dest="tiles_png_compress_level", type=int)
    ap.add_argument("--tiles-engine", dest="tiles_engine", choices=["openslide","pyvips"])
    ap.add_argument("--tiles-chunk-size", dest="tiles_chunk_size", type=int)

    ap.add_argument("--samples-per-class", dest="samples_per_class", type=int)
    ap.add_argument("--tag", type=str, default="")
    args = ap.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text())

    sid = args.session_id
    paths = {k: Path(fmt(v, sid)) for k, v in cfg["paths"].items()}
    runtime = cfg["runtime"]
    logs_dir    = Path(fmt(runtime["log_dir"], sid))
    reports_dir = Path(fmt(runtime["reports_dir"], sid))
    workspace_dir = Path(fmt(runtime["workspace"], sid))
    for d in (paths["input"], paths["tiles"], paths["bg"], paths["feats"], paths["apt"], logs_dir, reports_dir, workspace_dir):
        ensure_dir(d)

    fondo = cfg["models"]["fondo"]
    apt   = cfg["models"]["aptitud"]
    cells = cfg.get("cells", {}) or {}
    ext   = cfg["extractor"]

    # BG overrides
    if args.bg_model: fondo["path"] = str(args.bg_model)
    if args.bg_threshold_path: fondo["threshold_path"] = str(args.bg_threshold_path)
    if args.bg_input_size: fondo["input_size"] = list(map(int, args.bg_input_size.lower().split("x")))
    if args.bg_batch is not None: fondo["batch_size"] = args.bg_batch

    # Features/Apt overrides
    if args.backbone is not None: apt["backbone"] = str(args.backbone) if args.backbone else None
    if args.feat_input_size: apt["input_size"] = list(map(int, args.feat_input_size.lower().split("x")))
    if args.feat_batch is not None: apt["batch_size"] = args.feat_batch
    if args.apt_model: apt["path"] = str(args.apt_model)

    # Extractor overrides
    tiles_opts = deepcopy(ext.get("options", {}))
    if args.tiles_workers is not None: tiles_opts["workers"] = args.tiles_workers
    if args.tiles_fmt is not None: tiles_opts["fmt"] = args.tiles_fmt
    if args.tiles_jpeg_quality is not None: tiles_opts["jpeg_quality"] = args.tiles_jpeg_quality
    if args.tiles_png_compress_level is not None: tiles_opts["png_compress_level"] = args.tiles_png_compress_level
    if args.tiles_engine is not None: tiles_opts["engine"] = args.tiles_engine
    if args.tiles_chunk_size is not None: tiles_opts["chunk_size"] = args.tiles_chunk_size

    bg_threshold  = args.bg_threshold
    apt_threshold = args.apt_threshold
    samples_per_class = args.samples_per_class or cfg["runtime"]["samples_per_class"]
    link_strategy_bg  = args.bg_link_strategy or cfg.get("bg", {}).get("link_strategy", "symlink")
    link_strategy_apt = cfg.get("apt", {}).get("link_strategy", "symlink")
    run_tag = args.tag or now_ts()

    log_path = logs_dir / f"pipeline_{run_tag}.log"
    sys.stdout = open(log_path, "w", buffering=1)
    print(f"RUN_TAG={run_tag}\nSESSION_ID={sid}\n")

    # -------------------------- 01 - Extract tiles
    t_extract_s = time.time()
    extractor_cmd = list(ext["cmd"]) + ["--input_path", str(paths["input"]), "--output_root", str(workspace_dir)]
    if "workers" in tiles_opts and tiles_opts["workers"] is not None:
        extractor_cmd += ["--workers", str(tiles_opts["workers"])]
    if "fmt" in tiles_opts and tiles_opts["fmt"]:
        extractor_cmd += ["--fmt", str(tiles_opts["fmt"])]
    if "jpeg_quality" in tiles_opts and tiles_opts["jpeg_quality"] is not None:
        extractor_cmd += ["--jpeg-quality", str(tiles_opts["jpeg_quality"])]
    if "png_compress_level" in tiles_opts and tiles_opts["png_compress_level"] is not None:
        extractor_cmd += ["--png-compress-level", str(tiles_opts["png_compress_level"])]
    if "engine" in tiles_opts and tiles_opts["engine"]:
        extractor_cmd += ["--engine", str(tiles_opts["engine"])]
    if "chunk_size" in tiles_opts and tiles_opts["chunk_size"] is not None:
        extractor_cmd += ["--chunk-size", str(tiles_opts["chunk_size"])]
    run(extractor_cmd)
    t_extract_e = time.time()
    n_tiles_gen = count_images(paths["tiles"])
    print(f"[01] extract_tiles: {t_extract_e - t_extract_s:.2f}s | tiles={n_tiles_gen} | out={paths['tiles']}")

    # -------------------------- 02 - BG filter
    t_bg_s = time.time()
    bg_stats_path = paths["bg"] / "bg_stats.json"
    bg_cmd = [
        "python3", "scripts/classify_bg.py",
        "--in", str(paths["tiles"]),
        "--out", str(paths["bg"]),
        "--model", fondo["path"],
        "--input-size", f"{fondo['input_size'][0]}x{fondo['input_size'][1]}",
        "--batch-size", str(fondo["batch_size"]),
        "--samples-per-class", str(samples_per_class),
        "--link-strategy", link_strategy_bg,
        "--stats-out", str(bg_stats_path),
    ]
    if bg_threshold is not None:
        bg_cmd += ["--threshold", str(bg_threshold)]
    elif fondo.get("threshold_path"):
        bg_cmd += ["--threshold-path", fondo["threshold_path"]]
    run(bg_cmd)
    t_bg_e = time.time()
    bg_stats = try_read_json(bg_stats_path, default={})
    bg_processed  = bg_stats.get("processed", n_tiles_gen)
    bg_passed     = bg_stats.get("passed", count_images(paths["bg"] / "no_fondo"))
    bg_discarded  = bg_stats.get("discarded", count_images(paths["bg"] / "fondo"))
    print(f"[02] bg_filter: {t_bg_e - t_bg_s:.2f}s | processed={bg_processed} passed={bg_passed} discarded={bg_discarded} | out={paths['bg']}")

    # -------------------------- 03 - Feature extraction
    t_feat_s = time.time()
    feat_stats_path = paths["feats"] / "feat_stats.json"
    feat_cmd = [
        "python3", "scripts/extract_features.py",
        "--in", str(paths["bg"] / "no_fondo"),
        "--out", str(paths["feats"]),
        "--input-size", f"{cfg['models']['aptitud']['input_size'][0]}x{cfg['models']['aptitud']['input_size'][1]}",
        "--batch-size", str(cfg['models']['aptitud']['batch_size']),
        "--stats-out", str(feat_stats_path),
    ]
    if cfg['models']['aptitud'].get("backbone"):
        feat_cmd += ["--backbone", cfg['models']['aptitud']["backbone"]]
    run(feat_cmd)
    t_feat_e = time.time()
    feat_stats = try_read_json(feat_stats_path, default={})
    n_feats_files = sum(1 for _ in paths["feats"].rglob("*.npy"))
    feat_processed = feat_stats.get("processed", bg_passed)
    feat_saved     = feat_stats.get("saved", n_feats_files)
    feat_failed    = feat_stats.get("failed", max(0, feat_processed - feat_saved))
    print(f"[03] features: {t_feat_e - t_feat_s:.2f}s | processed={feat_processed} saved={feat_saved} failed={feat_failed} | out={paths['feats']}")

    # -------------------------- 04 - Aptitud
    t_apt_s = time.time()
    apt_stats_path = paths["apt"] / "apt_stats.json"
    link_strategy_apt = cfg.get("apt", {}).get("link_strategy", "symlink")
    apt_cmd = [
      "python3", "scripts/classify_apt.py",
      "--features-dir", str(paths["feats"]),
      "--out-dir", str(paths["apt"]),
      "--model", cfg["models"]["aptitud"]["path"],
      "--samples-per-class", str(samples_per_class),
      "--stats-out", str(apt_stats_path),
      "--link-strategy", link_strategy_apt,
    ]
    if apt_threshold is not None:
        apt_cmd += ["--threshold", str(apt_threshold)]
    bsize = cfg.get("apt", {}).get("infer_batch")
    if bsize: apt_cmd += ["--batch-size", str(bsize)]
    run(apt_cmd)
    t_apt_e = time.time()
    apt_stats = try_read_json(apt_stats_path, default={})
    apt_processed = int(apt_stats.get("processed", feat_saved))
    apt_saved     = int(apt_stats.get("saved", 0))
    apt_discarded = int(apt_stats.get("discarded", max(0, apt_processed - apt_saved)))
    apt_kept_apto    = int(apt_stats.get("kept_apto", 0))
    apt_kept_noapto  = int(apt_stats.get("kept_no_apto", 0))
    apt_apto_ratio   = float(apt_stats.get("apto_ratio", round(apt_kept_apto / max(1, apt_processed), 6)))
    print(f"[04] aptitud: {t_apt_e - t_apt_s:.2f}s | processed={apt_processed} "
          f"saved={apt_saved} discarded={apt_discarded} | apto={apt_kept_apto} "
          f"no_apto={apt_kept_noapto} (ratio={apt_apto_ratio}) | out={paths['apt']}")

    # -------------------------- 05 - Clasificador de células
    cell_stats = {}
    t_cell_s = time.time()
    cells_enabled = (cells.get("enabled", True) is True)
    if cells_enabled:
        source = cells.get("source", "apto")
        in_dir = paths["apt"] / "apto" if source == "apto" else (paths["bg"] / "no_fondo")
        out_dir = paths.get("cells") or (paths["apt"].parent / "05_cell_cls")
        ensure_dir(out_dir)

        cell_stats_path = out_dir / "stats.json"
        link_strategy_cells = cells.get("link_strategy", "symlink")

        if cells.get("type", "cls") == "yolo":
            cmd = [
                "python3", "scripts/classify_cells_yolo.py",
                "--in", str(in_dir),
                "--out", str(out_dir),
                "--weights", str(cells["weights"]),
                "--imgsz", str(cells.get("imgsz", 640)),
                "--conf", str(cells.get("conf", 0.25)),
                "--iou", str(cells.get("iou", 0.45)),
                "--batch-size", str(cells.get("infer_batch", 16)),
                "--link-strategy", link_strategy_cells,
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
                "python3", "scripts/classify_cells.py",
                "--in", str(in_dir),
                "--out", str(out_dir),
                "--yaml_file", str(cells["yaml_file"]),
                "--checkpoint", str(cells["checkpoint"]),
                "--threshold", str(cells.get("threshold", 0.5)),
                "--batch-size", str(cells.get("infer_batch", 256)),
                "--link-strategy", link_strategy_cells,
            ]
            if cells.get("img_size"):
                cmd += ["--img-size", str(cells["img_size"])]
            if cells.get("stats_out"):
                cmd += ["--stats-out", str(cells["stats_out"])]

        run(cmd)
        cell_stats = try_read_json(cell_stats_path, default={})
        t_cell_e = time.time()
        cell_processed = int(cell_stats.get("processed", 0))
        cell_pos = int(cell_stats.get("kept_pos", 0))
        cell_neg = int(cell_stats.get("kept_neg", 0))
        cell_ratio = float(cell_stats.get("pos_ratio", 0.0))
        print(f"[05] cell_cls: {t_cell_e - t_cell_s:.2f}s | processed={cell_processed} "
              f"pos={cell_pos} neg={cell_neg} (ratio={cell_ratio}) | out={out_dir}")
    else:
        t_cell_e = time.time()
        print("[05] cell_cls: SKIPPED")
        cell_processed = cell_pos = cell_neg = 0
        cell_ratio = 0.0

    # -------------------------- Reporte final
    total = (t_extract_e - t_extract_s) + (t_bg_e - t_bg_s) + (t_feat_e - t_feat_s) + (t_apt_e - t_apt_s) + (t_cell_e - t_cell_s)
    report = {
      "run_tag": run_tag,
      "session_id": sid,
      "paths": {k: str(v) for k, v in paths.items()} | {"log": str(log_path)},
      "times": {
        "extract": {"start": t_extract_s, "end": t_extract_e, "seconds": round(t_extract_e - t_extract_s, 3)},
        "bg":      {"start": t_bg_s,      "end": t_bg_e,      "seconds": round(t_bg_e - t_bg_s, 3)},
        "features":{"start": t_feat_s,    "end": t_feat_e,    "seconds": round(t_feat_e - t_feat_s, 3)},
        "aptitud": {"start": t_apt_s,     "end": t_apt_e,     "seconds": round(t_apt_e - t_apt_s, 3)},
        "cells":   {"start": t_cell_s,    "end": t_cell_e,    "seconds": round(t_cell_e - t_cell_s, 3)},
        "total_seconds": round(total, 3)
      },
      "counts": {
        "tiles": {"generated": n_tiles_gen},
        "bg":    {"processed": bg_processed, "passed": bg_passed, "discarded": bg_discarded},
        "feat":  {"processed": feat_processed, "saved": feat_saved, "failed": feat_failed},
        "apt":   {"processed": apt_processed, "saved": apt_saved, "discarded": apt_discarded,
                  "kept_apto": apt_kept_apto, "kept_no_apto": apt_kept_noapto, "apto_ratio": apt_apto_ratio},
        "cells": {"processed": int(cell_stats.get("processed", cell_processed)),
                  "kept_pos": int(cell_stats.get("kept_pos", cell_pos)),
                  "kept_neg": int(cell_stats.get("kept_neg", cell_neg)),
                  "pos_ratio": float(cell_stats.get("pos_ratio", cell_ratio))}
      },
      "settings": {
        "extractor": tiles_opts | {"tile_size": ext.get("tile_size"), "stride": ext.get("stride")},
        "bg": {"link_strategy": link_strategy_bg, "threshold": bg_threshold or fondo.get("threshold_path")},
        "apt": {"link_strategy": link_strategy_apt, "threshold": apt_threshold},
        "cells": {
            "enabled": cells.get("enabled", True),
            "source": cells.get("source", "apto"),
            "threshold": cells.get("threshold", 0.5),
            "link_strategy": cells.get("link_strategy", "symlink"),
            "batch_size": cells.get("infer_batch", 256),
            "img_size": cells.get("img_size", None)
        }
      }
    }
    ensure_dir(reports_dir)
    (reports_dir / "pipeline_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print("\n[FIN] total=%.2fs" % total)

if __name__ == "__main__":
    main()
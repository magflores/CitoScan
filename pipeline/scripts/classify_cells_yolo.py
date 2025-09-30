import argparse, os, csv, json, shutil
from pathlib import Path
from typing import List, Dict, Optional

import torch
from ultralytics import YOLO
from utils.io_utils import ensure_dir

IMG_EXTS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}

def list_images(root: Path) -> List[Path]:
    return [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMG_EXTS]

def link_file(src: Path, dst: Path, strategy: str) -> str:
    ensure_dir(dst.parent)
    try:
        if strategy == "symlink":
            if dst.exists(): dst.unlink()
            dst.symlink_to(src.resolve())
            return "symlink"
        elif strategy == "hardlink":
            if dst.exists(): dst.unlink()
            os.link(src, dst)
            return "hardlink"
        elif strategy == "copy":
            if dst.exists(): dst.unlink()
            shutil.copy2(src, dst)
            return "copy"
        else:
            return "none"
    except Exception:
        if strategy == "symlink":
            try:
                if dst.exists(): dst.unlink()
                os.link(src, dst)
                return "hardlink"
            except Exception:
                shutil.copy2(src, dst)
                return "copy"
        if strategy == "hardlink":
            shutil.copy2(src, dst)
            return "copy"
        raise

def main():
    ap = argparse.ArgumentParser(description="Paso 05 — Clasificación de células con YOLO (detección + tipo)")
    ap.add_argument("--in", dest="in_dir", type=Path, required=True)
    ap.add_argument("--out", dest="out_dir", type=Path, required=True)
    ap.add_argument("--weights", type=Path, required=True, help="Pesos YOLO (e.g., best.pt)")
    ap.add_argument("--imgsz", type=int, default=640, help="Tamaño de inferencia (lado mayor)")
    ap.add_argument("--conf", type=float, default=0.25, help="Umbral de confianza")
    ap.add_argument("--iou", type=float, default=0.45, help="Umbral NMS IoU")
    ap.add_argument("--classes", type=int, nargs="*", default=None, help="IDs a considerar (default: todas)")
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--link-strategy", choices=["symlink","hardlink","copy","none"], default="symlink")
    ap.add_argument("--save-annot", action="store_true", help="Guardar imágenes anotadas en out/annotated")
    ap.add_argument("--by-class-links", action="store_true", help="Crear enlaces por clase en out/by_class/<name>/")
    ap.add_argument("--stats-out", type=Path, default=None)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    ensure_dir(args.out_dir)
    raw_dir = args.out_dir / "raw_preds"; ensure_dir(raw_dir)
    pos_dir = args.out_dir / "positive"
    neg_dir = args.out_dir / "negative"
    ann_dir = args.out_dir / "annotated"
    byc_dir = args.out_dir / "by_class"

    model = YOLO(str(args.weights))
    names: Dict[int, str] = model.names  # {id: nombre}

    paths = list_images(args.in_dir)
    if not paths:
        (args.out_dir / "stats.json").write_text(json.dumps({
            "processed": 0, "saved": 0, "failed": 0, "kept_pos": 0, "kept_neg": 0,
            "pos_ratio": 0.0, "conf_used": args.conf, "iou_used": args.iou,
            "imgsz": args.imgsz, "classes": args.classes, "batch_size": args.batch_size,
            "device": device
        }, indent=2))
        return

    results = model.predict(
        source=[str(p) for p in paths],
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
        device=0 if device=="cuda" else "cpu",
        classes=args.classes,        # None => todas
        stream=False,
        save=args.save_annot,
        save_txt=False,
        save_conf=True,
        project=str(ann_dir.parent), name=ann_dir.name if args.save_annot else None,
        verbose=False,
        batch=args.batch_size
    )

    preds_csv = raw_dir / "preds.csv"
    dets_csv  = raw_dir / "detections.csv"

    kept_pos = 0
    kept_neg = 0
    link_strategy_used = "none" if args.link_strategy == "none" else args.link_strategy

    with open(preds_csv, "w", newline="") as fp, open(dets_csv, "w", newline="") as fd:
        wp = csv.writer(fp); wd = csv.writer(fd)
        wp.writerow(["rel_path","n_det","top_conf","top_cls_id","top_cls_name","label_pred",
                     "conf_used","iou_used","imgsz","classes","counts_json"])
        wd.writerow(["rel_path","x1","y1","x2","y2","conf","cls_id","cls_name"])

        for p, r in zip(paths, results):
            n_det = 0
            top_conf = 0.0
            top_cls_id = None
            counts = {}

            if r.boxes is not None and len(r.boxes) > 0:
                b = r.boxes
                confs = b.conf.detach().cpu().numpy().tolist()
                xyxy = b.xyxy.detach().cpu().numpy().tolist()
                clss = b.cls.detach().cpu().numpy().astype(int).tolist()

                for (x1,y1,x2,y2), conf, cid in zip(xyxy, confs, clss):
                    n_det += 1
                    counts[cid] = counts.get(cid, 0) + 1
                    if conf > top_conf:
                        top_conf = conf
                        top_cls_id = cid
                    rel = str(p.relative_to(args.in_dir))
                    wd.writerow([rel, f"{x1:.2f}", f"{y1:.2f}", f"{x2:.2f}", f"{y2:.2f}",
                                 f"{conf:.6f}", cid, names.get(cid, str(cid))])

            label_pred = 1 if n_det > 0 else 0
            rel = str(p.relative_to(args.in_dir))
            counts_json = json.dumps({names.get(k,str(k)): v for k,v in sorted(counts.items())}, ensure_ascii=False)
            wp.writerow([rel, n_det, f"{top_conf:.6f}", (top_cls_id if top_cls_id is not None else ""),
                         (names.get(top_cls_id,"") if top_cls_id is not None else ""), label_pred,
                         args.conf, args.iou, args.imgsz,
                         "" if args.classes is None else "|".join(map(str,args.classes)),
                         counts_json])

            # enlaces generales positive/negative
            if args.link_strategy != "none":
                dst = (pos_dir if label_pred==1 else neg_dir) / Path(rel)
                link_file(p, dst, args.link_strategy)
                if label_pred==1: kept_pos += 1
                else: kept_neg += 1
            else:
                if label_pred==1: kept_pos += 1
                else: kept_neg += 1

            # enlaces por clase (opcional)
            if args.by_class_links and n_det > 0:
                for cid, ccount in counts.items():
                    cname = names.get(cid, str(cid)).replace("/", "_")
                    dst = byc_dir / cname / Path(rel)
                    link_file(p, dst, args.link_strategy)

    processed = len(paths)
    stats = {
        "processed": processed,
        "saved": processed,
        "failed": 0,
        "kept_pos": kept_pos,
        "kept_neg": kept_neg,
        "pos_ratio": round((kept_pos/processed), 6) if processed else 0.0,
        "conf_used": args.conf,
        "iou_used": args.iou,
        "imgsz": args.imgsz,
        "classes": args.classes,
        "link_strategy": link_strategy_used,
        "batch_size": args.batch_size,
        "device": device
    }
    (args.out_dir / "stats.json").write_text(json.dumps(stats, indent=2))
    if args.stats_out:
        ensure_dir(args.stats_out.parent)
        shutil.copy2(args.out_dir / "stats.json", args.stats_out)

if __name__ == "__main__":
    main()

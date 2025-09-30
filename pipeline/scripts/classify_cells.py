import argparse, os, csv, json, shutil
from pathlib import Path
from typing import List, Tuple

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from PIL import Image
from torchvision import transforms
from torchvision.transforms import InterpolationMode

from utils.io_utils import ensure_dir
from utils.cell_model_utils import build_model_from_yaml, load_checkpoint

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

class ImgDirDataset(Dataset):
    def __init__(self, paths: List[Path], img_size: int, mean, std):
        self.paths = paths
        self.tf = transforms.Compose([
            transforms.ToTensor(),  # (H,W,C)[0..1] -> (C,H,W)
            transforms.Resize((img_size, img_size), interpolation=InterpolationMode.NEAREST),
            transforms.Normalize(mean=mean, std=std),
        ])

    def __len__(self): return len(self.paths)

    def __getitem__(self, idx):
        p = self.paths[idx]
        with Image.open(p) as img:
            arr = np.array(img.convert("RGB")).astype(np.float32) / 255.0
        x = self.tf(arr)
        return str(p), x

def infer(model, loader, device: str, threshold: float) -> List[Tuple[str, float, int]]:
    out = []
    model.eval()
    with torch.no_grad():
        for paths, batch in loader:
            batch = batch.to(device, non_blocking=True)
            logits_or_probs = model(batch)  # nuestro Model devuelve probs (Sigmoid) si num_classes==1
            # Normalizamos a prob. positiva:
            if logits_or_probs.ndim == 2 and logits_or_probs.shape[1] == 2:
                if torch.all((logits_or_probs >= 0) & (logits_or_probs <= 1)):
                    pos = logits_or_probs[:, 1]
                else:
                    pos = torch.softmax(logits_or_probs, dim=1)[:, 1]
            else:
                pos = logits_or_probs.view(-1)
            pos = pos.float().cpu().numpy()
            pred = (pos >= threshold).astype(np.int32)
            for p, pr, y in zip(paths, pos, pred):
                out.append((p, float(pr), int(y)))
    return out

def main():
    ap = argparse.ArgumentParser(description="Paso 05 — Clasificador de células")
    ap.add_argument("--in", dest="in_dir", type=Path, required=True, help="Dir de entrada (imágenes)")
    ap.add_argument("--out", dest="out_dir", type=Path, required=True, help="Dir de salida (05_cell_cls)")
    ap.add_argument("--yaml_file", type=Path, required=True, help="YAML del modelo (e.g., swinv2.yaml)")
    ap.add_argument("--checkpoint", type=Path, required=True, help="Checkpoint .pt/.pth")
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--batch-size", type=int, default=256)
    ap.add_argument("--img-size", type=int, default=None, help="Override tamaño si querés ignorar el YAML")
    ap.add_argument("--link-strategy", choices=["symlink","hardlink","copy","none"], default="symlink")
    ap.add_argument("--stats-out", type=Path, default=None)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    ensure_dir(args.out_dir)
    raw_dir = args.out_dir / "raw_preds"; ensure_dir(raw_dir)
    pos_dir = args.out_dir / "positive"
    neg_dir = args.out_dir / "negative"

    model, yaml_args = build_model_from_yaml(args.yaml_file, device=device)
    img_size = int(args.img_size or getattr(yaml_args, "img_size", 224))
    mean = (0.485, 0.456, 0.406)
    std  = (0.229, 0.224, 0.225)

    load_checkpoint(model, args.checkpoint, device=device)

    paths = list_images(args.in_dir)
    ds = ImgDirDataset(paths, img_size=img_size, mean=mean, std=std)
    dl = DataLoader(ds, batch_size=args.batch_size, shuffle=False,
                    num_workers=os.cpu_count() or 4, pin_memory=(device=="cuda"))

    results = infer(model, dl, device, threshold=args.threshold)

    csv_path = raw_dir / "preds.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["rel_path","prob_pos","label_pred","threshold_used"])
        for p, pr, y in results:
            rel = str(Path(p).relative_to(args.in_dir))
            w.writerow([rel, f"{pr:.6f}", y, args.threshold])

    kept_pos = 0
    kept_neg = 0
    link_strategy_used = "none"
    if args.link_strategy != "none":
        for p, _, y in results:
            src = Path(p)
            dst = (pos_dir if y==1 else neg_dir) / src.relative_to(args.in_dir)
            ls = link_file(src, dst, args.link_strategy)
            link_strategy_used = ls
            if y==1: kept_pos += 1
            else: kept_neg += 1
    else:
        for _, _, y in results:
            if y==1: kept_pos += 1
            else: kept_neg += 1

    processed = len(results)
    stats = {
        "processed": processed,
        "saved": processed,
        "failed": 0,
        "kept_pos": kept_pos,
        "kept_neg": kept_neg,
        "pos_ratio": round((kept_pos / processed), 6) if processed else 0.0,
        "threshold_used": args.threshold,
        "link_strategy": link_strategy_used,
        "batch_size": args.batch_size,
        "img_size": img_size,
        "device": device,
    }
    (args.out_dir / "stats.json").write_text(json.dumps(stats, indent=2))
    if args.stats_out:
        ensure_dir(args.stats_out.parent)
        shutil.copy2(args.out_dir / "stats.json", args.stats_out)

if __name__ == "__main__":
    main()
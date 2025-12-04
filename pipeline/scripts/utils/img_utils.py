from pathlib import Path
from typing import List, Tuple, Optional
import numpy as np
from PIL import Image

IMG_EXTS = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp")

def list_images(root: Path) -> List[Path]:
    return [p for p in root.rglob("*") if p.suffix.lower() in IMG_EXTS]

def load_rgb(path: Path, size: Optional[Tuple[int, int]] = None) -> np.ndarray:
    
    im = Image.open(path).convert("RGB")
    if size:
        im = im.resize(size, Image.NEAREST)
    return np.asarray(im, dtype=np.float32)

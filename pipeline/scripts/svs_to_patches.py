import argparse, json, math, os
from pathlib import Path
from typing import Dict, Any, List, Tuple
from concurrent.futures import ProcessPoolExecutor, as_completed
from PIL import Image

try:
    import openslide
except Exception:
    openslide = None

try:
    import pyvips
except Exception:
    pyvips = None

from utils.io_utils import ensure_dir
from utils.time_utils import now_ts

_GLOBAL = {"engine": None, "slide": None, "vimg": None}

def _init_worker(engine: str, svs_path: str):
    global _GLOBAL
    _GLOBAL["engine"] = engine
    if engine == "openslide":
        import openslide as _os
        _GLOBAL["slide"] = _os.OpenSlide(svs_path)
    else:
        import pyvips as _pv
        _GLOBAL["vimg"] = _pv.Image.openslideload(svs_path, level=0)

def _worker_chunk(args):
    out_dir, slide_name, fmt, jpeg_quality, png_compress, size, coords = args
    global _GLOBAL
    results = []
    if _GLOBAL["engine"] == "openslide":
        slide = _GLOBAL["slide"]
        for (x, y) in coords:
            try:
                img = slide.read_region((x, y), 0, (size, size)).convert("RGB")
                out_path = out_dir / f"{slide_name}_x{x}_y{y}.{fmt}"
                if fmt == "jpg":
                    img.save(out_path, format="JPEG", quality=jpeg_quality, optimize=False, subsampling=1)
                else:
                    img.save(out_path, format="PNG", compress_level=png_compress, optimize=False)
                results.append({"x": x, "y": y, "file": out_path.name})
            except Exception:
                pass
    else:
        vimg = _GLOBAL["vimg"]
        for (x, y) in coords:
            try:
                patch = vimg.crop(x, y, size, size)
                if patch.format != "uchar":
                    patch = patch.cast("uchar")
                if patch.interpretation not in ("srgb", "rgb"):
                    patch = patch.colourspace("srgb")
                if patch.bands > 3:
                    patch = patch[:3]
                out_path = out_dir / f"{slide_name}_x{x}_y{y}.{fmt}"
                if fmt == "jpg":
                    patch.write_to_file(os.fspath(out_path), Q=jpeg_quality)
                else:
                    patch.write_to_file(os.fspath(out_path), compression=png_compress)
                results.append({"x": x, "y": y, "file": out_path.name})
            except Exception:
                pass
    return results

def _gen_coords(w, h, size, stride):
    nx = max(1, math.ceil((w - size) / stride) + 1)
    ny = max(1, math.ceil((h - size) / stride) + 1)
    for j in range(ny):
        y = j * stride
        if y + size > h:
            continue
        for i in range(nx):
            x = i * stride
            if x + size > w:
                continue
            yield (x, y)

def _chunk(lst: List[Tuple[int,int]], n: int):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def tile_slide_generic(engine: str, svs_path: Path, out_dir: Path, tile_size: int, stride: int,
                       workers: int, fmt: str, jpeg_quality: int, png_compress_level: int,
                       chunk_size: int = 64) -> Dict[str, Any]:
    slide_name = svs_path.stem
    slide_dir = out_dir / slide_name
    ensure_dir(slide_dir)
    if engine == "openslide":
        slide = openslide.OpenSlide(str(svs_path))
        w, h = slide.dimensions
        slide.close()
    else:
        vimg = pyvips.Image.openslideload(str(svs_path), level=0)
        w, h = vimg.width, vimg.height
    coords = list(_gen_coords(w, h, tile_size, stride))
    if not coords:
        return {"slide": slide_name, "svs_path": str(svs_path),
                "dimensions": {"w": w, "h": h}, "tile_size": tile_size, "stride": stride,
                "fmt": fmt, "tiles_total": 0, "tiles": []}
    max_workers = workers or (os.cpu_count() or 4)
    results = []
    with ProcessPoolExecutor(
        max_workers=max_workers,
        initializer=_init_worker,
        initargs=(engine, str(svs_path))
    ) as ex:
        futs = []
        for group in _chunk(coords, chunk_size):
            futs.append(ex.submit(
                _worker_chunk,
                (slide_dir, slide_name, fmt, jpeg_quality, png_compress_level, tile_size, group)
            ))
        for fut in as_completed(futs):
            results.extend(fut.result())
    results.sort(key=lambda d: (d["y"], d["x"]))
    return {"slide": slide_name, "svs_path": str(svs_path),
            "dimensions": {"w": w, "h": h}, "tile_size": tile_size, "stride": stride,
            "fmt": fmt, "tiles_total": len(results), "tiles": results}

def main():
    ap = argparse.ArgumentParser(description="SVS → tiles 1024x1024 rápido (multiprocessing, JPG/PNG, PyVips opcional)")
    ap.add_argument("--input_path",  type=Path, required=True)
    ap.add_argument("--output_root", type=Path, required=True)
    ap.add_argument("--size",   type=int, default=1024)
    ap.add_argument("--stride", type=int, default=1024)
    ap.add_argument("--max_slides", type=int, default=None)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--fmt", choices=["png", "jpg"], default="png")
    ap.add_argument("--jpeg-quality", type=int, default=95)
    ap.add_argument("--png-compress-level", type=int, default=1)
    ap.add_argument("--engine", choices=["openslide","pyvips"], default="openslide")
    ap.add_argument("--chunk-size", type=int, default=64)
    args = ap.parse_args()
    if args.engine == "openslide":
        if openslide is None:
            raise SystemExit("ERROR: falta openslide-python.")
    else:
        if pyvips is None:
            raise SystemExit("ERROR: falta pyvips/libvips/openslide para engine=pyvips.")
    out_dir = args.output_root / "01_tiles"
    ensure_dir(out_dir)
    svs_paths = sorted([p for p in args.input_path.glob("*.svs")])
    if args.max_slides is not None:
        svs_paths = svs_paths[:args.max_slides]
    summary = {"run_ts": now_ts(), "slides": [],
               "params": {"size": args.size, "stride": args.stride, "fmt": args.fmt,
                          "jpeg_quality": args.jpeg_quality, "png_compress_level": args.png_compress_level,
                          "workers": args.workers, "engine": args.engine, "chunk_size": args.chunk_size}}
    total_tiles = 0
    for svs in svs_paths:
        meta = tile_slide_generic(
            args.engine, svs, out_dir, args.size, args.stride,
            args.workers, args.fmt, args.jpeg_quality, args.png_compress_level,
            chunk_size=args.chunk_size
        )
        summary["slides"].append(meta)
        total_tiles += meta["tiles_total"]
    (out_dir / "tiles_meta.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(json.dumps({"slides_count": len(svs_paths), "tiles_total": total_tiles}, ensure_ascii=False))

if __name__ == "__main__":
    main()
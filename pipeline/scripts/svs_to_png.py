import argparse
from pathlib import Path
import pyvips

def svs_to_png(svs_path: Path, png_path: Path, max_size: int = 4096):
    image = pyvips.Image.new_from_file(str(svs_path), access="sequential")
    scale = min(1.0, max_size / max(image.width, image.height))
    resized = image.resize(scale)
    png_path.parent.mkdir(parents=True, exist_ok=True)
    resized.write_to_file(str(png_path))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert SVS to PNG preview")
    parser.add_argument("--svs", required=True, help="Input SVS file")
    parser.add_argument("--png", required=True, help="Output PNG path")
    parser.add_argument("--max-size", type=int, default=4096)
    args = parser.parse_args()
    svs_to_png(Path(args.svs), Path(args.png), args.max_size)

import csv, json
from pathlib import Path
from typing import Any, List, Optional

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def write_json(obj: Any, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False))

def append_csv_row(csv_path: Path, header: List[str], row: List[Any]):
    new_file = not csv_path.exists()
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("a", newline="") as f:
        w = csv.writer(f)
        if new_file: w.writerow(header)
        w.writerow(row)

def get_threshold(cli_value: Optional[float], file_path: Optional[Path], default: float = 0.5) -> float:
    if cli_value is not None:
        return float(cli_value)
    if file_path and file_path.exists():
        try:
            return float(file_path.read_text().strip())
        except Exception:
            pass
    return float(default)

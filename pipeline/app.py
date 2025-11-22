from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import subprocess, shlex, os

api = FastAPI()

class RunReq(BaseModel):
    session_id: str
    user_id: Optional[int] = None
    session_dir: str
    config: Optional[str] = "configs/defaults.yaml"
    bg_model: Optional[str] = None
    bg_threshold_path: Optional[str] = None
    bg_threshold: Optional[float] = None
    bg_batch: Optional[int] = None
    bg_samples: Optional[int] = None
    bg_link: Optional[str] = None
    apt_backbone: Optional[str] = None
    apt_threshold_path: Optional[str] = None
    apt_threshold: Optional[float] = None
    apt_batch: Optional[int] = None
    apt_link: Optional[str] = None
    cells_enabled: Optional[int] = None
    cells_source: Optional[str] = None
    cells_threshold: Optional[float] = None
    cells_link: Optional[str] = None
    cells_batch: Optional[int] = None
    cells_img_size: Optional[int] = None

@api.get("/health")
def health():
    return {"status": "ok"}

@api.post("/run")
def run(req: RunReq):
    cmd = [
        "python", "scripts/run_pipeline.py",
        "--session_id", str(req.session_id),
        "--session_dir", req.session_dir,
        "--config", req.config or "configs/defaults.yaml",
    ]
    if req.user_id is not None:
        cmd += ["--user_id", str(req.user_id)]

    def add_flag(name: str, value):
        if value is None:
            return
        cmd.extend([f"--{name}", str(value)])

    # Agregar solo flags soportados por el parser
    add_flag("bg-model", req.bg_model)
    add_flag("bg-threshold-path", req.bg_threshold_path)
    add_flag("bg-threshold", req.bg_threshold)
    add_flag("bg-batch", req.bg_batch)
    add_flag("bg-samples", req.bg_samples)
    add_flag("bg-link", req.bg_link)
    add_flag("apt-backbone", req.apt_backbone)
    add_flag("apt-threshold-path", req.apt_threshold_path)
    add_flag("apt-threshold", req.apt_threshold)
    add_flag("apt-batch", req.apt_batch)
    add_flag("apt-link", req.apt_link)
    add_flag("cells-enabled", req.cells_enabled)
    add_flag("cells-source", req.cells_source)
    add_flag("cells-threshold", req.cells_threshold)
    add_flag("cells-link", req.cells_link)
    add_flag("cells-batch", req.cells_batch)
    add_flag("cells-img-size", req.cells_img_size)

    proc = subprocess.run(
        cmd,
        cwd="/app",
        capture_output=True,
        text=True,
        env={**os.environ, "TF_FORCE_GPU_ALLOW_GROWTH": "1"},
    )
    return {
        "returncode": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
        "cmd": " ".join(shlex.quote(c) for c in cmd),
    }

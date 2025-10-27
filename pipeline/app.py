from fastapi import FastAPI
from pydantic import BaseModel
import subprocess, shlex, os

api = FastAPI()


class RunReq(BaseModel):
    session_id: str
    user_id: int | None = None
    session_dir: str | None = None
    svs_path: str
    config: str | None = "configs/defaults.yaml"
    tile_size: int | None = 1024
    stride: int | None = 1024
    level: int | None = 0


@api.get("/health")
def health():
    return {"status": "ok"}


@api.post("/run")
def run(req: RunReq):
    # Construye el comando exacto que espera tu run_pipeline.py
    cmd = [
        "python", "scripts/run_pipeline.py",
        "--session_id", str(req.session_id),
    ]

    if req.user_id is not None:
        cmd += ["--user_id", str(req.user_id)]
    if req.session_dir:
        cmd += ["--session_dir", req.session_dir]
    if req.config:
        cmd += ["--config", req.config]

    cmd = [
        "python", "scripts/run_pipeline.py",
        "--session_id", str(req.session_id),
        "--user_id", str(req.user_id) if req.user_id is not None else "0",
        "--session_dir", req.session_dir,
        "--config", req.config or "configs/defaults.yaml",
    ]

    # Ejecuta en /app (raíz del contenedor pipeline)
    proc = subprocess.run(
        cmd,
        cwd="/app",
        capture_output=True,
        text=True,
        env={**os.environ, "TF_FORCE_GPU_ALLOW_GROWTH": "1"},
    )

    return {
        "returncode": proc.returncode,
        "stdout": proc.stdout[-4000:],  # últimos 4000 chars
        "stderr": proc.stderr[-4000:],
        "cmd": " ".join(shlex.quote(c) for c in cmd),
    }

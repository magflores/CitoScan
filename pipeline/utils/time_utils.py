from datetime import datetime

def now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

def human_time(seconds: float) -> str:
    s = float(seconds)
    if s < 60: return f"{s:.2f}s"
    m, r = divmod(s, 60)
    if m < 60: return f"{int(m)}m {r:.1f}s"
    h, r = divmod(m, 60)
    return f"{int(h)}h {int(r)}m"

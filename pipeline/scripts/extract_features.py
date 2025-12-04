import argparse, json, time
from pathlib import Path
from typing import List, Tuple, Optional

import numpy as np
import tensorflow as tf

from utils.img_utils import list_images
from utils.io_utils import ensure_dir

def parse_size(s: str) -> Tuple[int, int]:
    return tuple(map(int, s.lower().split("x")))

def load_backbone_as_conv_base(backbone_path: Optional[Path], input_size: Tuple[int, int]) -> tf.keras.Model:
    H, W = input_size
    input_shape = (H, W, 3)
    if backbone_path is not None:
        model = tf.keras.models.load_model(str(backbone_path), compile=False)
        cand = None
        try:
            cand = model.get_layer("block5_pool").output
        except Exception:
            for layer in model.layers[::-1]:
                try:
                    out_shape = tuple(layer.output.shape[1:])
                except Exception:
                    continue
                if out_shape == (7, 7, 512):
                    cand = layer.output
                    break
        if cand is None:
            for layer in model.layers[::-1]:
                try:
                    out_shape = tuple(layer.output.shape[1:])
                except Exception:
                    continue
                if len(out_shape) == 3 and out_shape[2] == 512 and out_shape[0] == 7 and out_shape[1] == 7:
                    cand = layer.output
                    break
        if cand is None:
            raise RuntimeError("No se encontró una capa 7x7x512 en el backbone.")
        conv_base = tf.keras.Model(inputs=model.input, outputs=cand, name="vgg16_conv_base_7x7x512")
        if conv_base.input_shape[1:3] != (H, W):
            x = tf.keras.Input(shape=input_shape)
            y = conv_base(x)
            conv_base = tf.keras.Model(inputs=x, outputs=y, name="vgg16_conv_base_7x7x512_resized")
        return conv_base
    base = tf.keras.applications.VGG16(include_top=False, weights="imagenet", input_shape=input_shape, pooling=None)
    return base

def preprocess_batch(img_paths: List[Path], target_size: Tuple[int, int]) -> np.ndarray:
    H, W = target_size
    batch = []
    for p in img_paths:
        img = tf.keras.utils.load_img(str(p), target_size=(H, W))
        arr = tf.keras.utils.img_to_array(img)
        batch.append(arr)
    x = np.stack(batch, axis=0)
    x = tf.keras.applications.vgg16.preprocess_input(x)
    return x

def iter_batches(seq: List[Path], batch_size: int):
    for i in range(0, len(seq), batch_size):
        yield seq[i:i+batch_size]

def main():
    ap = argparse.ArgumentParser(description="Extraer latentes VGG16 (NoFondo → .npy) en 25,088 dims (7×7×512).")
    ap.add_argument("--in", dest="in_dir", type=Path, required=True, help="02_bg_filter/no_fondo")
    ap.add_argument("--out", dest="out_dir", type=Path, required=True, help="03_features")
    ap.add_argument("--backbone", type=Path, default=None, help="Backbone VGG16 .keras (opcional)")
    ap.add_argument("--input-size", type=str, default="224x224")
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--dtype", type=str, default="float32", choices=["float32", "float16"])
    ap.add_argument("--stats-out", dest="stats_out", type=Path, default=None)
    args = ap.parse_args()

    t_start = time.time()
    input_size = parse_size(args.input_size)
    ensure_dir(args.out_dir)
    paths = list_images(args.in_dir)

    conv_base = load_backbone_as_conv_base(args.backbone, input_size)
    conv_base.trainable = False

    flat_dim = 7 * 7 * 512
    dtype = np.float16 if args.dtype == "float16" else np.float32

    features_out_paths = []
    failed = []

    for batch_paths in iter_batches(paths, args.batch_size):
        ok_paths = []
        for p in batch_paths:
            try:
                tf.keras.utils.load_img(str(p), target_size=input_size)
                ok_paths.append(p)
            except Exception as e:
                failed.append({"image": str(p), "reason": f"load_error: {e}"})
        if not ok_paths:
            continue
        x = preprocess_batch(ok_paths, input_size)
        fm = conv_base.predict(x, verbose=0)
        if fm.ndim != 4 or fm.shape[1:4] != (7, 7, 512):
            raise RuntimeError(f"El feature map no es 7x7x512; recibido {fm.shape}.")
        fm = fm.reshape((fm.shape[0], flat_dim)).astype(dtype)
        for p, vec in zip(ok_paths, fm):
            slide_dir = args.out_dir / p.parent.name
            ensure_dir(slide_dir)
            out_path = slide_dir / f"{p.stem}.npy"
            np.save(out_path, vec)
            features_out_paths.append((p, out_path))

    index = [{"image": str(p), "feature": str(out.resolve())} for p, out in features_out_paths]
    (args.out_dir / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False))

    processed = len(paths)
    saved = len(features_out_paths)
    failed_cnt = processed - saved
    metrics = {
        "processed": processed,
        "saved": saved,
        "failed": failed_cnt if failed_cnt >= 0 else 0,
        "seconds": round(time.time() - t_start, 3),
        "dtype": args.dtype,
        "input_size": list(input_size),
        "batch_size": args.batch_size
    }
    if failed:
        (args.out_dir / "failed.json").write_text(json.dumps(failed, indent=2, ensure_ascii=False))
    if args.stats_out:
        ensure_dir(args.stats_out.parent)
        args.stats_out.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))

    print(json.dumps(metrics, ensure_ascii=False))

if __name__ == "__main__":
    main()
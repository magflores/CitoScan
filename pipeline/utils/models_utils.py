from pathlib import Path
from typing import List, Tuple, Optional
import numpy as np
from PIL import Image

def batch(iterable, n=32):
    it = list(iterable)
    for i in range(0, len(it), n):
        yield it[i:i+n]

def load_rgb(path: Path, size=None) -> np.ndarray:
    im = Image.open(path).convert("RGB")
    if size:
        im = im.resize(size, Image.NEAREST)
    return np.asarray(im, dtype=np.float32)

try:
    import tensorflow as tf
    from tensorflow.keras.models import load_model as keras_load
except Exception:
    keras_load = None

class BinaryKerasClassifier:
    def __init__(self, model_path: Path, input_size=(224,224)):
        if keras_load is None:
            raise RuntimeError("TensorFlow/Keras no disponible.")
        self.model = keras_load(model_path)
        self.input_size = input_size

    def _pp(self, arr: np.ndarray) -> np.ndarray:
        return arr / 255.0

    def predict_paths(self, paths: List[Path], batch_size=64) -> np.ndarray:
        preds=[]
        for chunk in batch(paths, batch_size):
            X = np.stack([self._pp(load_rgb(p, self.input_size)) for p in chunk], axis=0)
            y = self.model.predict(X, verbose=0)
            y = np.array(y)
            if y.ndim == 1 or y.shape[-1] == 1:
                p_pos = y.reshape(-1).astype(np.float32)
                p_neg = 1.0 - p_pos
                prob = np.stack([p_neg, p_pos], axis=-1)
            else:
                prob = y.astype(np.float32)
            preds.append(prob)
        return np.vstack(preds)

from tensorflow.keras.applications import VGG16
from tensorflow.keras.models import Model

class VGG16FeatureExtractor:
    def __init__(self, backbone_path: Optional[Path]=None, input_size=(224,224)):
        if keras_load is None:
            raise RuntimeError("TensorFlow/Keras no disponible.")
        if backbone_path and Path(backbone_path).exists():
            base = keras_load(backbone_path)
            # si el backbone ya incluye el GAP final, úsalo tal cual:
            self.model = base
        else:
            base = VGG16(weights="imagenet", include_top=False, input_shape=(*input_size,3))
            x = tf.keras.layers.GlobalAveragePooling2D()(base.output)
            self.model = Model(inputs=base.input, outputs=x)
        self.input_size = input_size

    def _pp(self, arr: np.ndarray) -> np.ndarray:
        return arr / 255.0

    def transform_paths(self, paths: List[Path], batch_size=64) -> np.ndarray:
        feats=[]
        for chunk in batch(paths, batch_size):
            X = np.stack([self._pp(load_rgb(p, self.input_size)) for p in chunk], axis=0)
            f = self.model.predict(X, verbose=0)
            feats.append(np.array(f, dtype=np.float32))
        return np.vstack(feats)

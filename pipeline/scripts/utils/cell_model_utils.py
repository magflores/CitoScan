# ---------------------------------------------------------------------
# @TODO: Dar credito a Manu
# Utilidades para manejar modelos de clasificación de células 
# ---------------------------------------------------------------------

from __future__ import annotations
import argparse
from pathlib import Path
from typing import Any, Dict, Optional

import yaml
import torch
import torch.nn as nn
import torch.nn.functional as F

# =========================================================
# YAML utils (equivalente a utils.parse_yaml)
# =========================================================
def parse_yaml(file_path: str | Path) -> Dict[str, Any]:
    file_path = str(file_path)
    with open(file_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# =========================================================
# Backbones: lógica de model_for_eval
# =========================================================
def _try_import(backbone_name: str):
    try:
        import importlib
        return importlib.import_module(backbone_name)
    except Exception:
        return None


def get_backbone(args: argparse.Namespace) -> nn.Module:
    name = getattr(args, "model_name", None)
    dim_embed = int(getattr(args, "dim_embed", 2048))

    # 1) Ruta "original": intentar importar de "models.<x>"
    if name == "convnextv2":
        mod = _try_import("models.convnextv2")
        if mod and hasattr(mod, "ConvNeXtV2Backbone"):
            return mod.ConvNeXtV2Backbone(args)

    elif name == "swin":
        mod = _try_import("models.swinv2")
        if mod and hasattr(mod, "SwinTransformerV2Backbone"):
            return mod.SwinTransformerV2Backbone(args)

    elif name == "seresnext":
        mod = _try_import("models.seresnext")
        if mod and hasattr(mod, "SEResNeXtBackbone"):
            return mod.SEResNeXtBackbone(args)

    elif name == "resnet":
        mod = _try_import("models.resnet")
        if mod and hasattr(mod, "ResNetBackbone"):
            return mod.ResNetBackbone(args)

    try:
        from torchvision import models as tvm
    except Exception as e:
        raise RuntimeError(
            f"No se pudieron importar los backbones originales ni torchvision "
            f"para crear un fallback. Error: {e}"
        )
    if name == "resnet" or name is None:
        backbone = tvm.resnet50(weights=None)
        feat_dim = backbone.fc.in_features
        backbone.fc = nn.Identity()
        # Empaquetamos para exponer una salida de dimensión dim_embed
        proj = nn.Linear(feat_dim, dim_embed) if feat_dim != dim_embed else nn.Identity()
        return nn.Sequential(backbone, proj)

    if name == "swin":
        if hasattr(tvm, "swin_v2_s"):
            backbone = tvm.swin_v2_s(weights=None)
            feat_dim = backbone.head.in_features
            backbone.head = nn.Identity()
        else:
            backbone = tvm.resnet50(weights=None)
            feat_dim = backbone.fc.in_features
            backbone.fc = nn.Identity()
        proj = nn.Linear(feat_dim, dim_embed) if feat_dim != dim_embed else nn.Identity()
        return nn.Sequential(backbone, proj)

    if name == "convnextv2":
        if hasattr(tvm, "convnext_base"):
            backbone = tvm.convnext_base(weights=None)
            feat_dim = backbone.classifier[2].in_features
            backbone.classifier = nn.Identity()
        else:
            backbone = tvm.resnet50(weights=None)
            feat_dim = backbone.fc.in_features
            backbone.fc = nn.Identity()
        proj = nn.Linear(feat_dim, dim_embed) if feat_dim != dim_embed else nn.Identity()
        return nn.Sequential(backbone, proj)

    if name == "seresnext":
        backbone = tvm.resnet50(weights=None)
        feat_dim = backbone.fc.in_features
        backbone.fc = nn.Identity()
        proj = nn.Linear(feat_dim, dim_embed) if feat_dim != dim_embed else nn.Identity()
        return nn.Sequential(backbone, proj)

    backbone = tvm.resnet50(weights=None)
    feat_dim = backbone.fc.in_features
    backbone.fc = nn.Identity()
    proj = nn.Linear(feat_dim, dim_embed) if feat_dim != dim_embed else nn.Identity()
    return nn.Sequential(backbone, proj)


# =========================================================
# Modelo (compatible con model_for_eval original)
# =========================================================
class Model(nn.Module):
    """
    Replica la estructura del model_for_eval:
      - backbone -> features (dim = args.dim_embed)
      - projection: Linear(dim_embed -> 512) + ReLU + Dropout(0.5)
      - classifier: 512 -> 128 -> num_classes
      - salida: Sigmoid(logits)  [pensado para binario; logits.squeeze(1)]
    """
    def __init__(self, args: argparse.Namespace):
        super().__init__()
        self.args = args

        self.backbone = get_backbone(args)
        self.projection = nn.Sequential(
            nn.Linear(int(args.dim_embed), 512),
            nn.ReLU(True),
            nn.Dropout(0.5),
        )
        self.classifier = nn.Sequential(
            nn.Linear(512, 128),
            nn.ReLU(True),
            nn.Dropout(0.5),
            nn.Linear(128, int(args.num_classes)),
        )
        self.activation = nn.Sigmoid()

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        x = self.backbone(images)
        if x.ndim == 4:
            x = F.adaptive_avg_pool2d(x, output_size=1).flatten(1)
        x = self.projection(x)
        logits = self.classifier(x).squeeze(1) 
        probs = self.activation(logits)
        return probs


# =========================================================
# Builders convenientes para classify_cells.py
# =========================================================
def _namespace_from_dict(d: Dict[str, Any]) -> argparse.Namespace:
    ns = argparse.Namespace()
    for k, v in d.items():
        setattr(ns, k, v)
    return ns


def _ensure_required_args(args: argparse.Namespace) -> argparse.Namespace:
    """
    Asegura campos mínimos que usan eval/inferencia:
      - img_size
      - dim_embed
      - num_classes
      - batch_size_test (si se quiere usar el DataLoader del evalModel original)
    """
    if not hasattr(args, "img_size"):
        setattr(args, "img_size", 224)
    if not hasattr(args, "dim_embed"):
        setattr(args, "dim_embed", 2048)
    if not hasattr(args, "num_classes"):
        setattr(args, "num_classes", 1)
    if not hasattr(args, "batch_size_test"):
        setattr(args, "batch_size_test", 256)
    if not hasattr(args, "model_name"):
        setattr(args, "model_name", "resnet")
    return args


def build_model_from_yaml(yaml_file: Path, device: str = "cuda") -> tuple[nn.Module, argparse.Namespace]:
    """
    Lee el YAML de backbone/entrenamiento y devuelve (model, args).
    Compatible con evalModel.py
    """
    params = parse_yaml(yaml_file)
    args = _namespace_from_dict(params if isinstance(params, dict) else {})
    args.yaml_file = str(yaml_file)
    args = _ensure_required_args(args)

    model = Model(args).to(device)
    return model, args


def load_checkpoint(model: nn.Module, checkpoint_path: Path, device: str = "cuda") -> nn.Module:
    """
    Carga un checkpoint con tolerancia a claves extra y missing:
      - elimina 'loss.loss.weight' si aparece
      - usa strict=False para permitir pequeñas diferencias
    Deja el modelo en eval().
    """
    ckpt = torch.load(str(checkpoint_path), map_location=device)
    state = ckpt.get("model_state_dict", ckpt)
    if "loss.loss.weight" in state:
        state.pop("loss.loss.weight", None)
    model.load_state_dict(state, strict=False)
    model.eval()
    return model

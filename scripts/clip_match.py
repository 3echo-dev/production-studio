"""Picture matching for the sequence stage: CLIP image embeddings through Hugging Face transformers.

    from clip_match import embed_images
    E = embed_images(["a.png", "b.png"])   # (N, 512) float32, each row unit length; E @ E.T is cosine

The model is openai/clip-vit-base-patch32 (the published OpenAI weights, fetched once into the
Hugging Face cache, about 600 MB). It loads on first use and stays loaded for the process. Runs on the
GPU when torch sees CUDA, else the CPU. Needs numpy, torch, transformers and Pillow.
"""
from __future__ import annotations
from pathlib import Path

MODEL_ID = "openai/clip-vit-base-patch32"
BATCH = 32
_state: dict = {}


def _model():
    if not _state:
        import torch
        from transformers import CLIPModel, CLIPProcessor
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = CLIPModel.from_pretrained(MODEL_ID).to(device).eval()
        _state.update(torch=torch, device=device, model=model, processor=CLIPProcessor.from_pretrained(MODEL_ID))
    return _state


def _features(out):
    # transformers 4 returns the projected embedding as a tensor; 5 can return an output object whose
    # pooler_output is that same embedding. Either way it is already in CLIP's shared space.
    return getattr(out, "pooler_output", None) if not hasattr(out, "norm") else out


def embed_images(paths):
    import numpy as np
    from PIL import Image
    if not paths:
        return np.zeros((0, 512), dtype=np.float32)
    s = _model()
    rows = []
    for i in range(0, len(paths), BATCH):
        imgs = []
        for p in paths[i:i + BATCH]:
            with Image.open(Path(p)) as im:
                imgs.append(im.convert("RGB"))
        inputs = s["processor"](images=imgs, return_tensors="pt").to(s["device"])
        with s["torch"].no_grad():
            f = _features(s["model"].get_image_features(**inputs))
        f = f / f.norm(dim=-1, keepdim=True).clamp_min(1e-8)
        rows.append(f.cpu().numpy().astype(np.float32))
    return np.concatenate(rows, axis=0)


def model_info():
    return {"model_id": MODEL_ID, "dim": 512}

"""
modal_inference.py (Fixed Normalization Version)
"""
import os
import logging
import numpy as np
import modal

logger = logging.getLogger("modal_inference")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = modal.App("automergenet-inference")

IMAGE = modal.Image.debian_slim(python_version="3.10").pip_install("torch", "numpy")
ARTIFACTS_VOLUME = modal.Volume.from_name("model-artifacts")

@app.cls(
    gpu="T4", 
    image=IMAGE, 
    volumes={"/root/artifacts": ARTIFACTS_VOLUME},
    timeout=600
)
class Model:
    @modal.enter()
    def _enter(self):
        import torch
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # 1. Load the Model Graph
        compiled_model_path = "/root/artifacts/automergenet_compiled.pt"
        self.model = torch.jit.load(compiled_model_path, map_location=self.device)
        self.model.eval()
        
        # 2. Load Normalization Tensors (The "Ruler")
        # We load these once and pin them to GPU for speed
        self.train_mean = torch.load("/root/artifacts/train_mean.pt", map_location=self.device)
        self.train_std = torch.load("/root/artifacts/train_std.pt", map_location=self.device)
        
        self.activation = torch.nn.Sigmoid()
        logger.info("✨ Graph and Scaling Tensors successfully pinned to GPU.")

    @modal.method()
    def predict_batch(self, payload):
        import torch
        arr = np.asarray(payload, dtype=np.float32)
        batch_tensor = torch.from_numpy(arr).float().to(self.device)
        
        processed_tensors = []

        for single_img in batch_tensor:
            # A. Normalize Channel 0 (CH4) with the custom Gap method
            # We keep the numpy math for your specific gap logic
            ch0_raw = single_img[0].cpu().numpy()
            ch0_enhanced = torch.unsqueeze(self._normalize_with_gap(ch0_raw), 0).to(self.device)
            
            # B. Z-Score Normalize Channels 1-10 (Auxiliary)
            # Math: (X - Mean) / Std
            aux_raw = single_img[1:]
            mean_3d = self.train_mean.view(-1, 1, 1)
            std_3d = self.train_std.view(-1, 1, 1)
            
            aux_normalized = (aux_raw - mean_3d) / std_3d
            
            # C. Fuse and Clean
            normalized_img = torch.cat([ch0_enhanced, aux_normalized], dim=0)
            processed_tensors.append(torch.nan_to_num(normalized_img, nan=0.0))

        final_gpu_input = torch.stack(processed_tensors)

        with torch.no_grad():
            outputs = self.model(final_gpu_input)
            probabilities = self.activation(outputs).cpu().numpy().flatten()

        return [float(p) for p in probabilities]

    def _normalize_with_gap(self, data: np.ndarray, enh_max: int = 100, gap: float = 0.05):
        import torch
        vals = data.flatten()
        no_nan_vals = vals[~np.isnan(vals)]
        if len(no_nan_vals) == 0: 
            return torch.zeros((32, 32), device=self.device)
            
        testnorm = data - (np.mean(no_nan_vals) - np.std(no_nan_vals))
        testnorm[testnorm < 0] = np.nan
        testnorm /= (1 / (1 - gap) * enh_max)
        testnorm += gap
        testnorm[testnorm > 1] = 1
        return torch.from_numpy(np.nan_to_num(testnorm)).float()
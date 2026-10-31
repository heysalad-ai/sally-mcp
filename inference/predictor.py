"""Private-artifact Sally-Nano inference. Predictions are shadow observations only."""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "vendor"))
import sally_rules  # Preload vendored rules before lr_feats' legacy path insertion.
from lr_feats import rule_feats  # Original training feature implementation, unchanged.


class Predictor:
    def __init__(self, artifact_dir, manifest_path=HERE / "artifact-manifest.json"):
        directory = Path(artifact_dir).resolve(strict=True)
        manifest = json.loads(Path(manifest_path).read_text())
        for name, digest in manifest["files"].items():
            path = directory / name
            if path.parent != directory or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError("Private Nano artifact does not match the pinned manifest")
        info = json.loads((directory / "info.json").read_text())
        if info["arch"] != "nano1x64" or not info["rulefeats"]:
            raise ValueError("Unsupported Nano architecture/features")
        self.model = manifest["model"]
        self.sha256 = manifest["files"]["model.int8.onnx"]
        self.max_length = manifest["max_length"]
        self.tokenizer = AutoTokenizer.from_pretrained(str(directory), local_files_only=True, trust_remote_code=False)
        self.idmap = np.load(directory / "idmap.npy", allow_pickle=False)
        if self.idmap.dtype != np.uint16 or self.idmap.ndim != 1 or int(self.idmap.max()) >= info["vocab"]:
            raise ValueError("Invalid compact token ID map")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(directory / "model.int8.onnx"), options, providers=["CPUExecutionProvider"])
        if {i.name for i in self.session.get_inputs()} != {"input_ids", "attention_mask", "token_type_ids", "rf"}:
            raise ValueError("Unexpected Nano input contract")

    def feed(self, line, product):
        # Same preprocessing as scripts/eval_ladder.py at 783d766. No feature port.
        x = self.tokenizer(line, product, return_tensors="np", truncation=True, max_length=self.max_length)
        x["input_ids"] = self.idmap[x["input_ids"]].astype(np.int64)
        feed = {k: x[k].astype(np.int64) for k in ("input_ids", "attention_mask", "token_type_ids")}
        feed["rf"] = rule_feats(line, product)[None, :].astype(np.float32)
        return feed

    def predict(self, line, product):
        if not all(isinstance(s, str) and 0 < len(s.strip()) <= 400 for s in (line, product)):
            raise ValueError("line and product must contain 1–400 characters")
        logit = float(self.session.run(None, self.feed(line, product))[0].ravel()[0])
        if not np.isfinite(logit):
            raise ValueError("Non-finite Nano logit")
        probability = float(1 / (1 + np.exp(-logit)))
        if not np.isfinite(probability):
            raise ValueError("Non-finite Nano prediction")
        return {"probability": probability, "model": self.model, "sha256": self.sha256, "mode": "shadow"}

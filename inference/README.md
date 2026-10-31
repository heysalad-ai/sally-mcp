# Sally-Nano private inference

This CPU service only returns shadow observations. Luna/the Sally API remains authoritative. No trained weights, tokenizer, or ID map belong in this public repository.

`vendor/lr_feats.py` and `vendor/sally_rules.py` are unchanged copies from Hey-Salad/heysalad-payme, commit `783d7668215edf33515c74a94d1fb6af72bdfa92`, respectively `sally-model/scripts/lr_feats.py` and `sally-model/rules/sally_rules.py`. The inference preprocessing follows that commit's `sally-model/scripts/eval_ladder.py`: paired tokenizer input, length 48, compact `idmap.npy`, the original 16 float32 rule features, then sigmoid of the logit. Do not substitute the bi-encoder class in `overnight.py` for this student model.

Install `requirements.txt` in a dedicated Python 3.12 environment. Mount or sync the five private files listed in `artifact-manifest.json` into a directory outside the public checkout, then run:

```sh
export SALLY_NANO_ARTIFACT_DIR=/private/model-directory
python inference/server.py
```

The default listener is localhost:8765. Every artifact digest is checked before loading; tokenizer downloads and remote code are disabled. `model.int4.onnx` and `model.onnx` are never loaded. Updating the checkpoint requires reviewing a new manifest and its matching feature implementation.

For remote operation, deploy behind an HTTPS ingress with a private read-only model mount, set `SALLY_NANO_HOST=0.0.0.0` and a secret `SALLY_NANO_TOKEN` (at least 32 characters). Do not expose the Python listener directly to the internet. Configure the MCP Worker's `NANO_SHADOW_URL`, `NANO_SHADOW_SHA256` (the manifest's int8 model digest), and secret `NANO_SHADOW_TOKEN`. The owning API draft PR #29 uses a `SALLY_NANO` service binding and pinned `SALLY_NANO_SHA256`; it requires an appropriate private bridge to this service. No inference hosting has been provisioned by this implementation.

`POST /predict` accepts only `{ "line": "milk 2 pints", "product": "Semi Skimmed Milk 2 Pints" }`, with a 4 KiB body limit and 400 characters per input. It returns `{probability,model,sha256,mode:"shadow"}`. Requests are processed serially; put bounded admission/rate controls at the ingress. Request data and credentials are not logged or persisted. Health responses omit artifact paths.

Run `python -m unittest discover -s inference -p 'test_*.py'`. Set `SALLY_NANO_ARTIFACT_DIR` to also run the actual private-checkpoint tests; otherwise those are explicitly skipped. These checks do not reproduce the reported gold accuracy.

import hashlib
from http.server import HTTPServer
import json
import os
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
from predictor import Predictor, rule_feats
from server import make_handler

HERE = Path(__file__).resolve().parent


class SourceTests(unittest.TestCase):
    def test_original_feature_sources_are_unchanged(self):
        expected = {"lr_feats.py": "2ade9b402a577e35c657ef77dd3ed6cc92460c9fa6a45a296d2346403112ee63", "sally_rules.py": "12fca36862a9bd8ef91ff3946892c8fcc1317ca99406f3ab438885ada5ef5434"}
        for name, digest in expected.items():
            self.assertEqual(hashlib.sha256((HERE / "vendor" / name).read_bytes()).hexdigest(), digest)

    def test_rule_features_cover_size_form_and_preferences(self):
        size = rule_feats("milk 1l", "Organic Tesco Whole Milk 250ml")
        self.assertEqual(size.shape, (16,))
        self.assertEqual(size.dtype, np.float32)
        self.assertEqual(size[0], 1)  # Original rules reject undersized pack.
        self.assertEqual(size[5], 1)
        self.assertEqual(size[9], 1)  # Organic flag.
        self.assertEqual(size[10], 1)  # Own-label flag.
        self.assertEqual(rule_feats("bananas", "banana bread")[0], 1)


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Stub:
            model = "test-only"
            def predict(self, line, product):
                if not all(isinstance(s, str) and 0 < len(s) <= 400 for s in (line, product)):
                    raise ValueError("bad input")
                return {"probability": 0.5, "mode": "shadow"}
        cls.server = HTTPServer(("127.0.0.1", 0), make_handler(Stub(), "test-token"))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/predict"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, body, token="test-token"):
        return urlopen(Request(self.url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token}), timeout=5)

    def test_authorized_prediction(self):
        with self.request({"line": "milk", "product": "milk"}) as response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(json.load(response)["mode"], "shadow")

    def test_authentication(self):
        with self.assertRaises(HTTPError) as caught:
            self.request({"line": "milk", "product": "milk"}, "wrong-token")
        self.assertEqual(caught.exception.code, 401)

    def test_invalid_schema_and_oversize(self):
        for body, status in [({"line": "milk"}, 400), ({"line": "x" * 401, "product": "milk"}, 400), ({"line": "x" * 5000, "product": "milk"}, 413)]:
            with self.subTest(status=status), self.assertRaises(HTTPError) as caught:
                self.request(body)
            self.assertEqual(caught.exception.code, status)


@unittest.skipUnless(os.environ.get("SALLY_NANO_ARTIFACT_DIR"), "Private checkpoint is not available; no weights in CI")
class PrivateCheckpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.predictor = Predictor(os.environ["SALLY_NANO_ARTIFACT_DIR"])

    def test_actual_checkpoint_regressions(self):
        for line, product, expected in [("milk 2 pints", "Semi Skimmed Milk 2 Pints", 0.5966200577), ("bananas", "Banana Bread 400g", 0.0000011831), ("coconut milk 400ml", "Coconut Milk Drink 1l", 0.0000114074)]:
            with self.subTest(line=line):
                result = self.predictor.predict(line, product)
                self.assertAlmostEqual(result["probability"], expected, delta=0.0002)
                self.assertEqual(result["mode"], "shadow")

    def test_original_feature_feed_and_compact_ids(self):
        feed = self.predictor.feed("milk " * 100, "Organic Milk 1l " * 100)
        self.assertEqual(feed["input_ids"].dtype, np.int64)
        self.assertEqual(feed["input_ids"].shape, (1, 48))
        self.assertLess(int(feed["input_ids"].max()), 2591)
        np.testing.assert_array_equal(feed["rf"][0], rule_feats("milk " * 100, "Organic Milk 1l " * 100))

    def test_artifact_digest_mismatch_fails_closed(self):
        manifest = json.loads((HERE / "artifact-manifest.json").read_text())
        manifest["files"]["model.int8.onnx"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "pinned manifest"):
                Predictor(os.environ["SALLY_NANO_ARTIFACT_DIR"], path)

    def test_invalid_inputs(self):
        for line in ("", " " * 4, "x" * 401, None):
            with self.assertRaises(ValueError):
                self.predictor.predict(line, "milk")

    def test_actual_checkpoint_http_contract(self):
        server = HTTPServer(("127.0.0.1", 0), make_handler(self.predictor, "private-test-token"))
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = Request(f"http://127.0.0.1:{server.server_port}/predict", data=json.dumps({"line": "milk 2 pints", "product": "Semi Skimmed Milk 2 Pints"}).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer private-test-token"})
            with urlopen(request, timeout=5) as response:
                result = json.load(response)
            self.assertAlmostEqual(result["probability"], 0.5966200577, delta=0.0002)
            self.assertEqual(result["sha256"], self.predictor.sha256)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()

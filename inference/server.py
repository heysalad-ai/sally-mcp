"""Bounded HTTP adapter; place behind authenticated HTTPS for remote use."""
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os

from predictor import Predictor


def make_handler(predictor, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # No grocery text, request paths, credentials, or identifiers in logs.

        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def reply(self, status, body):
            data = json.dumps(body, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/health":
                self.reply(200, {"status": "ok", "model": predictor.model, "mode": "shadow"})
            else:
                self.reply(404, {"error": "not_found"})

        def do_POST(self):
            if self.path != "/predict":
                return self.reply(404, {"error": "not_found"})
            if token and not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                return self.reply(401, {"error": "unauthorized"})
            try:
                if self.headers.get("Transfer-Encoding") or self.headers.get_content_type() != "application/json":
                    return self.reply(415, {"error": "json_required"})
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 4096:
                    return self.reply(413, {"error": "invalid_body_size"})
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict) or set(body) != {"line", "product"}:
                    raise ValueError("Invalid request")
                result = predictor.predict(body["line"], body["product"])
            except (ValueError, TypeError, TimeoutError):
                return self.reply(400, {"error": "invalid_request"})
            except Exception:
                return self.reply(503, {"error": "inference_unavailable"})
            self.reply(200, result)
    return Handler


if __name__ == "__main__":
    host = os.environ.get("SALLY_NANO_HOST", "127.0.0.1")
    token = os.environ.get("SALLY_NANO_TOKEN", "")
    if host not in ("127.0.0.1", "::1", "localhost") and len(token) < 32:
        raise SystemExit("Remote binding requires a secret SALLY_NANO_TOKEN of at least 32 characters")
    predictor = Predictor(os.environ["SALLY_NANO_ARTIFACT_DIR"])
    HTTPServer((host, int(os.environ.get("PORT", "8765"))), make_handler(predictor, token)).serve_forever()

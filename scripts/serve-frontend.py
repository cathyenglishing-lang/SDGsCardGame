"""Static server for frontend/ that mirrors the Vercel layout (/ and /static/ both map to frontend/).

python scripts/serve-frontend.py 8766  ->  http://127.0.0.1:8766/games/innovation-harbor/
(python -m http.server does not work on Windows: the registry maps .js to text/plain, which browsers reject for modules.)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
ROOT = Path(__file__).resolve().parent.parent / "frontend"
SimpleHTTPRequestHandler.extensions_map.update({
    ".js": "application/javascript", ".mjs": "application/javascript",
    ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
    ".css": "text/css", ".html": "text/html", ".json": "application/json",
    ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png",
})


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith("/static/"):
            path = path[len("/static"):]
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"frontend/ -> http://127.0.0.1:{PORT}/games/innovation-harbor/")
    ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(ROOT))).serve_forever()

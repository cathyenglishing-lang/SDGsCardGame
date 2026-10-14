"""Static server for the prototype with correct MIME types (Windows' registry maps .js to text/plain)."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
SimpleHTTPRequestHandler.extensions_map.update({
    ".js": "application/javascript", ".mjs": "application/javascript",
    ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
    ".css": "text/css", ".html": "text/html", ".json": "application/json",
    ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png",
})

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
    def log_message(self, *a):
        pass

if __name__ == "__main__":
    print(f"Innovation Harbor → http://127.0.0.1:{PORT}/")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

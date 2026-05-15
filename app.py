"""Pipe Organ — zero-dependency HTTP server for the organ web app."""

import argparse
import http.server
import socketserver
from pathlib import Path

STATIC_DIR = Path(__file__).parent / "static"


class OrganHandler(http.server.SimpleHTTPRequestHandler):
    """Serve static files from the static/ directory."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format, *args):
        print(f"  {args[0]}")


def main():
    parser = argparse.ArgumentParser(description="Pipe Organ web server")
    parser.add_argument(
        "--port", type=int, default=5000, help="Port to listen on (default: 5000)"
    )
    parser.add_argument(
        "--host", type=str, default="0.0.0.0", help="Host to bind to (default: 0.0.0.0)"
    )
    args = parser.parse_args()

    with socketserver.ThreadingTCPServer((args.host, args.port), OrganHandler) as httpd:
        print(f"\n  Pipe Organ server running at http://{args.host}:{args.port}")
        print(f"  Open your browser and press letter keys (A-Z) to play.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Server stopped.")

if __name__ == "__main__":
    main()

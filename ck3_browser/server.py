"""Local HTTP server for the CK3 Save Browser."""

import json
import os
import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

from . import scanner, narrator
from . import pages

APP_STATE = {
    "game_data": None,
    "api_key": None,
    "parsing": False,
    "parse_progress": "",
    "parse_percent": 0,
    "parse_done": False,
    "save_name": "",
}


def _parse_in_background(filepath: str):
    """Parse a save file in a background thread."""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    try:
        APP_STATE["parsing"] = True
        APP_STATE["parse_done"] = False
        APP_STATE["parse_progress"] = "Loading save file..."
        APP_STATE["parse_percent"] = 5

        from ck3_parser.__main__ import load_save_text, parse_save_streaming
        from ck3_parser.extractor import CK3Extractor

        APP_STATE["parse_progress"] = "Reading save file from disk..."
        APP_STATE["parse_percent"] = 10
        text = load_save_text(filepath)

        APP_STATE["parse_progress"] = "Parsing game data (this may take a minute for large saves)..."
        APP_STATE["parse_percent"] = 30
        save_data = parse_save_streaming(text)

        APP_STATE["parse_progress"] = "Extracting characters, wars, dynasties..."
        APP_STATE["parse_percent"] = 70
        extractor = CK3Extractor(save_data)
        extracted = extractor.extract_all()

        APP_STATE["parse_progress"] = "Building indexes..."
        APP_STATE["parse_percent"] = 90

        # Initialize narrator cache
        narrator.init_cache("/tmp/ck3_browser_cache")

        APP_STATE["game_data"] = extracted
        APP_STATE["parse_progress"] = "Done!"
        APP_STATE["parse_percent"] = 100
        APP_STATE["parse_done"] = True
        APP_STATE["parsing"] = False

        stats = extracted.get("stats", {})
        print(f"  Parsed: {stats.get('total_characters',0)} characters, {stats.get('total_wars',0)} wars, {stats.get('total_titles',0)} titles")

    except Exception as e:
        APP_STATE["parse_progress"] = f"Error: {e}"
        APP_STATE["parse_percent"] = 0
        APP_STATE["parsing"] = False
        APP_STATE["parse_done"] = False
        print(f"  Parse error: {e}")
        import traceback
        traceback.print_exc()


def _do_search(query: str, game_data: dict) -> list:
    """Search characters, wars, titles, dynasties by name."""
    q = query.lower().strip()
    results = []

    chars = game_data.get("characters", {})
    for cid, c in chars.items():
        if q in c.get("first_name", "").lower():
            titles = ", ".join(c.get("titles_held", [])[:2]) or ("Alive" if c.get("alive") else "Dead")
            results.append({"type": "character", "id": cid, "name": c.get("first_name", "Unknown"), "detail": titles})

    for i, w in enumerate(game_data.get("wars", [])):
        if q in w.get("name", "").lower():
            results.append({"type": "war", "id": str(i), "name": w.get("name", "Unknown"), "detail": w.get("casus_belli", "")})

    for tid, t in game_data.get("titles", {}).items():
        if q in t.get("name", "").lower() or q in t.get("key", "").lower():
            results.append({"type": "title", "id": tid, "name": t.get("name", t.get("key", "Unknown")), "detail": t.get("tier", "")})

    for did, d in game_data.get("dynasties", {}).items():
        if q in d.get("name", "").lower():
            results.append({"type": "dynasty", "id": did, "name": d.get("name", "Unknown"), "detail": ""})

    return results[:50]


def _extract_multipart(body: bytes, content_type: str):
    """Parse multipart form data. Returns dict of {field_name: value}."""
    # Extract boundary
    parts = content_type.split("boundary=")
    if len(parts) < 2:
        return {}
    boundary = parts[1].strip().encode()
    if boundary.startswith(b'"') and boundary.endswith(b'"'):
        boundary = boundary[1:-1]

    fields = {}
    sections = body.split(b"--" + boundary)

    for section in sections:
        if not section or section.strip() in (b"", b"--", b"--\r\n"):
            continue

        # Split headers from body
        if b"\r\n\r\n" in section:
            header_part, body_part = section.split(b"\r\n\r\n", 1)
        elif b"\n\n" in section:
            header_part, body_part = section.split(b"\n\n", 1)
        else:
            continue

        # Strip trailing \r\n from body
        if body_part.endswith(b"\r\n"):
            body_part = body_part[:-2]

        header_str = header_part.decode("utf-8", errors="replace")
        # Find field name
        name = None
        filename = None
        for line in header_str.split("\n"):
            if "name=" in line.lower():
                # Extract name="..."
                import re
                m = re.search(r'name="([^"]*)"', line)
                if m:
                    name = m.group(1)
                m2 = re.search(r'filename="([^"]*)"', line)
                if m2:
                    filename = m2.group(1)

        if name:
            if filename:
                fields[name] = {"filename": filename, "data": body_part}
            else:
                fields[name] = body_part.decode("utf-8", errors="replace").strip()

    return fields


class CK3Handler(BaseHTTPRequestHandler):
    """HTTP request handler for the CK3 browser."""

    def log_message(self, format, *args):
        # Quiet logging — only log errors
        if args and "404" in str(args[0]):
            super().log_message(format, *args)

    def _respond(self, html: str, status: int = 200, content_type: str = "text/html"):
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _respond_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def _redirect(self, url: str):
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        params = urllib.parse.parse_qs(parsed.query)

        gd = APP_STATE["game_data"]
        api_key = APP_STATE["api_key"]

        # Landing page
        if path == "/":
            saves = scanner.scan_for_saves()
            self._respond(pages.landing_page(saves))

        # Load a save by path
        elif path == "/load":
            filepath = params.get("path", [""])[0]
            key = params.get("api_key", [""])[0]
            if key:
                APP_STATE["api_key"] = key
            if filepath and not APP_STATE["parsing"]:
                APP_STATE["save_name"] = os.path.basename(filepath)
                t = threading.Thread(target=_parse_in_background, args=(filepath,), daemon=True)
                t.start()
            self._respond(pages.loading_page(APP_STATE["save_name"]))

        # Parse status (polled by loading page)
        elif path == "/parse-status":
            self._respond_json({
                "done": APP_STATE["parse_done"],
                "progress": APP_STATE["parse_progress"],
                "percent": APP_STATE["parse_percent"],
            })

        # All routes below require parsed game data
        elif gd is None:
            self._redirect("/")

        elif path == "/portal":
            self._respond(pages.portal_page(gd))

        elif path.startswith("/character/"):
            char_id = path.split("/character/", 1)[1]
            char = gd.get("characters", {}).get(char_id)
            if char:
                self._respond(pages.character_page(char, gd, api_key))
            else:
                self._respond(f"<h1>Character {char_id} not found</h1>", 404)

        elif path.startswith("/war/"):
            try:
                war_index = int(path.split("/war/", 1)[1])
                wars = gd.get("wars", [])
                if 0 <= war_index < len(wars):
                    self._respond(pages.war_page(wars[war_index], war_index, gd, api_key))
                else:
                    self._respond("<h1>War not found</h1>", 404)
            except (ValueError, IndexError):
                self._respond("<h1>War not found</h1>", 404)

        elif path.startswith("/title/"):
            title_id = path.split("/title/", 1)[1]
            title = gd.get("titles", {}).get(title_id)
            if title:
                self._respond(pages.title_page(title, gd, api_key))
            else:
                self._respond(f"<h1>Title {title_id} not found</h1>", 404)

        elif path.startswith("/dynasty/"):
            dyn_id = path.split("/dynasty/", 1)[1]
            dynasty = gd.get("dynasties", {}).get(dyn_id)
            if dynasty:
                self._respond(pages.dynasty_page(dynasty, gd, api_key))
            else:
                self._respond(f"<h1>Dynasty {dyn_id} not found</h1>", 404)

        elif path == "/player-rulers":
            self._respond(pages.player_rulers_page(gd, api_key))

        elif path == "/characters":
            self._respond(pages.characters_list_page(gd))

        elif path == "/wars":
            self._respond(pages.wars_list_page(gd))

        elif path == "/dynasties":
            self._respond(pages.dynasties_list_page(gd))

        elif path == "/neighbors":
            self._respond(pages.neighbors_page(gd, api_key))

        elif path == "/search":
            query = params.get("q", [""])[0]
            results = _do_search(query, gd) if query else []
            self._respond(pages.search_results_page(query, results, gd))

        else:
            self._respond("<h1>404 Not Found</h1>", 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/upload":
            content_length = int(self.headers.get("Content-Length", 0))
            content_type = self.headers.get("Content-Type", "")

            body = self.rfile.read(content_length)
            fields = _extract_multipart(body, content_type)

            # Get API key
            api_key = fields.get("api_key", "")
            if api_key:
                APP_STATE["api_key"] = api_key

            # Get uploaded file
            save_file = fields.get("save_file")
            if save_file and isinstance(save_file, dict) and save_file.get("data"):
                save_path = "/tmp/ck3_uploaded_save.ck3"
                with open(save_path, "wb") as f:
                    f.write(save_file["data"])

                APP_STATE["save_name"] = save_file.get("filename", "uploaded save")

                if not APP_STATE["parsing"]:
                    t = threading.Thread(target=_parse_in_background, args=(save_path,), daemon=True)
                    t.start()

                self._respond(pages.loading_page(APP_STATE["save_name"]))
            else:
                self._redirect("/")
        else:
            self._respond("<h1>404 Not Found</h1>", 404)


def run_server(port: int = 8743):
    """Start the HTTP server."""
    # Try a range of ports if the default is busy
    for p in range(port, port + 10):
        try:
            server = HTTPServer(("127.0.0.1", p), CK3Handler)
            print(f"  Server running at http://localhost:{p}")
            server.serve_forever()
            return
        except OSError as e:
            if "Address already in use" in str(e) or "10048" in str(e):
                print(f"  Port {p} busy, trying {p+1}...")
                continue
            raise
    print("  Error: Could not find an available port.")

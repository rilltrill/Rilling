#!/usr/bin/env python3
"""
CK3 Save Browser — Desktop Application

Double-click the launcher or run: python3 -m ck3_browser
Opens a Wikipedia-style browser for your Crusader Kings III saves.
"""

import webbrowser
import threading
import time

def main():
    print()
    print("  ==========================================")
    print("       CK3 Save Browser")
    print("       Interactive Campaign Encyclopedia")
    print("  ==========================================")
    print()

    # Scan for saves
    from .scanner import scan_for_saves
    saves = scan_for_saves()
    if saves:
        print(f"  Found {len(saves)} save file(s):")
        for s in saves[:5]:
            print(f"    - {s['name']} ({s['size_mb']} MB)")
        if len(saves) > 5:
            print(f"    ... and {len(saves)-5} more")
    else:
        print("  No save files found in default locations.")
        print("  You can upload or browse to your save file in the browser.")
    print()

    # Open browser after a short delay (give server time to start)
    port = 8743
    def open_browser():
        time.sleep(1.0)
        webbrowser.open(f"http://localhost:{port}")

    threading.Thread(target=open_browser, daemon=True).start()

    print(f"  Opening browser to http://localhost:{port}")
    print(f"  Press Ctrl+C to quit.")
    print()

    # Start server (blocks)
    from .server import run_server
    try:
        run_server(port)
    except KeyboardInterrupt:
        print("\n  Goodbye!")


if __name__ == "__main__":
    main()

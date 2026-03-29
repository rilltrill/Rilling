"""
Scans for CK3 save files in default locations.
"""

import os
import platform
from pathlib import Path
from typing import List, Dict


def get_default_save_dirs() -> List[Path]:
    """Return possible CK3 save directories for the current platform."""
    home = Path.home()
    system = platform.system()

    dirs = []
    if system == "Darwin":  # macOS
        dirs.append(home / "Documents" / "Paradox Interactive" / "Crusader Kings III" / "save games")
        dirs.append(home / "Library" / "Application Support" / "Paradox Interactive" / "Crusader Kings III" / "save games")
    elif system == "Windows":
        docs = home / "Documents"
        dirs.append(docs / "Paradox Interactive" / "Crusader Kings III" / "save games")
        # OneDrive Documents
        dirs.append(home / "OneDrive" / "Documents" / "Paradox Interactive" / "Crusader Kings III" / "save games")
    else:  # Linux
        dirs.append(home / ".local" / "share" / "Paradox Interactive" / "Crusader Kings III" / "save games")
        dirs.append(home / ".paradoxinteractive" / "Crusader Kings III" / "save games")

    return dirs


def scan_for_saves() -> List[Dict]:
    """Find all CK3 save files in default locations."""
    saves = []
    seen = set()

    for save_dir in get_default_save_dirs():
        if not save_dir.exists():
            continue
        for f in save_dir.iterdir():
            if f.suffix.lower() == ".ck3" and f.name not in seen:
                seen.add(f.name)
                stat = f.stat()
                saves.append({
                    "name": f.stem,
                    "filename": f.name,
                    "path": str(f),
                    "size_mb": round(stat.st_size / (1024 * 1024), 1),
                    "modified": stat.st_mtime,
                })

    # Sort by most recently modified
    saves.sort(key=lambda s: s["modified"], reverse=True)
    return saves

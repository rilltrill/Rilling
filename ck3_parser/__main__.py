#!/usr/bin/env python3
"""
CK3 Save Parser CLI.

Usage:
    python -m ck3_parser <save_file_path> [--output <output_dir>]

Parses a CK3 save file and outputs structured JSON files for browsing.
Handles both plaintext (.ck3) and compressed (zip) saves.
"""

import json
import os
import sys
import zipfile
import io
import argparse
import time
from pathlib import Path


def load_save_text(filepath: str) -> str:
    """Load save file text, handling both zip and plaintext formats."""
    path = Path(filepath)

    if not path.exists():
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        sys.exit(1)

    # Try as zip first
    try:
        with zipfile.ZipFile(path, 'r') as zf:
            # CK3 saves in zip typically contain 'gamestate' and optionally 'meta'
            names = zf.namelist()
            print(f"  Compressed save detected. Contents: {names}")

            # Read gamestate (the main save data)
            gamestate_name = None
            for name in names:
                if 'gamestate' in name.lower():
                    gamestate_name = name
                    break

            if gamestate_name is None:
                # Just use the first/largest file
                gamestate_name = max(names, key=lambda n: zf.getinfo(n).file_size)

            print(f"  Reading: {gamestate_name}")
            with zf.open(gamestate_name) as f:
                return f.read().decode('utf-8', errors='replace')

    except zipfile.BadZipFile:
        pass  # Not a zip, try plaintext

    # Read as plaintext
    print("  Plaintext save detected.")
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def parse_save_streaming(text: str) -> dict:
    """
    Parse a CK3 save file using section-based streaming.

    For very large saves, we extract key top-level sections individually
    rather than parsing the entire file at once (which could be slow).
    """
    from .parser import ClausewitzParser, parse_clausewitz

    file_size_mb = len(text) / (1024 * 1024)
    print(f"  Save file size: {file_size_mb:.1f} MB")

    if file_size_mb < 5:
        # Small enough to parse in one go
        print("  Parsing entire file...")
        return parse_clausewitz(text)

    # For large files, extract sections by finding top-level keys
    print("  Large file detected. Using section-based parsing...")
    return parse_large_save(text)


def parse_large_save(text: str) -> dict:
    """
    For large saves, find and parse only the sections we need.
    This avoids loading the entire parsed structure into memory.
    """
    from .parser import parse_clausewitz

    # Sections we care about
    needed_sections = [
        "meta_data", "living", "dead_unpruned", "dynasties",
        "wars", "active_wars", "previous_wars",
        "landed_titles", "played_character", "player",
        "currently_played", "date", "character_database",
    ]

    result = {}

    for section_name in needed_sections:
        print(f"  Extracting section: {section_name}...")
        section_text = extract_top_level_section(text, section_name)
        if section_text is not None:
            try:
                parsed = parse_clausewitz(f"{section_name}={section_text}")
                if section_name in parsed:
                    result[section_name] = parsed[section_name]
                else:
                    result.update(parsed)
                print(f"    Found {section_name}")
            except Exception as e:
                print(f"    Warning: Failed to parse {section_name}: {e}")

    return result


def extract_top_level_section(text: str, section_name: str) -> str | None:
    """
    Extract a top-level section's content from save text.
    Finds 'section_name={...}' at the top level and returns the {...} part.
    """
    import re

    # Find the section start - must be at line start or after whitespace
    pattern = re.compile(r'(?:^|\n)\s*' + re.escape(section_name) + r'\s*=\s*', re.MULTILINE)
    match = pattern.search(text)
    if not match:
        return None

    pos = match.end()

    # Skip whitespace
    while pos < len(text) and text[pos] in ' \t\n\r':
        pos += 1

    if pos >= len(text):
        return None

    # If it's a simple value (not a block), grab until newline
    if text[pos] != '{':
        end = text.find('\n', pos)
        if end == -1:
            end = len(text)
        return text[pos:end].strip()

    # It's a block - find matching closing brace
    brace_count = 0
    start = pos
    in_quote = False
    i = pos

    while i < len(text):
        c = text[i]
        if c == '"' and (i == 0 or text[i-1] != '\\'):
            in_quote = not in_quote
        elif not in_quote:
            if c == '{':
                brace_count += 1
            elif c == '}':
                brace_count -= 1
                if brace_count == 0:
                    return text[start:i+1]
            elif c == '#':
                # Skip comment
                while i < len(text) and text[i] != '\n':
                    i += 1
                continue
        i += 1

    # If we didn't find matching brace, return what we have
    return text[start:]


def write_output(data: dict, output_dir: str):
    """Write extracted data to JSON files in the output directory."""
    os.makedirs(output_dir, exist_ok=True)

    # Write the full index
    index_path = os.path.join(output_dir, "index.json")
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump({
            "meta": data["meta"],
            "player_id": data["player_id"],
            "stats": data["stats"],
            "neighbors": data["neighbors"],
        }, f, indent=2, default=str)
    print(f"  Wrote: {index_path}")

    # Write characters (split into chunks for large saves)
    chars = data["characters"]
    chars_dir = os.path.join(output_dir, "characters")
    os.makedirs(chars_dir, exist_ok=True)

    # Write a character index (id -> name mapping)
    char_index = {}
    for cid, char in chars.items():
        name = char.get("first_name", "Unknown")
        char_index[cid] = {
            "name": name,
            "alive": char.get("alive", False),
            "birth_date": char.get("birth_date"),
            "death_date": char.get("death_date"),
            "dynasty_house": char.get("dynasty_house"),
            "titles": char.get("titles_held", [])[:3],  # First 3 titles for index
        }

    with open(os.path.join(chars_dir, "_index.json"), 'w', encoding='utf-8') as f:
        json.dump(char_index, f, indent=2, default=str)

    # Write individual character files in batches of 500
    char_items = list(chars.items())
    batch_size = 500
    for i in range(0, len(char_items), batch_size):
        batch = dict(char_items[i:i+batch_size])
        batch_file = os.path.join(chars_dir, f"batch_{i//batch_size}.json")
        with open(batch_file, 'w', encoding='utf-8') as f:
            json.dump(batch, f, indent=2, default=str)
    print(f"  Wrote: {len(chars)} characters in {(len(chars) + batch_size - 1) // batch_size} batches")

    # Write player character separately for quick access
    if data["player_id"] and data["player_id"] in chars:
        player_path = os.path.join(chars_dir, "player.json")
        with open(player_path, 'w', encoding='utf-8') as f:
            json.dump(chars[data["player_id"]], f, indent=2, default=str)
        print(f"  Wrote: player character ({data['player_id']})")

    # Write dynasties
    dyn_path = os.path.join(output_dir, "dynasties.json")
    with open(dyn_path, 'w', encoding='utf-8') as f:
        json.dump(data["dynasties"], f, indent=2, default=str)
    print(f"  Wrote: {len(data['dynasties'])} dynasties")

    # Write wars
    wars_path = os.path.join(output_dir, "wars.json")
    with open(wars_path, 'w', encoding='utf-8') as f:
        json.dump(data["wars"], f, indent=2, default=str)
    print(f"  Wrote: {len(data['wars'])} wars")

    # Write titles
    titles = data["titles"]
    titles_dir = os.path.join(output_dir, "titles")
    os.makedirs(titles_dir, exist_ok=True)

    # Title index
    title_index = {}
    for tid, title in titles.items():
        title_index[tid] = {
            "key": title.get("key", tid),
            "name": title.get("name", tid),
            "tier": title.get("tier", "unknown"),
            "holder": title.get("holder"),
        }

    with open(os.path.join(titles_dir, "_index.json"), 'w', encoding='utf-8') as f:
        json.dump(title_index, f, indent=2, default=str)

    # Write title data in batches
    title_items = list(titles.items())
    for i in range(0, len(title_items), batch_size):
        batch = dict(title_items[i:i+batch_size])
        batch_file = os.path.join(titles_dir, f"batch_{i//batch_size}.json")
        with open(batch_file, 'w', encoding='utf-8') as f:
            json.dump(batch, f, indent=2, default=str)
    print(f"  Wrote: {len(titles)} titles")


def main():
    parser = argparse.ArgumentParser(description="Parse CK3 save files into browsable JSON")
    parser.add_argument("save_file", help="Path to the CK3 save file (.ck3)")
    parser.add_argument("--output", "-o", default=None,
                        help="Output directory (default: <save_name>_parsed/)")
    args = parser.parse_args()

    save_path = os.path.abspath(args.save_file)
    if args.output:
        output_dir = os.path.abspath(args.output)
    else:
        base = os.path.splitext(os.path.basename(save_path))[0]
        output_dir = os.path.join(os.path.dirname(save_path), f"{base}_parsed")

    print(f"CK3 Save Parser")
    print(f"{'='*60}")
    print(f"Input:  {save_path}")
    print(f"Output: {output_dir}")
    print()

    # Step 1: Load save file
    print("[1/3] Loading save file...")
    t0 = time.time()
    text = load_save_text(save_path)
    print(f"  Loaded in {time.time()-t0:.1f}s")
    print()

    # Step 2: Parse
    print("[2/3] Parsing Clausewitz format...")
    t0 = time.time()
    save_data = parse_save_streaming(text)
    print(f"  Parsed in {time.time()-t0:.1f}s")
    print()

    # Step 3: Extract entities
    print("[3/3] Extracting game entities...")
    t0 = time.time()
    from .extractor import CK3Extractor
    extractor = CK3Extractor(save_data)
    extracted = extractor.extract_all()
    print(f"  Extracted in {time.time()-t0:.1f}s")
    print()

    # Write output
    print("Writing output files...")
    write_output(extracted, output_dir)

    print()
    print(f"{'='*60}")
    print(f"Done! Save data written to: {output_dir}")
    print()
    print(f"Summary:")
    stats = extracted["stats"]
    print(f"  Characters: {stats['total_characters']} ({stats['living_characters']} living, {stats['dead_characters']} dead)")
    print(f"  Wars:       {stats['total_wars']} ({stats['active_wars']} active)")
    print(f"  Titles:     {stats['total_titles']}")
    print(f"  Dynasties:  {stats['total_dynasties']}")
    if extracted["player_id"]:
        pc = extracted["characters"].get(extracted["player_id"], {})
        print(f"  Player:     {pc.get('first_name', 'Unknown')} (ID: {extracted['player_id']})")

    # Print the output directory path for the skill to pick up
    print(f"\nOUTPUT_DIR={output_dir}")


if __name__ == "__main__":
    main()

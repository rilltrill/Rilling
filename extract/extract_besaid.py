#!/usr/bin/env python3
"""Extract Besaid assets from a local FFX HD Remaster (Steam) install.

Pipeline:
  1. Drive YojimboVBFTool to unpack FFX_Data.vbf into a scratch dir.
  2. Locate Besaid field files by name prefix (bsil*, bsyt*) and copy them
     to a staging dir.
  3. Drive Noesis headlessly with noesis_besaid_export.py to convert
     proprietary meshes/textures into a single USDZ + PNG set.
  4. Convert the Besaid BGM .scd via vgmstream-cli → AAC (.m4a).

Outputs land in <out>/ with a stable layout the screensaver expects:
    <out>/besaid.usdz
    <out>/besaid.m4a      (optional)
    <out>/skybox/*.png    (optional)
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

FIELD_PREFIXES = ("bsil", "bsyt")
BGM_CANDIDATES = ("music013.scd", "music_besaid.scd", "bgm_besaid.scd")


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def find_vbf(ffx_dir: Path) -> Path:
    for name in ("FFX_Data.vbf", "ffx_data.vbf"):
        candidate = ffx_dir / name
        if candidate.is_file():
            return candidate
    hits = list(ffx_dir.rglob("*.vbf"))
    if not hits:
        die(f"no .vbf archive found under {ffx_dir}")
    return hits[0]


def unpack_vbf(vbf: Path, scratch: Path) -> None:
    if scratch.exists() and any(scratch.iterdir()):
        print(f"[skip] scratch dir non-empty: {scratch}")
        return
    scratch.mkdir(parents=True, exist_ok=True)
    tool = shutil.which("YojimboVBFTool") or shutil.which("yojimbo-vbf")
    if not tool:
        die("YojimboVBFTool not on PATH — see README setup")
    print(f"[vbf ] unpacking {vbf.name} → {scratch}")
    subprocess.check_call([tool, "extract", str(vbf), str(scratch)])


def stage_besaid(scratch: Path, staging: Path) -> list[Path]:
    staging.mkdir(parents=True, exist_ok=True)
    copied: list[Path] = []
    for path in scratch.rglob("*"):
        if not path.is_file():
            continue
        name = path.name.lower()
        if any(name.startswith(p) for p in FIELD_PREFIXES):
            dest = staging / path.name
            if not dest.exists():
                shutil.copy2(path, dest)
            copied.append(dest)
    print(f"[stage] copied {len(copied)} Besaid field files → {staging}")
    if not copied:
        die("no files matched bsil*/bsyt* — check --ffx-dir and VBF unpack")
    return copied


def run_noesis(noesis_app: Path, staging: Path, out: Path) -> None:
    script = Path(__file__).with_name("noesis_besaid_export.py")
    if not script.is_file():
        die(f"missing {script}")
    binary = noesis_app / "Contents" / "MacOS" / "Noesis"
    if not binary.is_file():
        die(f"Noesis binary not found at {binary}")
    out.mkdir(parents=True, exist_ok=True)
    usdz_out = out / "besaid.usdz"
    print(f"[mesh] Noesis → {usdz_out}")
    subprocess.check_call([
        str(binary),
        "?cmode",
        str(staging),
        str(usdz_out),
        "-rpgoptimize",
        "-script", str(script),
    ])


def convert_audio(scratch: Path, out: Path) -> None:
    vgm = shutil.which("vgmstream-cli") or shutil.which("vgmstream_cli")
    if not vgm:
        print("[audio] vgmstream-cli not installed — skipping BGM")
        return
    for candidate in BGM_CANDIDATES:
        hits = list(scratch.rglob(candidate))
        if hits:
            src = hits[0]
            break
    else:
        print(f"[audio] no BGM match in {BGM_CANDIDATES} — skipping")
        return
    wav = out / "besaid.wav"
    m4a = out / "besaid.m4a"
    print(f"[audio] {src.name} → {m4a.name}")
    subprocess.check_call([vgm, "-o", str(wav), str(src)])
    subprocess.check_call([
        "afconvert", "-f", "m4af", "-d", "aac", "-b", "192000",
        str(wav), str(m4a),
    ])
    wav.unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ffx-dir", required=True, type=Path,
                    help="Steam install of FFX HD Remaster")
    ap.add_argument("--noesis", required=True, type=Path,
                    help="Path to Noesis.app")
    ap.add_argument("--out", default=Path("./assets"), type=Path)
    ap.add_argument("--scratch", default=Path("./extract/scratch"), type=Path)
    ap.add_argument("--staging", default=Path("./extract/staging"), type=Path)
    ap.add_argument("--skip-audio", action="store_true")
    args = ap.parse_args()

    if not args.ffx_dir.is_dir():
        die(f"--ffx-dir does not exist: {args.ffx_dir}")

    vbf = find_vbf(args.ffx_dir)
    unpack_vbf(vbf, args.scratch)
    stage_besaid(args.scratch, args.staging)
    run_noesis(args.noesis, args.staging, args.out)
    if not args.skip_audio:
        convert_audio(args.scratch, args.out)
    print(f"[done] assets in {args.out}")


if __name__ == "__main__":
    main()

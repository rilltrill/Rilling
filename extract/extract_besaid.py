#!/usr/bin/env python3
"""Extract Besaid assets from a local FFX PS2 ISO.

Pipeline:
  1. 7z extracts the ISO9660 contents → scratch/iso (FFX.IMG, FFX.BIN, etc).
  2. Drive Noesis with noesis_besaid_export.py against FFX.IMG; the script
     uses the FFX-PS2 plugin (fmt_ffx_ps2.py / fmt_ffx_psx.py) to enumerate
     the archive, pick out bsil*/bsyt* field meshes + TIM2 textures, and
     emit a single USDZ + PNG set into <out>/.
  3. vgmstream-cli converts the Besaid BGM (.akb / .scd) → AAC (.m4a).

Region-agnostic: NTSC-U, NTSC-J, PAL, and International all use the same
field-code prefixes (bsil, bsyt). Audio file paths differ slightly per
region; we glob by canonical name and fall back to track-15 numbering.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

FIELD_PREFIXES = ("bsil", "bsyt")
BGM_GLOBS = (
    "**/bgm015.*", "**/bgm_015.*", "**/m015.*",
    "**/song015.*", "**/besaid*.akb", "**/besaid*.scd",
)


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def extract_iso(iso: Path, scratch: Path) -> Path:
    iso_dir = scratch / "iso"
    if iso_dir.exists() and any(iso_dir.iterdir()):
        print(f"[skip] iso already extracted: {iso_dir}")
        return iso_dir
    sevenz = shutil.which("7z") or shutil.which("7zz")
    if not sevenz:
        die("install p7zip: `brew install p7zip`")
    iso_dir.mkdir(parents=True, exist_ok=True)
    print(f"[iso ] extracting {iso.name} → {iso_dir}")
    subprocess.check_call([sevenz, "x", "-y", f"-o{iso_dir}", str(iso)])
    return iso_dir


def find_archive(iso_dir: Path) -> tuple[Path, Path]:
    candidates_img = list(iso_dir.rglob("FFX.IMG")) + list(iso_dir.rglob("ffx.img"))
    candidates_bin = list(iso_dir.rglob("FFX.BIN")) + list(iso_dir.rglob("ffx.bin"))
    if not candidates_img or not candidates_bin:
        die(f"FFX.IMG / FFX.BIN not found under {iso_dir} — wrong ISO?")
    return candidates_img[0], candidates_bin[0]


def run_noesis(noesis_app: Path, img: Path, bin_: Path, out: Path) -> None:
    script = Path(__file__).with_name("noesis_besaid_export.py")
    if not script.is_file():
        die(f"missing {script}")
    binary = noesis_app / "Contents" / "MacOS" / "Noesis"
    if not binary.is_file():
        die(f"Noesis binary not found at {binary}")
    out.mkdir(parents=True, exist_ok=True)
    usdz = out / "besaid.usdz"
    print(f"[mesh] Noesis (PS2 plugin) → {usdz}")
    # The Noesis script reads source paths from getOpenArgv(); we pass
    # FFX.IMG as the input and the desired USDZ output. FFX.BIN must sit
    # alongside FFX.IMG, which is the on-disc layout 7z preserves.
    subprocess.check_call([
        str(binary),
        "?cmode",
        str(img),
        str(usdz),
        "-rpgoptimize",
        "-script", str(script),
    ])


def convert_audio(iso_dir: Path, out: Path) -> None:
    vgm = shutil.which("vgmstream-cli") or shutil.which("vgmstream_cli")
    if not vgm:
        print("[audio] vgmstream-cli not installed — skipping BGM")
        return
    src: Path | None = None
    for pattern in BGM_GLOBS:
        hits = list(iso_dir.glob(pattern))
        if hits:
            src = hits[0]
            break
    if src is None:
        print(f"[audio] no BGM match in ISO — try extracting bgm/ from FFX.IMG")
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
    ap.add_argument("--iso", required=True, type=Path,
                    help="Path to FFX PS2 .iso")
    ap.add_argument("--noesis", required=True, type=Path,
                    help="Path to Noesis.app")
    ap.add_argument("--out", default=Path("./assets"), type=Path)
    ap.add_argument("--scratch", default=Path("./extract/scratch"), type=Path)
    ap.add_argument("--skip-audio", action="store_true")
    args = ap.parse_args()

    if not args.iso.is_file():
        die(f"--iso not a file: {args.iso}")

    iso_dir = extract_iso(args.iso, args.scratch)
    img, bin_ = find_archive(iso_dir)
    run_noesis(args.noesis, img, bin_, args.out)
    if not args.skip_audio:
        convert_audio(iso_dir, args.out)
    print(f"[done] assets in {args.out}")


if __name__ == "__main__":
    main()

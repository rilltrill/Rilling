# Besaid Screensaver (macOS)

A personal-use macOS screensaver that drifts a slow camera over the island of
Besaid from Final Fantasy X, with animated Gerstner-wave ocean, Fresnel sky
reflection, shore foam, drifting clouds, and an optional "Besaid Island" BGM
track.

> **Personal use only.** This repo contains no game assets. You supply your own
> legally-owned copy of *Final Fantasy X / X-2 HD Remaster* (Steam), run the
> extraction pipeline locally, and the resulting asset bundle stays on your
> machine. Do not redistribute.

## Layout

```
extract/      # Python pipeline: VBF unpack → Besaid meshes/textures/audio
screensaver/  # Swift + Metal .saver bundle
assets/       # (gitignored) extracted assets loaded at runtime
```

## One-time setup

Install external tools (all free):

```sh
brew install python@3.12 vgmstream
# Noesis: download from https://richwhitehouse.com/index.php?content=inc_projects.php
#   — place Noesis.app anywhere; the extractor calls it headlessly.
# YojimboVBFTool: https://forums.qhimm.com/index.php?topic=17299.0
#   — a small C# CLI for unpacking FFX_Data.vbf. Place the binary on your PATH.
```

Then from the repo root:

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r extract/requirements.txt
```

## Extract Besaid assets

Point the extractor at your Steam install:

```sh
python extract/extract_besaid.py \
    --ffx-dir "$HOME/Library/Application Support/Steam/steamapps/common/FINAL FANTASY FFX&FFX-2 HD Remaster" \
    --noesis /Applications/Noesis.app \
    --out ./assets
```

This will:
1. Unpack `FFX_Data.vbf` to a scratch dir.
2. Locate Besaid field data (`bsil*`, `bsyt*`) and copy to staging.
3. Drive Noesis to convert meshes + textures → `assets/besaid.usdz` + PNGs.
4. Convert the Besaid BGM (`music013.scd`) → `assets/besaid.m4a` via vgmstream.

The screensaver reads from `~/Library/Application Support/BesaidScreensaver/`
at runtime. The install step below copies `./assets` there.

## Build & install the screensaver

```sh
cd screensaver
./build.sh          # produces BesaidScreensaver.saver
./install.sh        # copies .saver + assets to ~/Library/
```

Then open **System Settings → Screen Saver → Besaid** and pick it. The
configure sheet lets you toggle audio and choose time-of-day (sunset / noon /
night).

## Known caveats

- **Audio in fullscreen mode.** macOS runs screensavers in a sandboxed
  `legacyScreenSaver` process that blocks audio on some OS versions. BGM is
  reliable in the System Settings preview panel; in fullscreen it may be muted
  depending on your macOS version. The toggle is still honored when it works.
- **Metal only.** Requires Apple Silicon or an Intel Mac with a Metal-capable
  GPU (2012+). Built for `arm64-apple-macos12.0` by default — adjust the
  target triple in `build.sh` for Intel.
- **First frame can be slow.** Loading `besaid.usdz` through ModelIO on cold
  start can take a second or two; the procedural water/sky draws immediately.

## Graceful degradation

If `assets/` is empty or missing the terrain mesh, the screensaver falls back
to a procedural ocean + sky + silhouette cone. You'll see something running
immediately after `./install.sh`; rerun extraction later to enrich it.

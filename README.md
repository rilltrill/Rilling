# Besaid Screensaver (macOS)

A personal-use macOS screensaver that drifts a slow camera over the island of
Besaid from Final Fantasy X, with animated Gerstner-wave ocean, Fresnel sky
reflection, shore foam, drifting clouds, and an optional "Besaid Island" BGM
track.

> **Personal use only.** This repo contains no game assets. You supply your own
> legally-owned copy of *Final Fantasy X* (PS2 ISO — NTSC-U / NTSC-J / PAL /
> International all work), run the extraction pipeline locally, and the
> resulting asset bundle stays on your machine. Do not redistribute.

## Layout

```
extract/      # Python pipeline: ISO → FFX.IMG → Besaid meshes/textures/audio
screensaver/  # Swift + Metal .saver bundle
assets/       # (gitignored) extracted assets loaded at runtime
```

## One-time setup

Install external tools (all free):

```sh
brew install python@3.12 vgmstream p7zip
# Noesis: https://richwhitehouse.com/index.php?content=inc_projects.php
#   — place Noesis.app anywhere; the extractor calls it headlessly.
# Noesis FFX-PS2 plugin: drop fmt_ffx_ps2.py (or fmt_ffx_psx.py from the
#   community fork at https://github.com/SquallFromFFVIII/Noesis-FFX) into
#   Noesis.app/Contents/Resources/plugins/python/.
```

Then from the repo root:

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r extract/requirements.txt
```

## Extract Besaid assets

Point the extractor at your PS2 ISO:

```sh
python extract/extract_besaid.py \
    --iso "/path/to/FFX.iso" \
    --noesis /Applications/Noesis.app \
    --out ./assets
```

This will:
1. `7z` extracts the ISO9660 filesystem into a scratch dir.
2. Locates `FFX.IMG` + `FFX.BIN` (the bundled disc archive).
3. Drives Noesis with the FFX-PS2 plugin to enumerate the archive,
   pick out Besaid field meshes (`bsil*`, `bsyt*`) and TIM2 textures,
   and write a single `assets/besaid.usdz` + PNGs.
4. vgmstream converts the Besaid BGM (`bgm015.akb` or equivalent) →
   `assets/besaid.m4a`.

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
- **PS2-era assets.** Field textures top out at 256×256 and meshes are low-poly
  (~5–15k tris per field) — the island will look 2001-vintage. The Metal water
  + sky run at modern fidelity on top, so the overall scene still pops, but
  don't expect HD Remaster-quality terrain.

## Graceful degradation

If `assets/` is empty or missing the terrain mesh, the screensaver falls back
to a procedural ocean + sky + silhouette cone. You'll see something running
immediately after `./install.sh`; rerun extraction later to enrich it.

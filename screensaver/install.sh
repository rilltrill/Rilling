#!/bin/bash
# Copy the built .saver into ~/Library/Screen Savers and the asset bundle
# into ~/Library/Application Support/BesaidScreensaver.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
BUNDLE="$HERE/build/BesaidScreensaver.saver"
SAVERS="$HOME/Library/Screen Savers"
SUPPORT="$HOME/Library/Application Support/BesaidScreensaver"

if [[ ! -d "$BUNDLE" ]]; then
    echo "error: run ./build.sh first" >&2
    exit 1
fi

mkdir -p "$SAVERS" "$SUPPORT"
rm -rf "$SAVERS/BesaidScreensaver.saver"
cp -R "$BUNDLE" "$SAVERS/"

if [[ -d "$REPO/assets" ]]; then
    rsync -a --delete "$REPO/assets/" "$SUPPORT/"
    echo "copied assets → $SUPPORT"
else
    echo "note: $REPO/assets missing — screensaver will use procedural fallback"
fi

echo "installed. Open System Settings → Screen Saver → Besaid."

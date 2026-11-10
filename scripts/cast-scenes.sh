#!/bin/sh
# PIXEL CAST 2 look-dev: the four in-scene comparisons (every cast look on the same frozen
# instant), as 288-line art frames (every art pixel 3 x 3, no CRT) and as the phone view (CRT).
#   sh scripts/cast-scenes.sh [base-url] [out-dir] [art|phone|both]
BASE=${1:-http://localhost:5802}
OUT=${2:-/tmp/pw2/castlook/scene}
WHAT=${3:-both}
mkdir -p "$OUT"
for sh in z1-street:z1:14:900 z2-ward:z2:13:240 d1-raptors:d1:6:240 z1-boss:z1:25:900; do
  name=$(echo $sh | cut -d: -f1)
  shot=$(echo $sh | cut -d: -f2-)
  if [ "$WHAT" != phone ]; then
    node scripts/cast-look.mjs --base "$BASE" --out "$OUT/$name-art" --shot "$shot" --art pixel --frames --notiles --vw 624 --vh 288 --dsf 3 --retro pixel | tail -1 | cut -c1-200
    python3 scripts/cast-sheet.py "$OUT/$name-art" "$name  -  art frame (288 lines, x3)"
  fi
  if [ "$WHAT" != art ]; then
    node scripts/cast-look.mjs --base "$BASE" --out "$OUT/$name-phone" --shot "$shot" --art pixel --frames --notiles --vw 844 --vh 390 --dsf 2 --retro crt | tail -1 | cut -c1-200
    python3 scripts/cast-sheet.py "$OUT/$name-phone" "$name  -  phone view (CRT)"
  fi
done

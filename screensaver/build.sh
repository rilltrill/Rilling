#!/bin/bash
# Assemble BesaidScreensaver.saver without needing an .xcodeproj.
# Compiles Swift sources into a dylib, bundles with Info.plist + metallib.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$HERE/build"
BUNDLE="$BUILD/BesaidScreensaver.saver"
MODULE=BesaidScreensaver
SDK="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "$BUILD"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"

# --- Metal shaders → default.metallib ---
METAL_AIR="$BUILD/shaders.air"
METALLIB="$BUNDLE/Contents/Resources/default.metallib"
xcrun -sdk macosx metal -c \
    "$HERE/Shaders/Shaders.metal" \
    -o "$METAL_AIR"
xcrun -sdk macosx metallib "$METAL_AIR" -o "$METALLIB"

# --- Swift sources → dylib executable ---
SWIFT_SRCS=(
    "$HERE/Sources/BesaidScreensaverView.swift"
    "$HERE/Sources/Renderer.swift"
    "$HERE/Sources/Scene.swift"
    "$HERE/Sources/CameraPath.swift"
    "$HERE/Sources/AudioController.swift"
    "$HERE/Sources/Preferences.swift"
    "$HERE/Sources/ConfigureSheet.swift"
    "$HERE/Sources/ShaderTypes.swift"
)

xcrun -sdk macosx swiftc \
    -module-name "$MODULE" \
    -emit-library -emit-module \
    -target arm64-apple-macos12.0 \
    -framework ScreenSaver \
    -framework AppKit \
    -framework Metal \
    -framework MetalKit \
    -framework AVFoundation \
    -framework ModelIO \
    -framework simd \
    -O \
    -o "$BUNDLE/Contents/MacOS/BesaidScreensaver" \
    "${SWIFT_SRCS[@]}"

cp "$HERE/Resources/Info.plist" "$BUNDLE/Contents/Info.plist"

echo "built $BUNDLE"

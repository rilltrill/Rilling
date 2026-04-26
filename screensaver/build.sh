#!/bin/bash
# Assemble BesaidScreensaver.saver without needing an .xcodeproj or full Xcode.
# Shaders are compiled at runtime from source (no `metal` toolchain required —
# only macOS Command Line Tools).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$HERE/build"
BUNDLE="$BUILD/BesaidScreensaver.saver"
MODULE=BesaidScreensaver

rm -rf "$BUILD"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"

# Shaders shipped as source — Renderer compiles via makeLibrary(source:)
cp "$HERE/Shaders/Shaders.metal" "$BUNDLE/Contents/Resources/Shaders.metal"

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

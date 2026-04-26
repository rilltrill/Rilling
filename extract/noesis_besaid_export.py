"""Noesis batch script: pull Besaid field meshes from FFX PS2's FFX.IMG
archive and export them as a single USDZ + PNG textures.

Invoked by extract_besaid.py. Requires Noesis' FFX-PS2 plugin to be
installed in Noesis/plugins/python/ (community plugin — names vary across
forks: fmt_ffx_ps2.py, fmt_ffx_psx.py, fmt_ffx_field.py). The script
loops the archive's virtual file list, keeps entries whose name starts
with bsil/bsyt, accumulates their meshes, and writes a single USDZ.
"""
from inc_noesis import *
import os

FIELD_PREFIXES = ("bsil", "bsyt")


def registerNoesisTypes():
    return 1


def _argv():
    return noesis.getOpenArgv() if hasattr(noesis, "getOpenArgv") else []


def _img_path():
    a = _argv()
    return a[0] if a else None


def _out_path():
    a = _argv()
    return a[1] if len(a) > 1 else "besaid.usdz"


def _enumerate_archive(img_path):
    """Ask the FFX-PS2 plugin to enumerate FFX.IMG into (name, blob) pairs.

    The plugin exposes either `ffxFieldGetEntries(path)` or registers a
    pseudo-archive type loadable via rapi.loadIntoByteArray. We try both."""
    if hasattr(rapi, "callExtensionMethod"):
        try:
            entries = rapi.callExtensionMethod("ffxImgList", img_path)
            if entries:
                return entries
        except Exception:
            pass
    # Fallback: ask the plugin to mount the archive and list children
    try:
        return noesis.instantiateFFXImg(img_path)  # provided by some forks
    except Exception:
        return []


def run():
    img = _img_path()
    out = _out_path()
    if not img or not os.path.isfile(img):
        print(f"[noesis] no FFX.IMG at {img}")
        return 0

    entries = _enumerate_archive(img)
    if not entries:
        print("[noesis] FFX-PS2 plugin not detected — install fmt_ffx_ps2.py "
              "into Noesis/plugins/python and re-run.")
        return 0

    meshes = []
    for name, blob in entries:
        lname = name.lower()
        if not any(lname.startswith(p) for p in FIELD_PREFIXES):
            continue
        try:
            mdl = rapi.callExtensionMethod("loadModel", blob, name)
        except Exception as e:
            print(f"[skip] {name}: {e}")
            continue
        if mdl is None:
            continue
        meshes.extend(mdl.meshes if hasattr(mdl, "meshes") else [])

    if not meshes:
        print("[noesis] no Besaid meshes loaded — scene will fall back to procedural")
        return 0

    merged = NoeModel(meshes)
    rapi.rpgClearBufferBinds()
    noesis.saveModel(out, merged)
    print(f"[noesis] wrote {out} ({len(meshes)} meshes)")
    return 1


run()

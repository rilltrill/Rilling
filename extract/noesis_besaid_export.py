"""Noesis batch script: convert FFX HD field meshes in a staging dir to USDZ.

Invoked by extract_besaid.py. Relies on the community FFX HD plugin for
Noesis (fmt_ffx_hd.py or equivalent) already being installed in Noesis'
plugins dir. We iterate every .smdl-like file in the staging dir, load it,
merge into one scene, and export as USDZ.
"""
from inc_noesis import *
import os


def registerNoesisTypes():
    return 1


def _stage_dir():
    argv = noesis.getOpenArgv() if hasattr(noesis, "getOpenArgv") else []
    return argv[0] if argv else os.getcwd()


def _out_path():
    argv = noesis.getOpenArgv() if hasattr(noesis, "getOpenArgv") else []
    return argv[1] if len(argv) > 1 else "besaid.usdz"


def run():
    stage = _stage_dir()
    out = _out_path()
    meshes = []
    for name in sorted(os.listdir(stage)):
        path = os.path.join(stage, name)
        if not os.path.isfile(path):
            continue
        data = rapi.loadIntoByteArray(path)
        try:
            mdl = rapi.callExtensionMethod("loadModel", data, path)
        except Exception as e:
            print(f"[skip] {name}: {e}")
            continue
        if mdl is None:
            continue
        meshes.extend(mdl.meshes if hasattr(mdl, "meshes") else [])

    if not meshes:
        print("[noesis] no meshes loaded — Besaid scene will be empty")
        return 0

    merged = NoeModel(meshes)
    rapi.rpgClearBufferBinds()
    noesis.saveModel(out, merged)
    print(f"[noesis] wrote {out}")
    return 1


run()

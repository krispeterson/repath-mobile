#!/usr/bin/env python3
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = ROOT.parent / "repath-model" / "scripts" / "benchmark_model.py"
FALLBACK = ROOT / "ml" / "eval" / "benchmark-model.py"

target = PRIMARY if PRIMARY.exists() else FALLBACK
runpy.run_path(str(target), run_name="__main__")

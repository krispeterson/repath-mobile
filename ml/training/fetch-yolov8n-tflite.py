#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    target = (repo_root / ".." / "repath-model" / "scripts" / "training" / "fetch_yolov8n_tflite.py").resolve()
    result = subprocess.run([sys.executable, str(target), *sys.argv[1:]], check=False)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()

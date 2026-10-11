#!/usr/bin/env python3
"""Keep the original presentation command while implementation lives together."""
from pathlib import Path
import runpy


if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parents[1] / "presentation/build_slides.py"),
                  run_name="__main__")

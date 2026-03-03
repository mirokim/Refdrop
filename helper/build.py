#!/usr/bin/env python3
"""
Build script: produces a single-file executable via PyInstaller.
Run from the helper/ directory:
    python build.py
"""

import subprocess
import sys
import platform

SYSTEM = platform.system()
EXE_NAME = "refdrop_helper"

args = [
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--noconsole",
    "--name", EXE_NAME,
    "refdrop_helper.py",
]

if SYSTEM == "Windows":
    args += ["--hidden-import", "win32clipboard",
             "--hidden-import", "win32gui",
             "--hidden-import", "win32api",
             "--hidden-import", "win32con"]

subprocess.run(args, check=True)
print(f"\nBuild complete: dist/{EXE_NAME}" + (".exe" if SYSTEM == "Windows" else ""))

#!/usr/bin/env python3
"""Backward-compatible wrapper for the generic Mermaid icon injector."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    target = Path(__file__).with_name("inject-mermaid-icons.py")
    result = subprocess.run([sys.executable, str(target), *sys.argv[1:]])
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())

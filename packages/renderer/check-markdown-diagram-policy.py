#!/usr/bin/env python3
"""Validate the repository Markdown display policy for generated Mermaid diagrams.

Current policy:
- show Mermaid source as a ```mermaid fenced block;
- keep generated .mmd/.svg/.jpg artifacts as links;
- do not embed mmd-backed SVGs with image syntax.

The checker intentionally flags only generated Mermaid SVG embeds, identified by a
neighboring .mmd file with the same basename. Other SVG images, such as external
logos or non-Mermaid assets, are ignored.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = Path.cwd()
MMD_FENCE_BLOCK = re.compile(r"```mmd\s*\n", re.IGNORECASE)
SVG_IMAGE_EMBED = re.compile(r"!\[[^\]]*\]\(([^)]+?\.svg)\)", re.IGNORECASE)


def iter_markdown(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_file() and path.suffix.lower() == ".md":
            files.append(path)
        elif path.is_dir():
            files.extend(sorted(path.rglob("*.md")))
        else:
            raise FileNotFoundError(path)
    return files


def check_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    issues: list[str] = []
    if MMD_FENCE_BLOCK.search(text):
        issues.append("uses a ```mmd block; the correct repository default is a ```mermaid block.")
    for raw in SVG_IMAGE_EMBED.findall(text):
        if raw.startswith(("http://", "https://")):
            continue
        clean = raw.split("#", 1)[0].split("?", 1)[0]
        svg_path = (path.parent / clean).resolve()
        if svg_path.with_suffix(".mmd").exists():
            issues.append(
                f"embedded Mermaid diagram SVG found: {raw}; use .mmd/.svg/.jpg links and a mermaid block."
            )
    return issues


def main(argv: list[str]) -> int:
    paths = [Path(arg) for arg in argv] if argv else [DEFAULT_ROOT]
    all_issues: list[tuple[Path, str]] = []
    for md in iter_markdown(paths):
        for issue in check_file(md):
            all_issues.append((md, issue))
    if not all_issues:
        print("OK — Markdown follows the Mermaid policy: mermaid block and SVG/JPEG as links.")
        return 0
    for md, issue in all_issues:
        try:
            rel = md.relative_to(CWD_ROOT)
        except ValueError:
            rel = md
        print(f"{rel}: {issue}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

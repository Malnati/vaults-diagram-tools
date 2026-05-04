#!/usr/bin/env python3
"""Inject Mermaid local icon SVG paths into rendered Mermaid outputs.

Supports tokens such as `fa:fa-user`, `logos:aws-lambda`, `lucide:rocket`.
The parser is resilient by default (unknown tokens are kept as text), and can run
in strict mode to fail when unknown icons remain unresolved.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import OrderedDict
from pathlib import Path
from typing import Iterable

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

NS = {"svg": SVG_NS}

CONTEXT_LAYOUT = {
    "actor": {
        "x_gap": 14.0,
        "y_adjust": 0.0,
        "y_font_factor": 0.0,
        "font_scale": 1.0,
        "icon_size": 14.0,
    },
    "message": {
        "x_gap": 12.0,
        "y_adjust": 0.0,
        "y_font_factor": 0.12,
        "font_scale": 0.95,
        "icon_size": 14.0,
    },
    "generic": {
        "x_gap": 14.0,
        "y_adjust": 0.0,
        "y_font_factor": 0.04,
        "font_scale": 0.95,
        "icon_size": 13.5,
    },
}


def q(tag: str) -> str:
    return f"{{{SVG_NS}}}{tag}"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_float(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    return float(match.group(0)) if match else default


def parse_font_size(node: ET.Element, default: float = 16.0) -> float:
    style = node.get("style", "")
    match = re.search(r"font-size:\s*([0-9]+(?:\.[0-9]+)?)px", style)
    return float(match.group(1)) if match else default


def parse_style_map(node: ET.Element) -> dict[str, str]:
    style = (node.get("style") or "").strip()
    if not style:
        return {}
    props: dict[str, str] = {}
    for chunk in style.split(";"):
        if not chunk.strip() or ":" not in chunk:
            continue
        key, value = chunk.split(":", 1)
        props[key.strip().lower()] = value.strip()
    return props


def iter_prefixes_from_icon_map(icon_map: dict[str, dict]) -> list[str]:
    prefixes = {token.split(":", 1)[0].lower() for token in icon_map}
    return sorted(prefixes)


def compile_token_re(prefixes: list[str]) -> re.Pattern[str]:
    if not prefixes:
        # Keep behavior safe if called without prefixes.
        return re.compile(r"(?!)")
    pattern = r"^\s*(?P<prefix>" + "|".join(re.escape(prefix) for prefix in prefixes) + r")\s*:\s*(?P<name>[A-Za-z0-9_-]+)(?:\s+|$)"
    return re.compile(pattern, re.IGNORECASE)


def normalize_token(prefix: str, name: str, token_re: re.Pattern[str] | None = None) -> str:
    return f"{prefix.lower()}:{name.lower()}"


def extract_leading_token(text: str, token_re: re.Pattern[str]) -> tuple[str, str] | None:
    if not text:
        return None
    match = token_re.match(text)
    if not match:
        return None

    token = normalize_token(match.group("prefix"), match.group("name"))
    rest = text[match.end() :].lstrip()
    return rest, token


def effective_text_node(node: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> ET.Element:
    if local_name(node.tag) == "text":
        return node
    return parent_map.get(node, node)


def text_value(node: ET.Element) -> str:
    return node.text or ""


def set_text_value(node: ET.Element, value: str) -> None:
    node.text = value


def estimate_text_width(text: str, font_size: float = 16.0) -> float:
    # Conservative estimate for Mermaid rendered fonts.
    avg_char_ratio = 0.58
    return max(24.0, min(560.0, len(text) * font_size * avg_char_ratio))


def estimate_icon_size(icon: dict, size: float = 14.0) -> tuple[float, float]:
    width = float(icon.get("width") or 512)
    height = float(icon.get("height") or 512)
    return size * (height / max(width, height)), size * (width / max(width, height))


def load_icon_children(icon: dict) -> list[ET.Element]:
    wrapper = ET.fromstring(f"<g xmlns='{SVG_NS}'>{icon['body']}</g>")
    children: list[ET.Element] = []
    for child in list(wrapper):
        clone = copy.deepcopy(child)
        for elem in clone.iter():
            if elem.get("fill") == "currentColor":
                elem.set("fill", "#333333")
            if elem.get("stroke") == "currentColor":
                elem.set("stroke", "#333333")
        children.append(clone)
    return children


def make_icon_group(prefix: str, token: str, icon: dict, x: float, y: float, size: float = 14.0) -> ET.Element:
    width = float(icon.get("width") or 512)
    height = float(icon.get("height") or 512)
    scale = size / max(width, height)

    group = ET.Element(
        q("g"),
        {
            "class": "mermaid-icon",
            "data-mermaid-icon-prefix": prefix,
            "data-mermaid-icon-token": token,
            "data-mermaid-icon-name": icon.get("name", token),
            "transform": f"translate({x:.2f} {y:.2f}) scale({scale:.6f})",
            "aria-hidden": "true",
        },
    )
    # Keep compatibility with downstream checks made before this refactor.
    if prefix == "fa":
        group.set("data-fa-token", token)
        group.set("data-fa-icon", icon.get("name", token))
        group.set("class", "mermaid-icon fa-icon")

    for child in load_icon_children(icon):
        group.append(child)
    return group


def iter_text_candidates(root: ET.Element, token_re: re.Pattern[str]) -> Iterable[ET.Element]:
    for node in root.iter():
        if local_name(node.tag) in {"text", "tspan"} and extract_leading_token(text_value(node), token_re):
            yield node


def detect_context(text_node: ET.Element) -> str:
    classes = text_node.get("class", "")
    if "messageText" in classes:
        return "message"
    if "actor" in classes:
        return "actor"
    return "generic"


def icon_position(
    node: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    token: str,
    rest: str,
    icon: dict,
) -> tuple[float, float]:
    text_node = effective_text_node(node, parent_map)
    x = parse_float(node.get("x"), parse_float(text_node.get("x")))
    y = parse_float(text_node.get("y"), parse_float(text_node.get("y")))
    dy = node.get("dy") or text_node.get("dy") or ""

    if "em" in dy:
        font_size = parse_font_size(text_node, parse_font_size(node))
        y += parse_float(dy, 1.0) * font_size
    elif dy:
        y += parse_float(dy, 0.0)
    else:
        font_size = parse_font_size(text_node, parse_font_size(node))

    font_size = parse_font_size(text_node, parse_font_size(node))
    context = detect_context(text_node)
    cfg = CONTEXT_LAYOUT.get(context, CONTEXT_LAYOUT["generic"])
    width = estimate_text_width(rest, font_size * cfg.get("font_scale", 1.0))
    icon_h, icon_w = estimate_icon_size(icon, cfg.get("icon_size", 14.0))

    style = parse_style_map(text_node)
    text_anchor = (text_node.get("text-anchor") or style.get("text-anchor") or "start").lower()
    if text_anchor == "middle":
        text_x = x - (width / 2.0)
    elif text_anchor in {"end", "right"}:
        text_x = x - width
    else:
        text_x = x

    dominant = (
        text_node.get("dominant-baseline")
        or style.get("dominant-baseline")
        or text_node.get("alignment-baseline")
        or style.get("alignment-baseline")
        or ""
    ).lower()
    if dominant in {"middle", "central", "text-middle"}:
        baseline_shift = 0.0
    elif dominant in {"hanging", "text-before-edge"}:
        baseline_shift = font_size * 0.07
    elif dominant in {"text-after-edge", "text-bottom", "alphabetic"}:
        baseline_shift = font_size * 0.01
    else:
        baseline_shift = 0.0

    prefix = token.split(":", 1)[0]
    if prefix == "fa":
        y += 0.0
    y += baseline_shift
    y += cfg["y_adjust"] + (font_size * cfg["y_font_factor"])
    y -= (icon_h * 0.5)

    return text_x - icon_w - cfg["x_gap"], y


def insert_before_text(root: ET.Element, text_node: ET.Element, group: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> None:
    parent = parent_map.get(text_node, root)
    children = list(parent)
    try:
        idx = children.index(text_node)
    except ValueError:
        parent.append(group)
    else:
        parent.insert(idx, group)


def process_svg(svg_path: Path, token_re: re.Pattern[str], icon_map: dict[str, dict], regenerate_jpg: bool) -> tuple[int, int]:
    tree = ET.parse(svg_path)
    root = tree.getroot()
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    inserted = 0
    unknown = 0

    for node in list(iter_text_candidates(root, token_re)):
        parsed = extract_leading_token(text_value(node), token_re)
        if parsed is None:
            continue
        rest, token = parsed

        icon = icon_map.get(token)
        if icon is None:
            unknown += 1
            continue

        prefix = token.split(":", 1)[0]
        set_text_value(node, rest)
        x, y = icon_position(node, parent_map, token, rest, icon)
        text_node = effective_text_node(node, parent_map)
        insert_before_text(root, text_node, make_icon_group(prefix, token, icon, x, y), parent_map)
        inserted += 1

    root.set("data-mermaid-icon-injected-count", str(inserted))
    tree.write(svg_path, encoding="utf-8", xml_declaration=False)

    if regenerate_jpg:
        jpg_path = svg_path.with_suffix(".jpg")
        # Keep this for legacy callsites that used --no-jpg.
        try:
            subprocess.run(
                [
                    "magick",
                    str(svg_path),
                    "-density",
                    "300",
                    "-colorspace",
                    "sRGB",
                    "-background",
                    "white",
                    "-alpha",
                    "remove",
                    "-alpha",
                    "off",
                    "-flatten",
                    "-quality",
                    "95",
                    "-strip",
                    str(jpg_path),
                ],
                check=True,
                stderr=subprocess.DEVNULL,
            )
        except (FileNotFoundError, subprocess.CalledProcessError):
            subprocess.run(
                [
                    "sips",
                    "-s",
                    "format",
                    "jpeg",
                    "-s",
                    "formatOptions",
                    "high",
                    str(svg_path),
                    "--out",
                    str(jpg_path),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
    return inserted, unknown


def visible_token_count(svg_path: Path, token_re: re.Pattern[str]) -> int:
    root = ET.parse(svg_path).getroot()
    count = 0
    for node in root.iter():
        if local_name(node.tag) in {"text", "tspan"} and extract_leading_token(text_value(node), token_re):
            count += 1
    return count


def icon_group_count(svg_path: Path) -> int:
    root = ET.parse(svg_path).getroot()
    return sum(
        1
        for node in root.iter()
        if local_name(node.tag) == "g"
        and (node.get("class") == "mermaid-icon" or (node.get("class") or "").startswith("mermaid-icon "))
    )


def check_assets(paths: list[Path], token_re: re.Pattern[str]) -> int:
    errors: list[str] = []
    total_icons = 0

    for svg_path in paths:
        visible = visible_token_count(svg_path, token_re)
        groups = icon_group_count(svg_path)
        root = ET.parse(svg_path).getroot()
        expected = int(root.get("data-mermaid-icon-injected-count", "-1"))
        total_icons += groups
        if visible:
            errors.append(f"{svg_path}: {visible} visible icon token(s) remain")
        if expected < 0:
            errors.append(f"{svg_path}: missing data-mermaid-icon-injected-count")
        elif groups != expected:
            errors.append(f"{svg_path}: icon groups {groups} != expected {expected}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"OK: {len(paths)} SVG(s), {total_icons} icon(s) injected")
    return 0


def find_svgs(paths: list[Path]) -> list[Path]:
    result: list[Path] = []
    seen: set[Path] = set()
    for item in paths:
        if not item.exists():
            continue
        if item.is_file() and item.suffix.lower() == ".svg":
            if item not in seen:
                result.append(item)
                seen.add(item)
            continue
        if item.is_dir():
            for svg_path in sorted(item.glob("**/*.svg")):
                if svg_path not in seen:
                    result.append(svg_path)
                    seen.add(svg_path)
            continue
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", nargs="+", type=Path)
    parser.add_argument("--icon-map", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="Validate already-injected SVGs without modifying files")
    parser.add_argument("--prefixes", default="", help="Comma-separated optional override prefixes")
    parser.add_argument("--strict", action="store_true", help="Fail when unknown tokens are present")
    parser.add_argument("--no-jpg", action="store_true", help="Do not regenerate JPEGs after SVG injection")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    icon_map = json.loads(args.icon_map.read_text(encoding="utf-8")).get("tokens", {})
    if not isinstance(icon_map, dict):
        print("Icon map is invalid: expected tokens as object", file=sys.stderr)
        return 1

    prefixes = []
    if args.prefixes.strip():
        prefixes = [value.strip().lower() for value in args.prefixes.split(",") if value.strip()]
    else:
        prefixes = iter_prefixes_from_icon_map(icon_map)

    if not prefixes:
        prefixes = sorted({token.split(":", 1)[0].lower() for token in icon_map})

    token_re = compile_token_re(prefixes)
    if token_re.pattern == "(?!)":
        print("No prefixes available for token matching.", file=sys.stderr)
        return 0

    svg_paths = find_svgs(list(args.assets))
    if not svg_paths:
        print("No SVG files found for provided paths", file=sys.stderr)
        return 1

    if args.check:
        return check_assets(svg_paths, token_re)

    total_inserted = 0
    total_unknown = 0

    for svg_path in svg_paths:
        inserted, unknown = process_svg(svg_path, token_re, icon_map, regenerate_jpg=not args.no_jpg)
        total_inserted += inserted
        total_unknown += unknown

        if unknown:
            print(f"[icons] {svg_path.name}: inserted={inserted} unknown={unknown}")
        else:
            print(f"[icons] {svg_path.name}: inserted={inserted}")

    if total_unknown and args.strict:
        print(f"Unknown icon token(s): {total_unknown}", file=sys.stderr)
        return 1

    print(f"OK: injected {total_inserted} icon(s) into {len(svg_paths)} SVG(s)")
    if total_unknown:
        print(f"Unknown icon token(s) kept as plain text: {total_unknown}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

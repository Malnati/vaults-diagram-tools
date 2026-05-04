#!/usr/bin/env bash
# Render Mermaid files (.mmd and .mermaid) to .svg + .jpg pairs.
# Usage:
#   packages/renderer/render-mermaid-assets.sh <file-or-directory> [...]
# Exemplos:
#   packages/renderer/render-mermaid-assets.sh "Obsidian/Claro/markdown/Trasnferencia Rapida/README/assets"
#   MMDC=/path/to/mmdc packages/renderer/render-mermaid-assets.sh --width 2400 --height 1800 docs/assets
set -euo pipefail
ORIGINAL_ARGS=("$@")

WIDTH=2400
HEIGHT=1800
BACKGROUND=white
JPEG_QUALITY=92
THEME=default
PUPPETEER_CONFIG="${PUPPETEER_CONFIG:-${PUPPETEER_CONFIG_FILE:-}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBAL_MERMAID_CONFIG_FILE="${MMDC_GLOBAL_CONFIG_FILE:-$SCRIPT_DIR/global-mermaid-theme.json}"
GLOBAL_MERMAID_CSS_FILE="${MMDC_GLOBAL_CSS_FILE:-$SCRIPT_DIR/sequence-diagram.css}"
BM_RENDERER_SCRIPT="$SCRIPT_DIR/render-mermaid-bm.mjs"
ASCII_RENDERER_SCRIPT="$SCRIPT_DIR/render-mermaid-ascii.mjs"

MMDC_RENDER_ENGINE="${MMDC_RENDER_ENGINE:-${MMDC_RENDER_BACKEND:-mmdc}}"
MMDC_ALLOW_NPX="${MMDC_ALLOW_NPX:-0}"
MMDC_RENDER_ENGINE="$(echo "$MMDC_RENDER_ENGINE" | tr '[:upper:]' '[:lower:]')"
if [[ "$MMDC_RENDER_ENGINE" != "mmdc" && "$MMDC_RENDER_ENGINE" != "beautiful" && "$MMDC_RENDER_ENGINE" != "bm" && "$MMDC_RENDER_ENGINE" != "vendor" ]]; then
  echo "Unknown engine in MMDC_RENDER_ENGINE=[$MMDC_RENDER_ENGINE]; using mmdc." >&2
  MMDC_RENDER_ENGINE="mmdc"
fi

if [[ "$MMDC_RENDER_ENGINE" == "vendor" || "${MMDC_VENDOR_ONLY:-0}" == "1" ]]; then
  exec node "$SCRIPT_DIR/render-mermaid-assets.mjs" "${ORIGINAL_ARGS[@]}"
fi

MMDC_BM_THEME="${MMDC_BM_THEME:-}"
MMDC_BM_BG="${MMDC_BM_BG:-}"
MMDC_BM_FG="${MMDC_BM_FG:-}"
MMDC_BM_LINE="${MMDC_BM_LINE:-}"
MMDC_BM_ACCENT="${MMDC_BM_ACCENT:-}"
MMDC_BM_MUTED="${MMDC_BM_MUTED:-}"
MMDC_BM_SURFACE="${MMDC_BM_SURFACE:-}"
MMDC_BM_BORDER="${MMDC_BM_BORDER:-}"
MMDC_BM_FONT="${MMDC_BM_FONT:-Inter}"
MMDC_BM_PADDING="${MMDC_BM_PADDING:-40}"
MMDC_BM_TRANSPARENT="${MMDC_BM_TRANSPARENT:-0}"
MMDC_BM_INTERACTIVE="${MMDC_BM_INTERACTIVE:-0}"
MMDC_BM_ASCII="${MMDC_BM_ASCII:-0}"
MMDC_BM_ASCII_MODE="${MMDC_BM_ASCII_MODE:-unicode}"
MMDC_BM_ASCII_OUTPUT="${MMDC_BM_ASCII_OUTPUT:-}"
MMDC_BM_SHIKI_THEME="${MMDC_BM_SHIKI_THEME:-}"

MMDC_ASCII="${MMDC_ASCII:-$MMDC_BM_ASCII}"
MMDC_ASCII_ENGINE="${MMDC_ASCII_ENGINE:-auto}"
MMDC_ASCII_ENGINE="$(echo "$MMDC_ASCII_ENGINE" | tr '[:upper:]' '[:lower:]')"
if [[ "$MMDC_ASCII_ENGINE" == "bm" ]]; then
  MMDC_ASCII_ENGINE="beautiful"
fi
if [[ "$MMDC_ASCII_ENGINE" != "auto" && "$MMDC_ASCII_ENGINE" != "mermaid-ascii" && "$MMDC_ASCII_ENGINE" != "beautiful" ]]; then
  echo "Unknown engine in MMDC_ASCII_ENGINE=[$MMDC_ASCII_ENGINE]; using auto." >&2
  MMDC_ASCII_ENGINE="auto"
fi
MMDC_ASCII_MODE="${MMDC_ASCII_MODE:-$MMDC_BM_ASCII_MODE}"
MMDC_ASCII_MODE="$(echo "$MMDC_ASCII_MODE" | tr '[:upper:]' '[:lower:]')"
if [[ "$MMDC_ASCII_MODE" != "unicode" && "$MMDC_ASCII_MODE" != "ascii" ]]; then
  echo "Invalid MMDC_ASCII_MODE=[$MMDC_ASCII_MODE]; using unicode." >&2
  MMDC_ASCII_MODE="unicode"
fi
MMDC_ASCII_OUTPUT="${MMDC_ASCII_OUTPUT:-$MMDC_BM_ASCII_OUTPUT}"
MMDC_ASCII_PADDING_X="${MMDC_ASCII_PADDING_X:-5}"
MMDC_ASCII_PADDING_Y="${MMDC_ASCII_PADDING_Y:-5}"
MMDC_ASCII_BORDER_PADDING="${MMDC_ASCII_BORDER_PADDING:-1}"
MMDC_ASCII_COORDS="${MMDC_ASCII_COORDS:-0}"

# Mermaid icon configuration.
MMDC_ICON_PREFIXES="${MMDC_ICON_PREFIXES:-fa,logos,lucide}"
MMDC_ICON_MAP_FILE="${MMDC_ICON_MAP_FILE:-}"
MMDC_STRICT_ICON_INJECTION="${MMDC_STRICT_ICON_INJECTION:-0}"
INJECTOR_SCRIPT="$SCRIPT_DIR/inject-mermaid-icons.py"
ICON_REGISTRY_SCRIPT="$SCRIPT_DIR/build-mermaid-icon-registry.mjs"

RENDER_PNG=0

usage() {
  cat <<'USAGE'
Usage: render-mermaid-assets.sh [options] <file(.mmd|.mermaid)|directory> [...]

Render each discovered .mmd/.mermaid file to:
  - <nome>.svg
  - <nome>.jpg

Options:
  --width N                 Mermaid CLI render width. Default: 2400.
  --height N                Mermaid CLI render height. Default: 1800.
  --background COLOR          Background for intermediate SVG/PNG and JPEG. Default: white.
  --quality N               JPEG quality. Default: 92.
  --raster-scale N          Vendor only: PNG/JPEG scale through WASM. Default: 2.
  --theme NAME              Mermaid CLI theme. Default: default.
                          Also sets the default theme in the beautiful-mermaid engine (when selected).
  --png                     Also write <name>.png, in addition to SVG and JPEG.
  --puppeteer-config FILE   Puppeteer configuration for mmdc, useful on VPS hosts with --no-sandbox.
  --css-file FILE           CSS global passado ao mmdc via --cssFile.
  -h, --help                Mostra esta ajuda.

Environment variables:
  MMDC_RENDER_ENGINE        vendor | mmdc | beautiful | bm (default: mmdc)
  MMDC_RENDER_BACKEND       Alias for MMDC_RENDER_ENGINE
  MMDC_VENDOR_ONLY          1 to delegate to the vendored JS/WASM renderer and block external fallback.
  MMDC_VENDOR_NODE_ROOT     vendor/node directory for vendor mode (default: packages/renderer/vendor/node).
  MMDC_RASTER_SCALE         Vendor only: PNG/JPEG scale through WASM (default: 2).
  MMDC_ALLOW_NPX            1 to re-enable npx fallback in mmdc mode (default: 0).
  MMDC_BM_THEME             beautiful-mermaid theme (built-in name, JSON, or path)
  MMDC_BM_BG                bg color for beautiful-mermaid
  MMDC_BM_FG                fg color for beautiful-mermaid
  MMDC_BM_LINE              line color for beautiful-mermaid
  MMDC_BM_ACCENT            accent color for beautiful-mermaid
  MMDC_BM_MUTED             muted color for beautiful-mermaid
  MMDC_BM_SURFACE           surface color for beautiful-mermaid
  MMDC_BM_BORDER            border color for beautiful-mermaid
  MMDC_BM_FONT              Font for beautiful-mermaid (default: Inter)
  MMDC_BM_PADDING           Padding do canvas beautiful-mermaid (default: 40)
  MMDC_BM_TRANSPARENT       1 for transparent background in beautiful-mermaid
  MMDC_BM_INTERACTIVE       1 to enable tooltip in XYCharts (beautiful-mermaid)
  MMDC_BM_ASCII             Legacy alias for MMDC_ASCII
  MMDC_BM_ASCII_MODE        Legacy alias for MMDC_ASCII_MODE
  MMDC_BM_ASCII_OUTPUT      Legacy alias for MMDC_ASCII_OUTPUT
  MMDC_BM_SHIKI_THEME       Shiki theme name for fromShikiTheme
  MMDC_ASCII                1 to generate a <base>.txt sidecar independent from the SVG/JPEG engine.
  MMDC_ASCII_ENGINE         auto | mermaid-ascii | beautiful (default: auto)
  MMDC_ASCII_MODE           unicode | ascii (default: unicode)
  MMDC_ASCII_OUTPUT         Path to the txt file; when unset, uses <base>.txt
  MMDC_ASCII_PADDING_X      Horizontal spacing between nodes in the ASCII sidecar (default: 5)
  MMDC_ASCII_PADDING_Y      Vertical spacing between nodes in the ASCII sidecar (default: 5)
  MMDC_ASCII_BORDER_PADDING Inner box padding in the ASCII sidecar (default: 1)
  MMDC_ASCII_COORDS         1 to generate <base>.coords.txt when possible
  MERMAID_ASCII_BIN         Explicit path to the mermaid-ascii binary.
  MMDC                      Path to mmdc. If missing, tries PATH, ~/.cache/mermaid-cli, and npx only with MMDC_ALLOW_NPX=1.
  MMDC_EXTRA_ARGS           Argumentos extras passados ao mmdc.
  MMDC_GLOBAL_CONFIG_FILE   Mermaid configuration file for global injection through --configFile (default: packages/renderer/global-mermaid-theme.json).
  MMDC_GLOBAL_CSS_FILE      Global CSS for injection through --cssFile (default: packages/renderer/sequence-diagram.css).
  PUPPETEER_CONFIG          Same as --puppeteer-config.
  MMDC_ICON_PREFIXES        Mermaid prefixes to process (default: fa,logos,lucide).
  MMDC_ICON_MAP_FILE        Path to a prepared icon map (reused when set).
  MMDC_STRICT_ICON_INJECTION Set '1' to fail injection when unresolved tokens remain.
USAGE
}

inputs=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --width)
      WIDTH="${2:?missing value for --width}"; shift 2 ;;
    --height)
      HEIGHT="${2:?missing value for --height}"; shift 2 ;;
    --background)
      BACKGROUND="${2:?missing value for --background}"; shift 2 ;;
    --quality)
      JPEG_QUALITY="${2:?missing value for --quality}"; shift 2 ;;
    --theme)
      THEME="${2:?missing value for --theme}"; shift 2 ;;
    --png)
      RENDER_PNG=1; shift ;;
    --puppeteer-config)
      PUPPETEER_CONFIG="${2:?missing value for --puppeteer-config}"; shift 2 ;;
    --css-file)
      GLOBAL_MERMAID_CSS_FILE="${2:?missing value for --css-file}"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    --)
      shift; inputs+=("$@"); break ;;
    -* )
      echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      inputs+=("$1"); shift ;;
  esac
done

if [[ ${#inputs[@]} -eq 0 ]]; then
  inputs=(".")
fi

find_mmdc_cmd() {
  if [[ -n "${MMDC:-}" ]]; then
    if [[ ! -x "$MMDC" ]]; then
      echo "Provided MMDC is not executable: $MMDC" >&2
      exit 127
    fi
    MMDC_CMD=("$MMDC")
  elif command -v mmdc >/dev/null 2>&1; then
    MMDC_CMD=("$(command -v mmdc)")
  elif [[ -x "$HOME/.cache/mermaid-cli/node_modules/.bin/mmdc" ]]; then
    MMDC_CMD=("$HOME/.cache/mermaid-cli/node_modules/.bin/mmdc")
  elif [[ "$MMDC_ALLOW_NPX" == "1" ]] && command -v npx >/dev/null 2>&1; then
    MMDC_CMD=("$(command -v npx)" -y @mermaid-js/mermaid-cli@latest)
  else
    echo "Could not find mmdc. Set MMDC, install @mermaid-js/mermaid-cli, use MMDC_RENDER_ENGINE=vendor, or enable MMDC_ALLOW_NPX=1." >&2
    exit 127
  fi
}

find_converter_cmd() {
  if command -v magick >/dev/null 2>&1; then
    CONVERTER_CMD=("$(command -v magick)")
    CONVERTER_KIND=magick
  elif command -v sips >/dev/null 2>&1; then
    CONVERTER_CMD=("$(command -v sips)")
    CONVERTER_KIND=sips
  elif command -v convert >/dev/null 2>&1; then
    CONVERTER_CMD=("$(command -v convert)")
    CONVERTER_KIND=convert
  else
    echo "Could not find ImageMagick (magick/convert) or sips to generate JPEG." >&2
    exit 127
  fi
}

convert_png_to_jpg() {
  local src="$1"
  local dst="$2"
  local engine="${3:-mmdc}"
  local raster_src="$src"

  if [[ "$engine" == "beautiful" ]]; then
    raster_src="$(prepare_svg_for_rasterization "$src")"
  fi

  case "$CONVERTER_KIND" in
    magick|convert)
      "${CONVERTER_CMD[@]}" "$raster_src" -background "$BACKGROUND" -alpha remove -alpha off -quality "$JPEG_QUALITY" "$dst"
      ;;
    sips)
      "${CONVERTER_CMD[@]}" -s format jpeg "$raster_src" --out "$dst" >/dev/null
      ;;
  esac
}

prepare_svg_for_rasterization() {
  local src="$1"
  local dst="$tmpdir/.rasterized-$(date +%s%N)-$(basename "$src")"

  python3 - "$src" "$dst" <<'PY'
import re
import sys

src = sys.argv[1]
dst = sys.argv[2]

svg = open(src, "r", encoding="utf-8").read()


def parse_hex(value):
    value = (value or "").strip().lower()
    if not value.startswith("#"):
        return None

    value = value[1:]
    if len(value) == 3:
        value = "".join(ch + ch for ch in value)
    if len(value) != 6:
        return None

    try:
        r = int(value[0:2], 16)
        g = int(value[2:4], 16)
        b = int(value[4:6], 16)
        return r, g, b
    except ValueError:
        return None


def to_hex(rgb):
    r, g, b = [max(0, min(255, int(v))) for v in rgb]
    return f"#{r:02x}{g:02x}{b:02x}"


def mix(a, b, percent_a):
    rgb_a = parse_hex(a)
    rgb_b = parse_hex(b)
    if not rgb_a or not rgb_b:
        return a

    p = percent_a / 100.0
    out = (
        rgb_a[0] * p + rgb_b[0] * (1 - p),
        rgb_a[1] * p + rgb_b[1] * (1 - p),
        rgb_a[2] * p + rgb_b[2] * (1 - p),
    )
    return to_hex(out)


def normalize_hex(value):
    normalized = parse_hex(value)
    if normalized is None:
        return None
    return to_hex(normalized)


def resolve_color(value, seen=None, depth=0):
    if value is None:
        return None
    if seen is None:
        seen = set()
    value = value.strip()

    # Prevent infinite loops from nested references.
    if depth > 12:
        return None
    if not value:
        return None

    # var(--name[, fallback])
    m = re.match(r"var\(--([a-zA-Z0-9_-]+)\s*(?:,\s*(.+))?\)\s*$", value)
    if m:
        name = m.group(1).lower()
        fallback = m.group(2)

        if name in seen:
            return None

        replacement = vars_map.get(name)
        if replacement is not None:
            resolved = resolve_color(replacement, seen=seen | {name}, depth=depth + 1)
            if resolved is not None:
                return resolved

        if fallback:
            return resolve_color(fallback, seen=seen, depth=depth + 1)
        return None

    # color-mix(in srgb, var(--fg) 50%, var(--bg))
    mix_match = re.match(
        r"color-mix\(in\s+srgb,\s*(.+)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)",
        value,
        re.IGNORECASE,
    )
    if mix_match:
        left = resolve_color(mix_match.group(1), seen=seen, depth=depth + 1)
        right = resolve_color(mix_match.group(3), seen=seen, depth=depth + 1)
        percent = float(mix_match.group(2))
        if left is None or right is None:
            return None
        return mix(left, right, percent)

    if value.lower().startswith("rgb"):
        return value

    hex_value = normalize_hex(value)
    return hex_value if hex_value is not None else value


style_match = re.search(r"<svg[^>]*style=\"([^\"]*)\"[^>]*>", svg)
vars_map = {
    "bg": "#ffffff",
    "fg": "#27272a",
}
if style_match:
    style_text = style_match.group(1)
    for name, value in re.findall(r"--([a-zA-Z0-9_-]+):\s*([^;\\\"]*)", style_text):
        vars_map[name.strip().lower()] = value.strip()

bg = resolve_color(vars_map.get("bg")) or "#ffffff"
fg = resolve_color(vars_map.get("fg")) or "#27272a"
line = resolve_color(vars_map.get("line")) or mix(fg, bg, 50)
accent = resolve_color(vars_map.get("accent")) or mix(fg, bg, 85)
muted = resolve_color(vars_map.get("muted")) or mix(fg, bg, 40)
surface = resolve_color(vars_map.get("surface")) or mix(fg, bg, 3)
border = resolve_color(vars_map.get("border")) or mix(fg, bg, 20)

vars_map.update(
    {
        "_text": fg,
        "_text-sec": muted,
        "_text-muted": muted,
        "_text-faint": mix(fg, bg, 25),
        "_line": line,
        "_arrow": accent,
        "_node-fill": surface,
        "_node-stroke": border,
        "_group-fill": bg,
        "_group-hdr": mix(fg, bg, 5),
        "_inner-stroke": mix(fg, bg, 12),
        "_key-badge": mix(fg, bg, 10),
    }
)


var_re = re.compile(r"var\(--([a-zA-Z0-9_-]+)(?:\s*,\s*([^)]*?))?\)")


def replace_var(match):
    name = match.group(1).lower()
    fallback = match.group(2)
    if name in vars_map:
        resolved = resolve_color(vars_map[name], seen={name}, depth=1)
        if resolved is not None:
            return resolved
    if fallback is not None:
        resolved_fallback = resolve_color(fallback, seen=set(), depth=1)
        if resolved_fallback is not None:
            return resolved_fallback
    return match.group(0)

style_block_match = re.search(r"(<style[^>]*>.*?</style>)", svg, re.DOTALL | re.IGNORECASE)
if style_block_match:
    svg_prefix = svg[:style_block_match.start(1)]
    svg_suffix = svg[style_block_match.end(1):]
    svg_out = (
        var_re.sub(replace_var, svg_prefix)
        + style_block_match.group(1)
        + var_re.sub(replace_var, svg_suffix)
    )
else:
    svg_out = var_re.sub(replace_var, svg)

open(dst, "w", encoding="utf-8").write(svg_out)
PY

  echo "$dst"
}

convert_svg_to_jpg() {
  local src="$1"
  local dst="$2"
  local engine="${3:-mmdc}"
  local raster_src="$src"

  if [[ "$engine" == "beautiful" ]]; then
    raster_src="$(prepare_svg_for_rasterization "$src")"
  fi

  case "$CONVERTER_KIND" in
    magick|convert)
      "${CONVERTER_CMD[@]}" "$raster_src" -background "$BACKGROUND" -alpha remove -alpha off -quality "$JPEG_QUALITY" "$dst" >/dev/null
      ;;
    sips)
      # Some older sips builds have limited SVG support;
      # a non-zero return falls back to PNG.
      "${CONVERTER_CMD[@]}" -s format jpeg "$raster_src" --out "$dst" >/dev/null
      ;;
  esac
}

convert_svg_to_png() {
  local src="$1"
  local dst="$2"
  local engine="${3:-mmdc}"
  local raster_src="$src"

  if [[ "$engine" == "beautiful" ]]; then
    raster_src="$(prepare_svg_for_rasterization "$src")"
  fi

  case "$CONVERTER_KIND" in
    magick|convert)
      "${CONVERTER_CMD[@]}" "$raster_src" -background "$BACKGROUND" -alpha remove -alpha off "$dst" >/dev/null
      ;;
    sips)
      "${CONVERTER_CMD[@]}" -s format png "$raster_src" --out "$dst" >/dev/null
      ;;
  esac
}

render_with_beautiful_mermaid() {
  local input="$1"
  local svg="$2"
  local _maybe_ascii_output="$3"

  local bm_args=()
  bm_args+=(--input "$input" --output "$svg")

  if [[ -n "$MMDC_BM_THEME" ]]; then
    bm_args+=(--theme "$MMDC_BM_THEME")
  fi
  if [[ -n "$MMDC_BM_BG" ]]; then
    bm_args+=(--bg "$MMDC_BM_BG")
  fi
  if [[ -n "$MMDC_BM_FG" ]]; then
    bm_args+=(--fg "$MMDC_BM_FG")
  fi
  if [[ -n "$MMDC_BM_LINE" ]]; then
    bm_args+=(--line "$MMDC_BM_LINE")
  fi
  if [[ -n "$MMDC_BM_ACCENT" ]]; then
    bm_args+=(--accent "$MMDC_BM_ACCENT")
  fi
  if [[ -n "$MMDC_BM_MUTED" ]]; then
    bm_args+=(--muted "$MMDC_BM_MUTED")
  fi
  if [[ -n "$MMDC_BM_SURFACE" ]]; then
    bm_args+=(--surface "$MMDC_BM_SURFACE")
  fi
  if [[ -n "$MMDC_BM_BORDER" ]]; then
    bm_args+=(--border "$MMDC_BM_BORDER")
  fi
  if [[ -n "$MMDC_BM_FONT" ]]; then
    bm_args+=(--font "$MMDC_BM_FONT")
  fi
  if [[ -n "$MMDC_BM_PADDING" ]]; then
    bm_args+=(--padding "$MMDC_BM_PADDING")
  fi
  if [[ "$MMDC_BM_TRANSPARENT" == "1" ]]; then
    bm_args+=(--transparent)
  fi
  if [[ "$MMDC_BM_INTERACTIVE" == "1" ]]; then
    bm_args+=(--interactive)
  fi
  if [[ -n "$MMDC_BM_SHIKI_THEME" ]]; then
    bm_args+=(--shiki-theme "$MMDC_BM_SHIKI_THEME")
  fi

  node "$BM_RENDERER_SCRIPT" "${bm_args[@]}"
}

render_with_mmdc() {
  local input="$1"
  local svg="$2"
  local png="$3"

  "${MMDC_CMD[@]}" -i "$input" -o "$svg" -b "$BACKGROUND" -w "$WIDTH" -H "$HEIGHT" -t "$THEME" "${puppeteer_args[@]}" "${extra_args[@]}"
  "${MMDC_CMD[@]}" -i "$input" -o "$png" -b "$BACKGROUND" -w "$WIDTH" -H "$HEIGHT" -t "$THEME" "${puppeteer_args[@]}" "${extra_args[@]}" -q
}

render_ascii_sidecar() {
  local input="$1"
  local txt="$2"
  local coords_txt="$3"

  local ascii_args=()
  ascii_args+=(--input "$input" --output "$txt")
  ascii_args+=(--engine "$MMDC_ASCII_ENGINE")
  ascii_args+=(--mode "$MMDC_ASCII_MODE")
  ascii_args+=(--padding-x "$MMDC_ASCII_PADDING_X")
  ascii_args+=(--padding-y "$MMDC_ASCII_PADDING_Y")
  ascii_args+=(--border-padding "$MMDC_ASCII_BORDER_PADDING")

  if [[ "$MMDC_ASCII_COORDS" == "1" ]]; then
    ascii_args+=(--coords --coords-output "$coords_txt")
  fi

  node "$ASCII_RENDERER_SCRIPT" "${ascii_args[@]}"
}

count_icon_tokens() {
  python3 - "$1" <<'PY'
import json
import sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
print(len(data.get("tokens", {})))
PY
}

mmd_files=()
for input in "${inputs[@]}"; do
  if [[ -f "$input" ]]; then
    if [[ "$input" == *.mmd || "$input" == *.mermaid ]]; then
      mmd_files+=("$input")
    else
      echo "Skipping file that is not .mmd/.mermaid: $input" >&2
    fi
  elif [[ -d "$input" ]]; then
    while IFS= read -r found; do
      mmd_files+=("$found")
    done < <(find "$input" -type f \( -name '*.mmd' -o -name '*.mermaid' \) | LC_ALL=C sort)
  else
    echo "Path not found: $input" >&2
    exit 1
  fi
done

if [[ ${#mmd_files[@]} -eq 0 ]]; then
  echo "No .mmd/.mermaid files found." >&2
  exit 1
fi

find_mmdc_cmd
find_converter_cmd

puppeteer_args=()
if [[ -n "$PUPPETEER_CONFIG" ]]; then
  puppeteer_args=(-p "$PUPPETEER_CONFIG")
elif [[ -f /tmp/puppeteer-no-sandbox.json ]]; then
  puppeteer_args=(-p /tmp/puppeteer-no-sandbox.json)
fi

# shellcheck disable=SC2206
extra_args=()
if [[ -n "${MMDC_EXTRA_ARGS:-}" ]]; then
  extra_args=(${MMDC_EXTRA_ARGS})
fi
append_global_config=1
for arg in "${extra_args[@]}"; do
  if [[ "$arg" == "--configFile" ]] || [[ "$arg" == --configFile=* ]]; then
    append_global_config=0
    break
  fi
done
if [[ "$append_global_config" -eq 1 && -f "$GLOBAL_MERMAID_CONFIG_FILE" ]]; then
  extra_args+=(--configFile "$GLOBAL_MERMAID_CONFIG_FILE")
fi
append_global_css=1
for arg in "${extra_args[@]}"; do
  if [[ "$arg" == "-C" ]] || [[ "$arg" == "--cssFile" ]] || [[ "$arg" == --cssFile=* ]]; then
    append_global_css=0
    break
  fi
done
if [[ "$append_global_css" -eq 1 && -f "$GLOBAL_MERMAID_CSS_FILE" ]]; then
  extra_args+=(--cssFile "$GLOBAL_MERMAID_CSS_FILE")
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

use_icon_injection=0
ICON_MAP_FILE=""
if [[ -n "$MMDC_ICON_PREFIXES" ]]; then
  if [[ -n "$MMDC_ICON_MAP_FILE" && -f "$MMDC_ICON_MAP_FILE" ]]; then
    ICON_MAP_FILE="$MMDC_ICON_MAP_FILE"
  else
      ICON_MAP_FILE="$tmpdir/.mermaid-icon-map.json"
      registry_args=(--prefixes "$MMDC_ICON_PREFIXES" --output "$ICON_MAP_FILE")
      if [[ "$MMDC_STRICT_ICON_INJECTION" == "1" ]]; then
        registry_args+=(--strict)
      fi
      if ! node "$ICON_REGISTRY_SCRIPT" "${registry_args[@]}" "${mmd_files[@]}"; then
        echo "Could not generate the icon map (missing dependency?); skipping icon injection for this run." >&2
        use_icon_injection=0
        ICON_MAP_FILE=""
        if [[ "$MMDC_STRICT_ICON_INJECTION" == "1" ]]; then
          failed=1
        fi
      fi
    fi
  fi

  if [[ -n "$ICON_MAP_FILE" && -f "$ICON_MAP_FILE" ]]; then
    icon_token_count=$(count_icon_tokens "$ICON_MAP_FILE")
    if [[ "$icon_token_count" -gt 0 ]]; then
      use_icon_injection=1
    fi
  fi

declare -a rendered_svgs=()
declare -A tmp_png_map
declare -A svg_engine
rendered=0
failed=0
renderer_mode="mmdc"

if [[ "$MMDC_RENDER_ENGINE" == "beautiful" || "$MMDC_RENDER_ENGINE" == "bm" ]]; then
  renderer_mode="beautiful"
  if [[ -z "$MMDC_BM_THEME" && "$THEME" != "default" ]]; then
    MMDC_BM_THEME="$THEME"
  fi
fi

for mmd in "${mmd_files[@]}"; do
  dir="$(dirname "$mmd")"
  filename="$(basename "$mmd")"
  base="${filename%.mmd}"
  base="${base%.mermaid}"
  svg="$dir/$base.svg"
  png_tmp="$tmpdir/$base.png"
  jpg="$dir/$base.jpg"
  png_out="$dir/$base.png"
  txt_out="$dir/$base.txt"
  ascii_txt="${MMDC_ASCII_OUTPUT:-$txt_out}"
  coords_txt="${ascii_txt%.*}.coords.txt"
  if [[ "$ascii_txt" == "$coords_txt" ]]; then
    coords_txt="$ascii_txt.coords.txt"
  fi

  echo "[mermaid] $mmd"

  used_engine="mmdc"
  if [[ "$renderer_mode" == "beautiful" ]]; then
    if ! render_with_beautiful_mermaid "$mmd" "$svg" "$txt_out"; then
      echo "  ⚠️ beautiful-mermaid failed; using mmdc fallback for: $mmd" >&2
      render_with_mmdc "$mmd" "$svg" "$png_tmp"
    else
      used_engine="beautiful"
    fi
  else
    render_with_mmdc "$mmd" "$svg" "$png_tmp"
  fi

  if [[ "$use_icon_injection" -eq 0 ]]; then
    if [[ "$used_engine" == "beautiful" ]]; then
      if ! convert_svg_to_jpg "$svg" "$jpg" "$used_engine"; then
        failed=1
      fi
      if [[ "$RENDER_PNG" -eq 1 ]] && ! convert_svg_to_png "$svg" "$png_out" "$used_engine"; then
        failed=1
      fi
    else
      if ! convert_png_to_jpg "$png_tmp" "$jpg" "$used_engine"; then
        failed=1
      fi
      if [[ "$RENDER_PNG" -eq 1 ]]; then
        cp "$png_tmp" "$png_out"
      fi
    fi
  fi

  if [[ "$MMDC_ASCII" == "1" ]]; then
    if render_ascii_sidecar "$mmd" "$ascii_txt" "$coords_txt"; then
      echo "  -> $ascii_txt"
      if [[ "$MMDC_ASCII_COORDS" == "1" && -s "$coords_txt" ]]; then
        echo "  -> $coords_txt"
      fi
    else
      failed=1
    fi
  fi

  rendered_svgs+=("$svg")
  svg_engine["$svg"]="$used_engine"
  if [[ "$used_engine" == "mmdc" ]]; then
    tmp_png_map["$svg"]="$png_tmp"
  fi

  if [[ "$RENDER_PNG" -eq 1 ]]; then
    echo "  -> $svg"
    echo "  -> $jpg"
  else
    echo "  -> $svg"
    echo "  -> $jpg"
  fi
  rendered=$((rendered + 1))

done

if [[ "$use_icon_injection" -eq 1 ]]; then
  inject_args=("$INJECTOR_SCRIPT" --icon-map "$ICON_MAP_FILE")
  if [[ "$MMDC_STRICT_ICON_INJECTION" == "1" ]]; then
    inject_args+=(--strict)
  fi

  python3 "${inject_args[@]}" "${rendered_svgs[@]}"

  for svg in "${rendered_svgs[@]}"; do
    engine="${svg_engine[$svg]:-mmdc}"
    if ! convert_svg_to_jpg "$svg" "${svg%.svg}.jpg" "$engine"; then
      # fallback to PNG if SVG->JPEG fails in the current environment
      fallback_png="${tmp_png_map[$svg]:-}"
      if [[ -n "$fallback_png" && -f "$fallback_png" ]]; then
        echo "Warning: failed to convert SVG to JPEG with $CONVERTER_KIND; using PNG fallback for ${svg%.svg}.jpg" >&2
        convert_png_to_jpg "$fallback_png" "${svg%.svg}.jpg" mmdc
      else
        failed=1
      fi
    fi
  done

  if [[ "$RENDER_PNG" -eq 1 ]]; then
    for svg in "${rendered_svgs[@]}"; do
      engine="${svg_engine[$svg]:-mmdc}"
      if ! convert_svg_to_png "$svg" "${svg%.svg}.png" "$engine"; then
        failed=1
      fi
    done
  fi
fi

if [[ "$RENDER_PNG" -eq 1 ]]; then
  for svg in "${rendered_svgs[@]}"; do
    png_file="${svg%.svg}.png"
    if [[ -f "$png_file" ]]; then
      echo "  -> $png_file"
    fi
  done
fi

if [[ "$failed" -ne 0 ]]; then
  echo "Failed to render ao menos um artefato Mermaid." >&2
  exit 1
fi

echo "OK: $rendered diagram(s) rendered to SVG + JPEG."

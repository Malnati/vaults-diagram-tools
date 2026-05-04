#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/env.sh"
CASE_ROOT="$(new_case_dir smoke vendor)"
make_forbidden_path "$CASE_ROOT"

"$NODE_BIN" --test "$TESTS_DIR"/*.test.mjs

# basic without icons: flowchart--no-icons.*
copy_fixture_as flowchart.mmd "$CASE_ROOT/input/flowchart--no-icons.mmd"
run_node_cli "$CASE_ROOT/input/flowchart--no-icons.mmd"
assert_svg_remote_free "$CASE_ROOT/input/flowchart--no-icons.svg"
assert_jpeg "$CASE_ROOT/input/flowchart--no-icons.jpg"
assert_no_forbidden

# PNG/JPG raster: raster--jpg-png.*
copy_fixture_as flowchart.mmd "$CASE_ROOT/input/raster--jpg-png.mmd"
run_node_cli --png "$CASE_ROOT/input/raster--jpg-png.mmd"
assert_svg_remote_free "$CASE_ROOT/input/raster--jpg-png.svg"
assert_jpeg "$CASE_ROOT/input/raster--jpg-png.jpg"
assert_png "$CASE_ROOT/input/raster--jpg-png.png"
assert_no_forbidden

# Sequence regression: Modern SVG should rasterize faithfully and in high quality.
copy_fixture_as sequence-auth.mmd "$CASE_ROOT/input/sequence--raster-fidelity.mmd"
run_node_cli --png --ascii "$CASE_ROOT/input/sequence--raster-fidelity.mmd"
assert_svg_remote_free "$CASE_ROOT/input/sequence--raster-fidelity.svg"
assert_contains "$CASE_ROOT/input/sequence--raster-fidelity.svg" 'var('
assert_jpeg_min_dimensions "$CASE_ROOT/input/sequence--raster-fidelity.jpg" 1600 600
assert_png_min_dimensions "$CASE_ROOT/input/sequence--raster-fidelity.png" 1600 600
assert_png_dark_pixels_min "$CASE_ROOT/input/sequence--raster-fidelity.png" 2000
assert_no_ansi "$CASE_ROOT/input/sequence--raster-fidelity.txt"
assert_no_forbidden

# Icons: icons--fa-logos-lucide.*
copy_fixture_as icons.mmd "$CASE_ROOT/input/icons--fa-logos-lucide.mmd"
run_node_cli "$CASE_ROOT/input/icons--fa-logos-lucide.mmd"
assert_svg_remote_free "$CASE_ROOT/input/icons--fa-logos-lucide.svg"
assert_jpeg "$CASE_ROOT/input/icons--fa-logos-lucide.jpg"
assert_contains "$CASE_ROOT/input/icons--fa-logos-lucide.svg" 'mermaid-icon'
assert_contains "$CASE_ROOT/input/icons--fa-logos-lucide.svg" 'data-mermaid-icon-injected-count'
assert_no_forbidden

# Estilos Mermaid: style--classdef-inline.*
copy_fixture_as style-classdef-inline.mmd "$CASE_ROOT/input/style--classdef-inline.mmd"
run_node_cli "$CASE_ROOT/input/style--classdef-inline.mmd"
assert_svg_remote_free "$CASE_ROOT/input/style--classdef-inline.svg"
assert_jpeg "$CASE_ROOT/input/style--classdef-inline.jpg"
assert_contains "$CASE_ROOT/input/style--classdef-inline.svg" '#00ccff'
assert_contains "$CASE_ROOT/input/style--classdef-inline.svg" '#222222'
assert_no_forbidden

# Theme/colors/font: theme--colors-font.*
copy_fixture_as flowchart.mmd "$CASE_ROOT/input/theme--colors-font.mmd"
MMDC_BM_FG="#f9fafb" \
MMDC_BM_LINE="#93c5fd" \
MMDC_BM_ACCENT="#f59e0b" \
MMDC_BM_FONT="Courier New" \
"$NODE_BIN" "$CLI" --theme tokyo-night --background "#101827" "$CASE_ROOT/input/theme--colors-font.mmd"
assert_svg_remote_free "$CASE_ROOT/input/theme--colors-font.svg"
assert_jpeg "$CASE_ROOT/input/theme--colors-font.jpg"
assert_contains "$CASE_ROOT/input/theme--colors-font.svg" '#101827'
assert_contains "$CASE_ROOT/input/theme--colors-font.svg" '#f9fafb'
assert_contains "$CASE_ROOT/input/theme--colors-font.svg" '#93c5fd'
assert_contains "$CASE_ROOT/input/theme--colors-font.svg" 'font-family'
assert_contains "$CASE_ROOT/input/theme--colors-font.svg" 'Courier New'
assert_no_forbidden

# Standalone offline themes: theme--dracula.* e theme--nordic.*
copy_fixture_as flowchart.mmd "$CASE_ROOT/input/theme--dracula.mmd"
run_node_cli --png --theme dracula "$CASE_ROOT/input/theme--dracula.mmd"
assert_svg_remote_free "$CASE_ROOT/input/theme--dracula.svg"
assert_jpeg "$CASE_ROOT/input/theme--dracula.jpg"
assert_png "$CASE_ROOT/input/theme--dracula.png"
assert_contains "$CASE_ROOT/input/theme--dracula.svg" '#282a36'
assert_contains "$CASE_ROOT/input/theme--dracula.svg" '#f8f8f2'
assert_contains "$CASE_ROOT/input/theme--dracula.svg" '#bd93f9'
assert_no_forbidden

copy_fixture_as flowchart.mmd "$CASE_ROOT/input/theme--nordic.mmd"
run_node_cli --png --theme nordic "$CASE_ROOT/input/theme--nordic.mmd"
assert_svg_remote_free "$CASE_ROOT/input/theme--nordic.svg"
assert_jpeg "$CASE_ROOT/input/theme--nordic.jpg"
assert_png "$CASE_ROOT/input/theme--nordic.png"
assert_contains "$CASE_ROOT/input/theme--nordic.svg" '#2e3440'
assert_contains "$CASE_ROOT/input/theme--nordic.svg" '#d8dee9'
assert_contains "$CASE_ROOT/input/theme--nordic.svg" '#88c0d0'
assert_no_forbidden

"$NODE_BIN" "$TOOLS_DIR/render-mermaid-bm.mjs" \
  --input "$CASE_ROOT/input/theme--nordic.mmd" \
  --output "$CASE_ROOT/output/theme--nordic-bm.svg" \
  --theme nordic
assert_svg_remote_free "$CASE_ROOT/output/theme--nordic-bm.svg"
assert_contains "$CASE_ROOT/output/theme--nordic-bm.svg" '#2e3440'
assert_contains "$CASE_ROOT/output/theme--nordic-bm.svg" '#88c0d0'
assert_no_forbidden

# .mermaid extension: input--mermaid-extension.*
copy_fixture_as flowchart.mmd "$CASE_ROOT/input/input--mermaid-extension.mermaid"
run_node_cli "$CASE_ROOT/input/input--mermaid-extension.mermaid"
assert_svg_remote_free "$CASE_ROOT/input/input--mermaid-extension.svg"
assert_jpeg "$CASE_ROOT/input/input--mermaid-extension.jpg"
assert_no_forbidden

# ASCII/Unicode headless vendor.
copy_fixture_as ascii.mmd "$CASE_ROOT/input/ascii--unicode.mmd"
run_node_cli --ascii --ascii-mode unicode "$CASE_ROOT/input/ascii--unicode.mmd"
assert_text_file "$CASE_ROOT/input/ascii--unicode.txt"
assert_no_ansi "$CASE_ROOT/input/ascii--unicode.txt"
assert_svg_remote_free "$CASE_ROOT/input/ascii--unicode.svg"
assert_jpeg "$CASE_ROOT/input/ascii--unicode.jpg"
assert_no_forbidden

copy_fixture_as ascii.mmd "$CASE_ROOT/input/ascii--plain.mmd"
run_node_cli --ascii --ascii-mode ascii "$CASE_ROOT/input/ascii--plain.mmd"
assert_plain_ascii "$CASE_ROOT/input/ascii--plain.txt"
assert_no_ansi "$CASE_ROOT/input/ascii--plain.txt"
assert_svg_remote_free "$CASE_ROOT/input/ascii--plain.svg"
assert_jpeg "$CASE_ROOT/input/ascii--plain.jpg"
assert_no_forbidden

# Wrapper: wrapper--vendor.*
copy_fixture_as sequence.mmd "$CASE_ROOT/input/wrapper--vendor.mmd"
MMDC_RENDER_ENGINE=vendor "$WRAPPER" "$CASE_ROOT/input/wrapper--vendor.mmd"
assert_svg_remote_free "$CASE_ROOT/input/wrapper--vendor.svg"
assert_jpeg "$CASE_ROOT/input/wrapper--vendor.jpg"
assert_no_forbidden

echo "OK: vendor smoke"

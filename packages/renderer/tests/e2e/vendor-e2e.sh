#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/env.sh"
CASE_ROOT="$(new_case_dir e2e vendor)"
make_forbidden_path "$CASE_ROOT"

scenario_dir() {
  local name="$1"
  local dir="$CASE_ROOT/$name"
  mkdir -p "$dir/input" "$dir/output"
  printf '%s\n' "$dir"
}

# --output-dir: flowchart--output-dir.*
SCENARIO="$(scenario_dir output-dir)"
copy_fixture_as flowchart.mmd "$SCENARIO/input/flowchart--output-dir.mmd"
run_node_cli --output-dir "$SCENARIO/output" "$SCENARIO/input/flowchart--output-dir.mmd"
assert_svg "$SCENARIO/output/flowchart--output-dir.svg"
assert_jpeg "$SCENARIO/output/flowchart--output-dir.jpg"
assert_absent "$SCENARIO/input/flowchart--output-dir.svg"
assert_no_forbidden

# Tipos Mermaid suportados: sequence/state/class/er/xychart.
SCENARIO="$(scenario_dir supported-types)"
copy_fixture_as sequence.mmd "$SCENARIO/input/type--sequence.mmd"
copy_fixture_as state.mmd "$SCENARIO/input/type--state.mmd"
copy_fixture_as class.mmd "$SCENARIO/input/type--class.mmd"
copy_fixture_as er.mmd "$SCENARIO/input/type--er.mmd"
copy_fixture_as xychart.mmd "$SCENARIO/input/type--xychart.mmd"
run_node_cli --output-dir "$SCENARIO/output" "$SCENARIO/input"
for name in sequence state class er xychart; do
  assert_svg_remote_free "$SCENARIO/output/type--$name.svg"
  assert_jpeg "$SCENARIO/output/type--$name.jpg"
done
assert_no_forbidden

# Background/quality: background--quality.*
SCENARIO="$(scenario_dir background-quality)"
copy_fixture_as flowchart.mmd "$SCENARIO/input/background--quality.mmd"
run_node_cli --background "#123456" --quality 40 --output-dir "$SCENARIO/output" "$SCENARIO/input/background--quality.mmd"
assert_svg_remote_free "$SCENARIO/output/background--quality.svg"
assert_jpeg "$SCENARIO/output/background--quality.jpg"
assert_contains "$SCENARIO/output/background--quality.svg" '#123456'
assert_no_forbidden

# Offline themes with manifest: theme--dracula.* e theme--nordic.*
SCENARIO="$(scenario_dir theme-dracula)"
copy_fixture_as flowchart.mmd "$SCENARIO/input/theme--dracula.mmd"
run_node_cli --png --theme dracula --output-dir "$SCENARIO/output/rendered" --manifest "$SCENARIO/output/manifest--dracula.json" "$SCENARIO/input/theme--dracula.mmd"
assert_svg_remote_free "$SCENARIO/output/rendered/theme--dracula.svg"
assert_jpeg "$SCENARIO/output/rendered/theme--dracula.jpg"
assert_png "$SCENARIO/output/rendered/theme--dracula.png"
assert_contains "$SCENARIO/output/rendered/theme--dracula.svg" '#282a36'
assert_contains "$SCENARIO/output/rendered/theme--dracula.svg" '#bd93f9'
assert_manifest_summary "$SCENARIO/output/manifest--dracula.json" 1 1 0
assert_manifest_output_basename "$SCENARIO/output/manifest--dracula.json" 'theme--dracula.png'
assert_no_forbidden

SCENARIO="$(scenario_dir theme-nordic)"
copy_fixture_as flowchart.mmd "$SCENARIO/input/theme--nordic.mmd"
run_node_cli --png --theme nordic --output-dir "$SCENARIO/output/rendered" --manifest "$SCENARIO/output/manifest--nordic.json" "$SCENARIO/input/theme--nordic.mmd"
assert_svg_remote_free "$SCENARIO/output/rendered/theme--nordic.svg"
assert_jpeg "$SCENARIO/output/rendered/theme--nordic.jpg"
assert_png "$SCENARIO/output/rendered/theme--nordic.png"
assert_contains "$SCENARIO/output/rendered/theme--nordic.svg" '#2e3440'
assert_contains "$SCENARIO/output/rendered/theme--nordic.svg" '#88c0d0'
assert_manifest_summary "$SCENARIO/output/manifest--nordic.json" 1 1 0
assert_manifest_output_basename "$SCENARIO/output/manifest--nordic.json" 'theme--nordic.png'
assert_no_forbidden

# --input-root: nested/sequence--input-root.*
SCENARIO="$(scenario_dir input-root)"
copy_fixture_as sequence.mmd "$SCENARIO/input/nested/sequence--input-root.mmd"
run_node_cli --output-dir "$SCENARIO/output" --input-root "$SCENARIO/input" "$SCENARIO/input"
assert_svg "$SCENARIO/output/nested/sequence--input-root.svg"
assert_jpeg "$SCENARIO/output/nested/sequence--input-root.jpg"
assert_no_forbidden

# --flat-output success: sequence--flat-output.*
SCENARIO="$(scenario_dir flat-output)"
copy_fixture_as sequence.mmd "$SCENARIO/input/source/sequence--flat-output.mmd"
run_node_cli --output-dir "$SCENARIO/output" --flat-output "$SCENARIO/input"
assert_svg "$SCENARIO/output/sequence--flat-output.svg"
assert_jpeg "$SCENARIO/output/sequence--flat-output.jpg"
assert_no_forbidden

# --flat-output collision: error expected, no ambiguous output.
SCENARIO="$(scenario_dir flat-collision)"
copy_fixture_as flowchart.mmd "$SCENARIO/input/a/collision--same.mmd"
copy_fixture_as sequence.mmd "$SCENARIO/input/b/collision--same.mmd"
if run_node_cli --output-dir "$SCENARIO/output" --flat-output "$SCENARIO/input" >"$SCENARIO/collision.out" 2>"$SCENARIO/collision.err"; then
  echo "expected flat-output collision failure" >&2
  exit 1
fi
assert_contains "$SCENARIO/collision.err" 'collision'
assert_absent "$SCENARIO/output/collision--same.svg"
assert_no_forbidden

# --manifest success: manifest--success.json
SCENARIO="$(scenario_dir manifest-success)"
copy_fixture_as flowchart.mmd "$SCENARIO/input/manifest--success.mmd"
run_node_cli --output-dir "$SCENARIO/output/rendered" --manifest "$SCENARIO/output/manifest--success.json" "$SCENARIO/input/manifest--success.mmd"
assert_svg_remote_free "$SCENARIO/output/rendered/manifest--success.svg"
assert_jpeg "$SCENARIO/output/rendered/manifest--success.jpg"
assert_file "$SCENARIO/output/manifest--success.json"
assert_manifest_summary "$SCENARIO/output/manifest--success.json" 1 1 0
assert_manifest_output_basename "$SCENARIO/output/manifest--success.json" 'manifest--success.svg'
assert_no_forbidden

# Manifest with ASCII: manifest--ascii.json lists .txt.
SCENARIO="$(scenario_dir manifest-ascii)"
copy_fixture_as ascii.mmd "$SCENARIO/input/manifest--ascii.mmd"
run_node_cli --ascii --ascii-mode unicode --output-dir "$SCENARIO/output/rendered" --manifest "$SCENARIO/output/manifest--ascii.json" "$SCENARIO/input/manifest--ascii.mmd"
assert_svg_remote_free "$SCENARIO/output/rendered/manifest--ascii.svg"
assert_jpeg "$SCENARIO/output/rendered/manifest--ascii.jpg"
assert_text_file "$SCENARIO/output/rendered/manifest--ascii.txt"
assert_no_ansi "$SCENARIO/output/rendered/manifest--ascii.txt"
assert_file "$SCENARIO/output/manifest--ascii.json"
assert_manifest_summary "$SCENARIO/output/manifest--ascii.json" 1 1 0
assert_manifest_output_basename "$SCENARIO/output/manifest--ascii.json" 'manifest--ascii.txt'
assert_no_forbidden

# --manifest error: manifest--unsupported.json
SCENARIO="$(scenario_dir manifest-unsupported)"
copy_fixture_as unsupported.mmd "$SCENARIO/input/manifest--unsupported.mmd"
if run_node_cli --output-dir "$SCENARIO/output/rendered" --manifest "$SCENARIO/output/manifest--unsupported.json" "$SCENARIO/input/manifest--unsupported.mmd" >"$SCENARIO/unsupported.out" 2>"$SCENARIO/unsupported.err"; then
  echo "expected failure for unsupported type" >&2
  exit 1
fi
assert_file "$SCENARIO/output/manifest--unsupported.json"
assert_manifest_summary "$SCENARIO/output/manifest--unsupported.json" 1 0 1
assert_contains "$SCENARIO/unsupported.err" 'unsupported'
assert_no_forbidden

# Vendor absent: clear error, no fallback.
SCENARIO="$(scenario_dir vendor-missing)"
copy_fixture_as flowchart.mmd "$SCENARIO/input/vendor--missing.mmd"
MISSING_VENDOR="$SCENARIO/missing-vendor"
if MMDC_VENDOR_ONLY=1 MMDC_VENDOR_NODE_ROOT="$MISSING_VENDOR" run_node_cli "$SCENARIO/input/vendor--missing.mmd" >"$SCENARIO/missing-vendor.out" 2>"$SCENARIO/missing-vendor.err"; then
  echo "expected failure with missing vendor runtime" >&2
  exit 1
fi
assert_contains "$SCENARIO/missing-vendor.err" 'vendor'
assert_no_forbidden

# Unsupported type direct: clear error, no fallback.
SCENARIO="$(scenario_dir unsupported-direct)"
copy_fixture_as unsupported.mmd "$SCENARIO/input/unsupported--direct.mmd"
if run_node_cli "$SCENARIO/input/unsupported--direct.mmd" >"$SCENARIO/unsupported-direct.out" 2>"$SCENARIO/unsupported-direct.err"; then
  echo "expected unsupported type failure" >&2
  exit 1
fi
assert_contains "$SCENARIO/unsupported-direct.err" 'unsupported'
assert_no_forbidden

echo "OK: vendor e2e"

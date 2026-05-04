#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/env.sh"

CASE_ROOT="$(new_case_dir audit vendor-offline-runtime)"
make_forbidden_path "$CASE_ROOT"

GUARD="$TESTS_DIR/lib/network-guard.mjs"
SCANNER="$TESTS_DIR/lib/assert-offline-artifacts.mjs"
case " ${NODE_OPTIONS:-} " in
  *"--import=$GUARD"*)
    GUARDED_NODE_OPTIONS="${NODE_OPTIONS:-}" ;;
  *)
    GUARDED_NODE_OPTIONS="--import=$GUARD${NODE_OPTIONS:+ $NODE_OPTIONS}" ;;
esac

expect_blocked() {
  local label="$1"
  shift
  if NODE_OPTIONS="$GUARDED_NODE_OPTIONS" "$NODE_BIN" "$@" >"$CASE_ROOT/$label.out" 2>"$CASE_ROOT/$label.err"; then
    echo "expected offline block in: $label" >&2
    exit 1
  fi
  assert_contains "$CASE_ROOT/$label.err" 'OFFLINE_RUNTIME_BLOCKED'
}

expect_blocked fetch -e 'await fetch("https://example.invalid/runtime-download")'
expect_blocked http -e 'const http = await import("node:http"); http.request("http://example.invalid").end()'
expect_blocked child-process -e 'const cp = await import("node:child_process"); cp.spawnSync("npx", ["x"])'

copy_fixture_as flowchart.mmd "$CASE_ROOT/input/runtime--flowchart.mmd"
copy_fixture_as icons.mmd "$CASE_ROOT/input/runtime--icons.mmd"

NODE_OPTIONS="$GUARDED_NODE_OPTIONS" run_node_cli \
  --png \
  --ascii \
  --manifest "$CASE_ROOT/output/manifest--runtime-offline.json" \
  --output-dir "$CASE_ROOT/output" \
  "$CASE_ROOT/input"

assert_no_forbidden
assert_svg_remote_free "$CASE_ROOT/output/runtime--flowchart.svg"
assert_jpeg "$CASE_ROOT/output/runtime--flowchart.jpg"
assert_png "$CASE_ROOT/output/runtime--flowchart.png"
assert_text_file "$CASE_ROOT/output/runtime--flowchart.txt"
assert_file "$CASE_ROOT/output/manifest--runtime-offline.json"

"$NODE_BIN" "$SCANNER" "$CASE_ROOT/output"

mkdir -p "$CASE_ROOT/bad-output"
cat > "$CASE_ROOT/bad-output/cdn.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg">
  <script href="https://cdn.example.invalid/mermaid.js"></script>
</svg>
SVG

if "$NODE_BIN" "$SCANNER" "$CASE_ROOT/bad-output" >"$CASE_ROOT/scanner-bad.out" 2>"$CASE_ROOT/scanner-bad.err"; then
  echo "expected audit failure for generated URL/CDN" >&2
  exit 1
fi
assert_contains "$CASE_ROOT/scanner-bad.err" 'forbidden remote reference'

echo "OK: vendor offline runtime audit"

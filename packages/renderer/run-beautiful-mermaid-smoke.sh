#!/usr/bin/env bash
# Smoke validation for the optional beautiful-mermaid engine and icon pipeline.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/tests/fixtures/beautiful-mermaid"

if [[ ! -d "$FIXTURES_DIR" ]]; then
  echo "Fixtures not found: $FIXTURES_DIR" >&2
  exit 1
fi

check_rendered_artifacts() {
  local base_dir="$1"
  local profile="$2"

  local required=()
  case "$profile" in
    all)
      required=(flowchart state sequence class er xychart icons)
      ;;
    supported)
      required=(flowchart state sequence class er xychart icons)
      ;;
    flowchart-only)
      required=(flowchart)
      ;;
  esac

  for item in "${required[@]}"; do
    local base="$base_dir/$item"
    if [[ ! -s "${base}.svg" ]]; then
      echo "[ERROR] SVG missing: ${base}.svg" >&2
      return 1
    fi
    if [[ ! -s "${base}.jpg" ]]; then
      echo "[ERROR] JPEG missing: ${base}.jpg" >&2
      return 1
    fi
  done
}

run_case() {
  local label="$1"
  local profile="${2:-all}"
  local work_dir
  local -a extra_env=("${@:3}")

  work_dir="$(mktemp -d)"
  case "$profile" in
    supported)
      cp "$FIXTURES_DIR"/flowchart.mmd \
         "$FIXTURES_DIR"/state.mmd \
         "$FIXTURES_DIR"/sequence.mmd \
         "$FIXTURES_DIR"/class.mmd \
         "$FIXTURES_DIR"/er.mmd \
         "$FIXTURES_DIR"/xychart.mmd \
         "$FIXTURES_DIR"/icons.mmd \
         "$work_dir"/
      ;;
    flowchart-only)
      cp "$FIXTURES_DIR"/flowchart.mmd "$work_dir"/
      ;;
    all|*)
      cp "$FIXTURES_DIR"/*.mmd "$work_dir"/
      ;;
  esac

  echo ">>> Caso: $label"
  (
    cd "$work_dir"
    export MMDC_ICON_PREFIXES="fa,logos,lucide"
    export MMDC_RENDER_ENGINE=beautiful
    export MMDC_BM_THEME="tokyo-night"
    for kv in "${extra_env[@]}"; do
      export "$kv"
    done
    "$SCRIPT_DIR/render-mermaid-assets.sh" .
  )

  check_rendered_artifacts "$work_dir" "$profile"

  local icon_map_path="$work_dir/.mermaid-icon-map.json"
  node "$SCRIPT_DIR/build-mermaid-icon-registry.mjs" --prefixes fa,logos,lucide --output "$icon_map_path" "$work_dir"/*.mmd

  if [[ "${extra_env[*]}" == *"MMDC_ASCII=1"* ]]; then
    if [[ ! -f "$work_dir/flowchart.txt" || ! -s "$work_dir/flowchart.txt" ]]; then
      echo "[ERROR] Sidecar was not generated: $work_dir/flowchart.txt" >&2
      return 1
    fi
  fi

  # Verify icons were injected (no literal tokens in the final SVG)
  if [[ -f "$work_dir/icons.svg" ]]; then
    if ! python3 "$SCRIPT_DIR/inject-mermaid-icons.py" --icon-map "$icon_map_path" --check "$work_dir/icons.svg"; then
      echo "[ERROR] injection validation failed in: $work_dir/icons.svg" >&2
      return 1
    fi
  fi

  rm -rf "$work_dir"
}

run_case "beautiful (unicode, without ASCII)" supported
run_case "beautiful (unicode + sidecar)" supported MMDC_ASCII=1 MMDC_ASCII_ENGINE=beautiful MMDC_ASCII_MODE=unicode
run_case "beautiful (ascii)" supported MMDC_ASCII=1 MMDC_ASCII_ENGINE=beautiful MMDC_ASCII_MODE=ascii
run_case "beautiful (Shiki: github-dark)" supported MMDC_BM_SHIKI_THEME=github-dark

echo "OK: beautiful-mermaid smoke test completed."

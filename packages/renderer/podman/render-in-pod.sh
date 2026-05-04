#!/usr/bin/env bash
set -euo pipefail

IMAGE="${MERMAID_RENDER_IMAGE:-vaults-mermaid-render:vendor}"
INPUT_DIR=""
OUTPUT_DIR=""
POD_NAME="mermaid-render-$$-$(date +%s)"
KEEP_POD=0
RENDER_ARGS=()

usage() {
  cat <<'USAGE'
Usage: render-in-pod.sh --input DIR --output DIR [--image NAME[:TAG]] [--pod-name NAME] [--keep-pod] -- [renderer args]

Example:
  tools/mermaid/podman/render-in-pod.sh \
    --input /host/input \
    --output /host/output \
    -- --png --manifest /work/output/manifest.json /work/input

This script creates a Podman pod without network access and mounts:
  /work/input  -> --input (read-only)
  /work/output -> --output (read-write)

If renderer args do not include --output-dir or --input-root, this script injects:
  --output-dir /work/output --input-root /work/input
USAGE
}

abs_dir() {
  local dir="$1"
  mkdir -p "$dir"
  (cd "$dir" && pwd)
}

has_flag() {
  local flag="$1"; shift
  for arg in "$@"; do
    [[ "$arg" == "$flag" ]] && return 0
  done
  return 1
}

has_positional_input() {
  local skip_next=0
  for arg in "$@"; do
    if [[ "$skip_next" == "1" ]]; then
      skip_next=0
      continue
    fi
    case "$arg" in
      --width|--height|--background|--quality|--theme|--output-dir|--input-root|--manifest|--vendor-node-root|--ascii-mode|--ascii-output|--puppeteer-config|--css-file)
        skip_next=1 ;;
      --)
        continue ;;
      --*)
        continue ;;
      *)
        return 0 ;;
    esac
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      INPUT_DIR="${2:?missing value for --input}"; shift 2 ;;
    --output)
      OUTPUT_DIR="${2:?missing value for --output}"; shift 2 ;;
    --image)
      IMAGE="${2:?missing value for --image}"; shift 2 ;;
    --pod-name)
      POD_NAME="${2:?missing value for --pod-name}"; shift 2 ;;
    --keep-pod)
      KEEP_POD=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    --)
      shift; RENDER_ARGS=("$@"); break ;;
    *)
      echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$INPUT_DIR" || -z "$OUTPUT_DIR" ]]; then
  echo "--input and --output are required" >&2
  usage >&2
  exit 2
fi
if [[ ! -d "$INPUT_DIR" ]]; then
  echo "input is not a directory: $INPUT_DIR" >&2
  exit 2
fi

INPUT_DIR="$(abs_dir "$INPUT_DIR")"
OUTPUT_DIR="$(abs_dir "$OUTPUT_DIR")"

if ! has_flag --output-dir "${RENDER_ARGS[@]}"; then
  RENDER_ARGS=(--output-dir /work/output "${RENDER_ARGS[@]}")
fi
if ! has_flag --input-root "${RENDER_ARGS[@]}"; then
  RENDER_ARGS=(--input-root /work/input "${RENDER_ARGS[@]}")
fi
if ! has_positional_input "${RENDER_ARGS[@]}"; then
  RENDER_ARGS+=(/work/input)
fi

cleanup() {
  local status=$?
  if [[ "$KEEP_POD" != "1" ]]; then
    podman pod rm -f "$POD_NAME" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT

podman pod create --name "$POD_NAME" --network none >/dev/null
podman run --rm \
  --pod "$POD_NAME" \
  -v "$INPUT_DIR:/work/input:ro" \
  -v "$OUTPUT_DIR:/work/output:rw" \
  "$IMAGE" \
  "${RENDER_ARGS[@]}"

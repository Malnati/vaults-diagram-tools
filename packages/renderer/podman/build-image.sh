#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE="${MERMAID_RENDER_IMAGE:-vaults-mermaid-render:vendor}"
PULL_POLICY="missing"
NO_CACHE=0

usage() {
  cat <<'USAGE'
Usage: build-image.sh [--image NAME[:TAG]] [--pull always|missing|never] [--no-cache]

Cria imagem Podman do renderer Mermaid vendor Node-only.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE="${2:?missing value for --image}"; shift 2 ;;
    --pull)
      PULL_POLICY="${2:?missing value for --pull}"; shift 2 ;;
    --no-cache)
      NO_CACHE=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

build_args=(build --pull="$PULL_POLICY" -f "$TOOLS_DIR/container/Containerfile" -t "$IMAGE")
if [[ "$NO_CACHE" == "1" ]]; then
  build_args+=(--no-cache)
fi
build_args+=("$TOOLS_DIR")

podman "${build_args[@]}"
echo "OK: imagem $IMAGE"

#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/env.sh"
CASE_ROOT="$(new_case_dir smoke podman)"
"$TOOLS_DIR/podman/build-image.sh" --image "$IMAGE"
podman image exists "$IMAGE"
echo "OK: podman smoke"

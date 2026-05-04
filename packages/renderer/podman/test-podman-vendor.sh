#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
"$TOOLS_DIR/tests/smoke/podman-smoke.sh"
"$TOOLS_DIR/tests/e2e/podman-e2e.sh"

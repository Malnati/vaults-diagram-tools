#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/smoke/vendor-smoke.sh"
"$SCRIPT_DIR/e2e/vendor-e2e.sh"

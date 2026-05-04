#!/usr/bin/env bash
# Yesple benchmark to compare local batch rendering with beautiful-mermaid.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$SCRIPT_DIR/tests/fixtures/beautiful-mermaid/flowchart.mmd"
COUNT="${1:-100}"
RUN_DIR="$(mktemp -d)"

if [[ "$COUNT" -le 0 ]]; then
  echo "COUNT must be > 0" >&2
  exit 1
fi

if [[ ! -f "$FIXTURE" ]]; then
  echo "Fixture not found: $FIXTURE" >&2
  exit 1
fi

for i in $(seq 1 "$COUNT"); do
  cp "$FIXTURE" "$RUN_DIR/diagram-$i.mmd"
done

start_ns=$(date +%s%N)

MMDC_RENDER_ENGINE=beautiful \
MMDC_ICON_PREFIXES="" \
MMDC_BM_THEME=zinc-dark \
MMDC_BM_PADDING=28 \
"$SCRIPT_DIR/render-mermaid-assets.sh" "$RUN_DIR" >/dev/null

end_ns=$(date +%s%N)
elapsed_ms=$(( (end_ns - start_ns) / 1000000 ))
avg_ms=$((elapsed_ms / COUNT))

echo "Rendered $COUNT diagrams in ${elapsed_ms} ms (average ${avg_ms} ms/diagram)."
for ext in svg jpg txt; do
  count=$(find "$RUN_DIR" -maxdepth 1 -type f -name "*.${ext}" | wc -l | tr -d ' ')
  echo "  * .${ext}: ${count}"
done

#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/env.sh"
CASE_ROOT="$(new_case_dir e2e podman)"
copy_fixture_as flowchart.mmd "$CASE_ROOT/input/podman--volume-output.mmd"
copy_fixture_as style-classdef-inline.mmd "$CASE_ROOT/input/podman--theme-colors-font.mmd"
copy_fixture_as ascii.mmd "$CASE_ROOT/input/podman--ascii.mmd"
"$TOOLS_DIR/podman/build-image.sh" --image "$IMAGE"
"$TOOLS_DIR/podman/render-in-pod.sh" \
  --image "$IMAGE" \
  --input "$CASE_ROOT/input" \
  --output "$CASE_ROOT/output" \
  -- --png --ascii --ascii-mode unicode --background "#101827" --manifest /work/output/manifest--podman.json /work/input
assert_svg_remote_free "$CASE_ROOT/output/podman--volume-output.svg"
assert_jpeg "$CASE_ROOT/output/podman--volume-output.jpg"
assert_png "$CASE_ROOT/output/podman--volume-output.png"
assert_svg_remote_free "$CASE_ROOT/output/podman--theme-colors-font.svg"
assert_jpeg "$CASE_ROOT/output/podman--theme-colors-font.jpg"
assert_png "$CASE_ROOT/output/podman--theme-colors-font.png"
assert_contains "$CASE_ROOT/output/podman--theme-colors-font.svg" '#101827'
assert_contains "$CASE_ROOT/output/podman--theme-colors-font.svg" '#00ccff'
assert_text_file "$CASE_ROOT/output/podman--ascii.txt"
assert_file "$CASE_ROOT/output/manifest--podman.json"
assert_manifest_summary "$CASE_ROOT/output/manifest--podman.json" 3 3 0
assert_manifest_output_basename "$CASE_ROOT/output/manifest--podman.json" 'podman--volume-output.svg'
assert_manifest_output_basename "$CASE_ROOT/output/manifest--podman.json" 'podman--ascii.txt'

mkdir -p "$CASE_ROOT/theme-dracula-input" "$CASE_ROOT/theme-dracula-output"
copy_fixture_as flowchart.mmd "$CASE_ROOT/theme-dracula-input/podman--theme-dracula.mmd"
"$TOOLS_DIR/podman/render-in-pod.sh" \
  --image "$IMAGE" \
  --input "$CASE_ROOT/theme-dracula-input" \
  --output "$CASE_ROOT/theme-dracula-output" \
  -- --png --theme dracula --manifest /work/output/manifest--podman-dracula.json /work/input
assert_svg_remote_free "$CASE_ROOT/theme-dracula-output/podman--theme-dracula.svg"
assert_jpeg "$CASE_ROOT/theme-dracula-output/podman--theme-dracula.jpg"
assert_png "$CASE_ROOT/theme-dracula-output/podman--theme-dracula.png"
assert_contains "$CASE_ROOT/theme-dracula-output/podman--theme-dracula.svg" '#282a36'
assert_contains "$CASE_ROOT/theme-dracula-output/podman--theme-dracula.svg" '#bd93f9'
assert_manifest_summary "$CASE_ROOT/theme-dracula-output/manifest--podman-dracula.json" 1 1 0

mkdir -p "$CASE_ROOT/theme-nordic-input" "$CASE_ROOT/theme-nordic-output"
copy_fixture_as flowchart.mmd "$CASE_ROOT/theme-nordic-input/podman--theme-nordic.mmd"
"$TOOLS_DIR/podman/render-in-pod.sh" \
  --image "$IMAGE" \
  --input "$CASE_ROOT/theme-nordic-input" \
  --output "$CASE_ROOT/theme-nordic-output" \
  -- --png --theme nordic --manifest /work/output/manifest--podman-nordic.json /work/input
assert_svg_remote_free "$CASE_ROOT/theme-nordic-output/podman--theme-nordic.svg"
assert_jpeg "$CASE_ROOT/theme-nordic-output/podman--theme-nordic.jpg"
assert_png "$CASE_ROOT/theme-nordic-output/podman--theme-nordic.png"
assert_contains "$CASE_ROOT/theme-nordic-output/podman--theme-nordic.svg" '#2e3440'
assert_contains "$CASE_ROOT/theme-nordic-output/podman--theme-nordic.svg" '#88c0d0'
assert_manifest_summary "$CASE_ROOT/theme-nordic-output/manifest--podman-nordic.json" 1 1 0
echo "OK: podman e2e"

#!/usr/bin/env bash
# Shared environment setup for tools/mermaid tests.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TESTS_DIR="$TOOLS_DIR/tests"
FIXTURES_DIR="$TESTS_DIR/fixtures/beautiful-mermaid"
CLI="$TOOLS_DIR/render-mermaid-assets.mjs"
WRAPPER="$TOOLS_DIR/render-mermaid-assets.sh"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
OUTPUT_ROOT="${MERMAID_TEST_OUTPUT_ROOT:-$TESTS_DIR/output}"
IMAGE="${MERMAID_RENDER_IMAGE:-vaults-mermaid-render:vendor}"
NETWORK_GUARD="$TESTS_DIR/lib/network-guard.mjs"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "node not found" >&2
  exit 127
fi

source "$SCRIPT_DIR/assertions.sh"

if [[ "${MERMAID_TEST_NETWORK_GUARD:-1}" == "1" && -f "$NETWORK_GUARD" ]]; then
  case " ${NODE_OPTIONS:-} " in
    *"--import=$NETWORK_GUARD"*)
      ;;
    *)
      export NODE_OPTIONS="--import=$NETWORK_GUARD${NODE_OPTIONS:+ $NODE_OPTIONS}"
      ;;
  esac
fi

new_case_dir() {
  local suite="$1"
  local name="$2"
  local dir="$OUTPUT_ROOT/$suite/$name"
  rm -rf "$dir"
  mkdir -p "$dir/input" "$dir/output"
  printf '%s\n' "$dir"
}

copy_fixture_as() {
  local fixture="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp "$FIXTURES_DIR/$fixture" "$dest"
}

make_forbidden_path() {
  local root="$1"
  local fake_bin="$root/fake-bin"
  local log="$root/forbidden.log"
  mkdir -p "$fake_bin"
  : > "$log"
  for cmd in npx npm mmdc magick convert sips python3; do
    cat > "$fake_bin/$cmd" <<SH
#!/usr/bin/env bash
echo "FORBIDDEN:$cmd:\$*" >> "$log"
exit 96
SH
    chmod +x "$fake_bin/$cmd"
  done
  export FORBIDDEN_LOG="$log"
  export PATH="$fake_bin:$PATH"
}

assert_no_forbidden() {
  if [[ -s "${FORBIDDEN_LOG:-}" ]]; then
    echo "comando externo proibido chamado:" >&2
    cat "$FORBIDDEN_LOG" >&2
    return 1
  fi
}

run_node_cli() {
  PATH="$PATH" "$NODE_BIN" "$CLI" "$@"
}

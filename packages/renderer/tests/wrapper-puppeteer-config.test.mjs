import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WRAPPER = path.join(REPO_ROOT, "packages", "renderer", "render-mermaid-assets.sh");

async function writeExecutable(file, content) {
  await writeFile(file, content);
  await chmod(file, 0o755);
}

async function runWrapperWithFakeMmdc(envOverrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "vaults-wrapper-puppeteer-"));
  const fakeBin = path.join(root, "bin");
  const inputDir = path.join(root, "input");
  const argLog = path.join(root, "mmdc-args.log");
  await mkdir(fakeBin, { recursive: true });
  await mkdir(inputDir, { recursive: true });

  const mmdc = path.join(fakeBin, "mmdc");
  await writeExecutable(mmdc, `#!/usr/bin/env bash
set -euo pipefail
printf 'CALL\\n' >> "$MMDC_ARG_LOG"
for arg in "$@"; do
  printf '%s\\n' "$arg" >> "$MMDC_ARG_LOG"
done

out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

mkdir -p "$(dirname "$out")"
case "$out" in
  *.svg) printf '<svg xmlns="http://www.w3.org/2000/svg"></svg>' > "$out" ;;
  *.png) printf 'png' > "$out" ;;
  *) printf 'out' > "$out" ;;
esac
`);

  await writeExecutable(path.join(fakeBin, "magick"), `#!/usr/bin/env bash
set -euo pipefail
dst="\${@: -1}"
mkdir -p "$(dirname "$dst")"
printf 'jpg' > "$dst"
`);

  await writeExecutable(path.join(fakeBin, "python3"), `#!/usr/bin/env bash
set -euo pipefail
printf '0\\n'
`);

  await mkdir(path.join(root, "tmp"), { recursive: true });
  await writeFile(path.join(root, "tmp", "puppeteer-no-sandbox.json"), "{\"args\":[\"--no-sandbox\"]}\n");
  const input = path.join(inputDir, "diagram.mmd");
  await writeFile(input, "flowchart TD\n  A --> B\n");

  const env = {
    ...process.env,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    MMDC: mmdc,
    MMDC_ARG_LOG: argLog,
    MMDC_RENDER_BACKEND: "mmdc",
    MMDC_RENDER_ENGINE: "mmdc",
    MMDC_VENDOR_ONLY: "0",
    MMDC_ICON_PREFIXES: "",
    MMDC_EXTRA_ARGS: "",
  };
  delete env.PUPPETEER_CONFIG;
  delete env.PUPPETEER_CONFIG_FILE;
  delete env.PUPPETEER_CONFIG_DEFAULT;
  Object.assign(env, envOverrides);

  const result = spawnSync("bash", [WRAPPER, input], {
    cwd: root,
    env,
    encoding: "utf8",
  });

  let args = "";
  try {
    args = await readFile(argLog, "utf8");
  } catch (error) {
    if (result.status === 0) {
      throw error;
    }
  }
  return { result, args };
}

test("wrapper ignores cwd tmp Puppeteer config unless fallback env is explicit", async () => {
  const { result, args } = await runWrapperWithFakeMmdc();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(args, /^-p$/m);
  assert.doesNotMatch(args, /^tmp\/puppeteer-no-sandbox\.json$/m);
});

test("wrapper uses explicit PUPPETEER_CONFIG_DEFAULT when the file exists", async () => {
  const { result, args } = await runWrapperWithFakeMmdc({
    PUPPETEER_CONFIG_DEFAULT: "tmp/puppeteer-no-sandbox.json",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(args, /^-p$/m);
  assert.match(args, /^tmp\/puppeteer-no-sandbox\.json$/m);
});

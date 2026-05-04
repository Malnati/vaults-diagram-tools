import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

test("wrapper defaults to the vendor renderer without invoking mmdc", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vaults-wrapper-default-vendor-"));
  const fakeBin = path.join(root, "bin");
  const inputDir = path.join(root, "input");
  const mmdcLog = path.join(root, "mmdc.log");
  await mkdir(fakeBin, { recursive: true });
  await mkdir(inputDir, { recursive: true });

  await writeExecutable(path.join(fakeBin, "mmdc"), `#!/usr/bin/env bash
echo "mmdc invoked" >> "${mmdcLog}"
exit 42
`);

  const input = path.join(inputDir, "diagram.mmd");
  await writeFile(input, "flowchart TD\n  A --> B\n");

  const env = {
    ...process.env,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    MMDC_ICON_PREFIXES: "",
  };
  delete env.MMDC;
  delete env.MMDC_RENDER_BACKEND;
  delete env.MMDC_RENDER_ENGINE;
  delete env.MMDC_VENDOR_ONLY;

  const result = spawnSync("bash", [WRAPPER, input], {
    cwd: root,
    env,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  await access(path.join(inputDir, "diagram.svg"));
  await access(path.join(inputDir, "diagram.jpg"));
  await assert.rejects(readFile(mmdcLog, "utf8"), /ENOENT/);
});

test("beautiful mode does not fall back to mmdc unless explicitly enabled", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vaults-wrapper-beautiful-no-fallback-"));
  const fakeBin = path.join(root, "bin");
  const inputDir = path.join(root, "input");
  const mmdcLog = path.join(root, "mmdc.log");
  await mkdir(fakeBin, { recursive: true });
  await mkdir(inputDir, { recursive: true });

  await writeExecutable(path.join(fakeBin, "mmdc"), `#!/usr/bin/env bash
echo "mmdc invoked" >> "${mmdcLog}"
exit 42
`);
  await writeExecutable(path.join(fakeBin, "python3"), `#!/usr/bin/env bash
printf '0\\n'
`);

  const input = path.join(inputDir, "unsupported.mmd");
  await writeFile(input, "mindmap\n  root((Root))\n    child\n");

  const env = {
    ...process.env,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    MMDC_RENDER_ENGINE: "beautiful",
    MMDC_ICON_PREFIXES: "",
  };
  delete env.MMDC;
  delete env.MMDC_ALLOW_MMDC_FALLBACK;
  delete env.MMDC_VENDOR_ONLY;

  const result = spawnSync("bash", [WRAPPER, input], {
    cwd: root,
    env,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(mmdcLog, "utf8"), /ENOENT/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts", "generate-brand-assets.mjs");

function runBrand(args, options = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  });
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test("brand generator writes canonical assets and validates manifest hashes", async () => {
  const outDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vaults-brand-"));

  const generate = runBrand(["--output-dir", outDir]);
  assert.equal(generate.status, 0, generate.stderr || generate.stdout);

  const manifestPath = path.join(outDir, "brand-manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const byName = Object.fromEntries(manifest.assets.map((asset) => [asset.file, asset]));

  assert.equal(byName["social-preview.png"].width, 1280);
  assert.equal(byName["social-preview.png"].height, 640);
  assert.equal(byName["github-app-badge.png"].width, 200);
  assert.equal(byName["github-app-badge.png"].height, 200);
  assert.equal(byName["repository-banner.png"].width, 1600);
  assert.equal(byName["repository-banner.png"].height, 520);
  assert.equal(byName["logo.svg"].destination, "README, landing, package surfaces");

  assert.deepEqual(pngSize(path.join(outDir, "social-preview.png")), { width: 1280, height: 640 });
  assert.deepEqual(pngSize(path.join(outDir, "github-app-badge.png")), { width: 200, height: 200 });
  assert.ok(fs.statSync(path.join(outDir, "social-preview.png")).size < 1_000_000);
  assert.ok(fs.statSync(path.join(outDir, "github-app-badge.png")).size < 1_000_000);

  const check = runBrand(["--check", "--output-dir", outDir]);
  assert.equal(check.status, 0, check.stderr || check.stdout);

  await fsp.appendFile(path.join(outDir, "logo.svg"), "\n<!-- changed -->\n");
  const tampered = runBrand(["--check", "--output-dir", outDir]);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /hash mismatch: logo\.svg/);
});

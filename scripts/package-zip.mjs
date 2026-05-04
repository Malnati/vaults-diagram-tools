#!/usr/bin/env node
import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, "package.json"), "utf8"));
const dist = path.join(ROOT, "dist");
await fsp.mkdir(dist, { recursive: true });
const target = path.join(dist, `${pkg.name}-${pkg.version}.zip`);
if (fs.existsSync(target)) await fsp.rm(target);
const result = spawnSync("zip", [
  "-r",
  target,
  ".",
  "-x",
  ".git/*",
  "node_modules/*",
  "dist/*",
  "tmp/*",
  ".playwright-mcp/*",
  "*.tgz",
  "*.zip",
  "packages/renderer/tests/output/*",
], {
  cwd: ROOT,
  stdio: "inherit",
});
if (result.status !== 0) {
  throw new Error("zip command failed; install zip or use GitHub Actions release workflow");
}
console.log(target);

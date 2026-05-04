#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPkg = JSON.parse(await fsp.readFile(path.join(ROOT, "package.json"), "utf8"));
const vscodeDir = path.join(ROOT, "packaging", "vscode");
const vscodePkg = JSON.parse(await fsp.readFile(path.join(vscodeDir, "package.json"), "utf8"));

if (vscodePkg.version !== rootPkg.version) {
  throw new Error(`VS Code extension version ${vscodePkg.version} must match root package version ${rootPkg.version}`);
}
if (vscodePkg.dependencies?.[rootPkg.name] !== rootPkg.version) {
  throw new Error(`VS Code extension dependency ${rootPkg.name} must equal ${rootPkg.version}`);
}

const distDir = path.join(ROOT, "tmp", "vscode-runtime-pack");
const cacheDir = path.join(ROOT, "tmp", "npm-cache-vscode");
await fsp.rm(distDir, { recursive: true, force: true });
await fsp.mkdir(distDir, { recursive: true });
await fsp.mkdir(cacheDir, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: "inherit",
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

run("npm", ["pack", "--pack-destination", distDir]);
const tarball = path.join(distDir, `${rootPkg.name}-${rootPkg.version}.tgz`);
if (!fs.existsSync(tarball)) {
  throw new Error(`Expected npm pack output not found: ${tarball}`);
}

await fsp.rm(path.join(vscodeDir, "node_modules"), { recursive: true, force: true });
run("npm", [
  "--prefix",
  vscodeDir,
  "install",
  "--package-lock=false",
  "--no-save",
  "--cache",
  cacheDir,
  `@vscode/vsce@${vscodePkg.devDependencies["@vscode/vsce"]}`,
  `ovsx@${vscodePkg.devDependencies.ovsx}`,
  tarball,
]);

const installedPkg = JSON.parse(await fsp.readFile(path.join(vscodeDir, "node_modules", rootPkg.name, "package.json"), "utf8"));
if (installedPkg.version !== rootPkg.version) {
  throw new Error(`Installed ${rootPkg.name}@${installedPkg.version}; expected ${rootPkg.version}`);
}
console.log(`OK: installed VS Code extension dependencies with bundled ${rootPkg.name}@${rootPkg.version}`);

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.resolve(SCRIPT_DIR, "..");
const VENDOR_ROOT = path.resolve(process.env.MMDC_VENDOR_NODE_ROOT || path.join(TOOLS_DIR, "vendor", "node"));
const LICENSE_DISPLAY = new Map([
  ["SEE LICENSE IN README.md AND LICENSE", "DejaVu Fonts License + package README public-domain dedication"],
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      const rel = path.relative(VENDOR_ROOT, full);
      if (rel === "vendor-manifest.json" || rel === "THIRD_PARTY_LICENSES.md") continue;
      const data = fs.readFileSync(full);
      out.push({
        path: rel,
        bytes: data.length,
        sha256: crypto.createHash("sha256").update(data).digest("hex"),
      });
    }
  }
  return out;
}

function collectPackages(lock) {
  return Object.entries(lock.packages || {})
    .filter(([pkgPath]) => pkgPath.startsWith("node_modules/"))
    .map(([pkgPath, meta]) => ({
      name: pkgPath.replace(/^node_modules\//, ""),
      version: meta.version || "",
      license: LICENSE_DISPLAY.get(meta.license || "") || meta.license || "",
      resolved: meta.resolved || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const packageFile = path.join(VENDOR_ROOT, "package.json");
  const lockFile = path.join(VENDOR_ROOT, "package-lock.json");
  if (!fs.existsSync(packageFile) || !fs.existsSync(lockFile)) {
    throw new Error(`incomplete vendor runtime: ${VENDOR_ROOT}`);
  }
  const pkg = readJson(packageFile);
  const lock = readJson(lockFile);
  const packages = collectPackages(lock);
  const files = walk(VENDOR_ROOT).sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    generatedAt: new Date().toISOString(),
    runtime: "node >=20",
    package: pkg,
    packages,
    files,
  };
  fs.writeFileSync(path.join(VENDOR_ROOT, "vendor-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  let licenses = "# packages/renderer vendor licenses\n\nVendored dependencies for offline Node-only Mermaid rendering. Preserve upstream license files in this vendor tree and the root `THIRD_PARTY_NOTICES.md` in release artifacts.\n\n";
  for (const dep of packages) {
    licenses += `- ${dep.name}@${dep.version}: ${dep.license || "UNKNOWN"}\n`;
  }
  fs.writeFileSync(path.join(VENDOR_ROOT, "THIRD_PARTY_LICENSES.md"), licenses);
  console.log(`OK: vendor manifest written to ${VENDOR_ROOT}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

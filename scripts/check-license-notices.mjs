#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTICE_FILE = path.join(ROOT, "THIRD_PARTY_NOTICES.md");
const LOCK_FILE = path.join(ROOT, "package-lock.json");
const PACKAGE_FILE = path.join(ROOT, "package.json");

const LICENSE_DISPLAY = new Map([
  ["SEE LICENSE IN README.md AND LICENSE", "DejaVu Fonts License + package README public-domain dedication"],
]);

const KNOWN_LICENSES = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "OFL-1.1",
  "MPL-2.0",
  "EPL-2.0",
  "DejaVu Fonts License + package README public-domain dedication",
]);


const DIRECT_CREDITS = new Map([
  ["@iconify-json/fa", "Font Awesome 4 via Iconify JSON"],
  ["@iconify-json/logos", "SVG Logos by Gil Barbara via Iconify JSON"],
  ["@iconify-json/lucide", "Lucide Icons and contributors via Iconify JSON"],
  ["beautiful-mermaid", "Craft Docs / beautiful-mermaid maintainers"],
  ["dejavu-fonts-ttf", "DejaVu Fonts and Bitstream Vera Fonts authors"],
]);

const DIRECT_PURPOSES = new Map([
  ["@iconify-json/fa", "Offline Font Awesome 4 Iconify JSON icons for Mermaid icon injection."],
  ["@iconify-json/logos", "Offline SVG Logos Iconify JSON icons for Mermaid icon injection."],
  ["@iconify-json/lucide", "Offline Lucide Iconify JSON icons for Mermaid icon injection."],
  ["@modelcontextprotocol/sdk", "MCP stdio server APIs and schemas."],
  ["@resvg/resvg-wasm", "WASM SVG rasterization path for JPEG/PNG output."],
  ["beautiful-mermaid", "Mermaid parsing/rendering and built-in themes, including Dracula palette support."],
  ["dejavu-fonts-ttf", "Bundled TrueType fonts for offline SVG/JPEG rendering."],
  ["jpeg-js", "JPEG encoding for raster output."],
  ["shiki", "Syntax/theme infrastructure used by beautiful-mermaid compatibility paths."],
  ["zod", "Input validation for MCP tool schemas."],
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function asText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if (value.name && value.email) return `${value.name} <${value.email}>`;
    if (value.name) return value.name;
    if (value.url) return value.url;
    return JSON.stringify(value);
  }
  return String(value);
}

function repoUrl(repository) {
  if (!repository) return "";
  const raw = typeof repository === "string" ? repository : repository.url || "";
  return raw
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

function packageMetadata(name) {
  const pkgPath = path.join(ROOT, "node_modules", ...name.split("/"), "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  return readJson(pkgPath);
}

function displayLicense(license) {
  return LICENSE_DISPLAY.get(license) || license || "UNKNOWN";
}

function collectPackages() {
  const lock = readJson(LOCK_FILE);
  const packages = [];
  for (const [location, meta] of Object.entries(lock.packages || {})) {
    if (!location.startsWith("node_modules/")) continue;
    const name = location.replace(/^node_modules\//, "");
    const pkg = packageMetadata(name);
    const license = displayLicense(meta.license || pkg.license);
    packages.push({
      name,
      version: meta.version || pkg.version || "",
      license,
      author: asText(pkg.author || pkg.contributors),
      source: pkg.homepage || repoUrl(pkg.repository) || meta.resolved || "",
      purpose: DIRECT_PURPOSES.get(name) || "Transitive runtime dependency.",
      direct: Boolean(readJson(PACKAGE_FILE).dependencies?.[name]),
    });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function markdownTable(rows, columns) {
  const escape = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
  let out = `| ${columns.map((c) => c.title).join(" | ")} |\n`;
  out += `| ${columns.map(() => "---").join(" | ")} |\n`;
  for (const row of rows) {
    out += `| ${columns.map((c) => escape(row[c.key])).join(" | ")} |\n`;
  }
  return out;
}

function generateNotices() {
  const rootPkg = readJson(PACKAGE_FILE);
  const packages = collectPackages();
  const summary = [...packages.reduce((map, dep) => map.set(dep.license, (map.get(dep.license) || 0) + 1), new Map())]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([license, count]) => ({ license, count }));
  const unknown = packages.filter((dep) => !KNOWN_LICENSES.has(dep.license));
  if (unknown.length > 0) {
    throw new Error(`Unknown or unreviewed license(s): ${unknown.map((dep) => `${dep.name}@${dep.version}:${dep.license}`).join(", ")}`);
  }

  const direct = packages.filter((dep) => dep.direct).map((dep) => ({
    package: `${dep.name}@${dep.version}`,
    license: dep.license,
    credit: DIRECT_CREDITS.get(dep.name) || dep.author || dep.source,
    purpose: dep.purpose,
  }));
  const all = packages.map((dep) => ({
    package: `${dep.name}@${dep.version}`,
    license: dep.license,
    source: dep.source,
  }));

  return `# Third-party notices\n\n` +
    `This project is licensed under MIT. This notice records third-party runtime dependency credits and license identifiers for ${rootPkg.name}@${rootPkg.version}.\n\n` +
    `Generated from \`package-lock.json\` and installed package metadata. Refresh with \`npm run license:generate\`; verify with \`npm run license:check\`.\n\n` +
    `This file supports release compliance and attribution review. It is not legal advice; release owners should still review license obligations for their distribution channel.\n\n` +
    `## Project credits\n\n` +
    `- Project author and maintainer: ${rootPkg.author || "Malnati"}.\n` +
    `- Package lineage: extracted from the Vaults diagram tooling into this standalone portable package.\n` +
    `- Dracula-colored diagrams in \`docs/assets/diagrams/\` are generated by this package using the Dracula palette exposed by \`beautiful-mermaid\`; the Dracula Theme project is MIT licensed.\n` +
    `- Logo/icon data used by Mermaid icon injection comes from Iconify JSON packages and their upstream icon sets; see direct dependency credits below.\n\n` +
    `## Direct dependency credits\n\n` +
    markdownTable(direct, [
      { title: "Package", key: "package" },
      { title: "License", key: "license" },
      { title: "Credit / source", key: "credit" },
      { title: "Use in this project", key: "purpose" },
    ]) +
    `\n## License summary\n\n` +
    markdownTable(summary, [
      { title: "License", key: "license" },
      { title: "Dependency count", key: "count" },
    ]) +
    `\n## Compliance notes\n\n` +
    `- Preserve this file, \`LICENSE\`, and upstream license files in release artifacts.\n` +
    `- The npm dependency graph includes permissive licenses plus MPL-2.0/EPL-2.0 runtime dependencies. This project does not patch those upstream packages in-tree; if that changes, publish the corresponding source changes according to the upstream license.\n` +
    `- DejaVu fonts carry their own font license in the upstream package plus a package README public-domain dedication for wrapper files.\n` +
    `- SVG Logos is CC0-1.0, but individual logos may still be trademarks of their owners; do not imply endorsement.\n` +
    `- Icon and theme names are credited for attribution and transparency; they are not project endorsements.\n\n` +
    `## Full dependency license index\n\n` +
    markdownTable(all, [
      { title: "Package", key: "package" },
      { title: "License", key: "license" },
      { title: "Source", key: "source" },
    ]);
}

function main() {
  const mode = process.argv.includes("--check") ? "check" : "write";
  const expected = generateNotices();
  if (mode === "check") {
    const current = fs.existsSync(NOTICE_FILE) ? fs.readFileSync(NOTICE_FILE, "utf8") : "";
    if (current !== expected) {
      console.error("THIRD_PARTY_NOTICES.md is out of date. Run npm run license:generate.");
      process.exit(1);
    }
    console.log("OK: third-party notices are current and licenses are recognized.");
    return;
  }
  fs.writeFileSync(NOTICE_FILE, expected);
  console.log(`OK: wrote ${path.relative(ROOT, NOTICE_FILE)}`);
}

main();

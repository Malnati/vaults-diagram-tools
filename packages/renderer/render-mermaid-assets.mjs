#!/usr/bin/env node
/**
 * Node-first Mermaid renderer for vaults-diagram-tools.
 *
 * Prefers vendored JS/WASM dependencies under packages/renderer/vendor/node,
 * and can fall back to normal npm dependency resolution when installed as a package.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveThemeDescriptor } from "./theme-resolver.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function isCliEntryPoint() {
  if (!process.argv[1]) return false;
  const argvPath = fs.realpathSync(process.argv[1]);
  return import.meta.url === pathToFileURL(argvPath).href;
}
const REQUIRE = createRequire(import.meta.url);
const DEFAULT_VENDOR_ROOT = path.join(SCRIPT_DIR, "vendor", "node");
const DEFAULT_ICON_PREFIXES = ["fa", "logos", "lucide"];
const ICON_PACK_PATHS = {
  fa: ["@iconify-json", "fa", "icons.json"],
  logos: ["@iconify-json", "logos", "icons.json"],
  lucide: ["@iconify-json", "lucide", "icons.json"],
};
const VENDOR_FONT_PATHS = [
  ["dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf"],
  ["dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf"],
  ["dejavu-fonts-ttf", "ttf", "DejaVuSans-Oblique.ttf"],
  ["dejavu-fonts-ttf", "ttf", "DejaVuSans-BoldOblique.ttf"],
  ["dejavu-fonts-ttf", "ttf", "DejaVuSerif.ttf"],
  ["dejavu-fonts-ttf", "ttf", "DejaVuSansMono.ttf"],
];
const SUPPORTED_VENDOR_DIAGRAMS = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "stateDiagram-v2",
  "stateDiagram",
  "classDiagram",
  "erDiagram",
  "xychart-beta",
];

function usage() {
  console.log(`Usage: render-mermaid-assets.mjs [options] <file(.mmd|.mermaid)|directory> [...]

Render with the vendored JS/WASM runtime, without npm/npx/mmdc/python/ImageMagick.

Options:
  --width N                 Accepted for compatibility; the vendor engine calculates the SVG.
  --height N                Accepted for compatibility; the vendor engine calculates the SVG.
  --background COLOR          SVG/JPEG background. Default: white.
  --quality N               JPEG quality. Default: 92.
  --raster-scale N          PNG/JPEG scale through WASM. Default: 2.
  --theme NAME              beautiful-mermaid theme. Default: default.
  --png                     Also write <name>.png.
  --ascii                   Also write <name>.txt with text output.
  --ascii-mode unicode|ascii Text sidecar charset. Default: unicode.
  --ascii-output FILE       Path to the text sidecar; allowed only with 1 input.
  --ascii-coords            Also write an informational <name>.coords.txt file.
  --output-dir DIR          Write artifacts to DIR instead of next to the source.
  --input-root DIR          Base path for preserving the relative tree in --output-dir.
  --flat-output             Write all artifacts directly into --output-dir.
  --manifest FILE           Write a JSON report of inputs, outputs, and errors.
  --vendor-node-root DIR    vendor/node directory. Default: packages/renderer/vendor/node.
  -h, --help                Mostra esta ajuda.

Variables:
  MMDC_VENDOR_NODE_ROOT     Same as --vendor-node-root.
  MMDC_VENDOR_ONLY=1        Do not attempt fallback outside the vendor runtime.
  MMDC_ICON_PREFIXES        Icon prefixes. Default: fa,logos,lucide.
  MMDC_ASCII_PADDING_X      ASCII sidecar horizontal spacing. Default: 5.
  MMDC_ASCII_PADDING_Y      ASCII sidecar vertical spacing. Default: 5.
  MMDC_ASCII_BORDER_PADDING Inner box padding for the sidecar. Default: 1.
  MMDC_RASTER_SCALE         Same as --raster-scale. Default: 2.
  MMDC_BM_*                 Compatible beautiful-mermaid theme options.
`);
}

function parseArgs(argv) {
  const opts = {
    width: 2400,
    height: 1800,
    background: process.env.MMDC_BM_BG || "white",
    backgroundExplicit: Boolean(process.env.MMDC_BM_BG),
    quality: 92,
    rasterScale: Number(process.env.MMDC_RASTER_SCALE || 2),
    theme: "default",
    png: false,
    ascii: false,
    asciiMode: "unicode",
    asciiOutput: null,
    asciiCoords: false,
    outputDir: null,
    inputRoot: null,
    flatOutput: false,
    manifest: null,
    vendorRoot: process.env.MMDC_VENDOR_NODE_ROOT || DEFAULT_VENDOR_ROOT,
    inputs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--width") {
      opts.width = parseNumber(argv[++i], "width");
      continue;
    }
    if (arg === "--height") {
      opts.height = parseNumber(argv[++i], "height");
      continue;
    }
    if (arg === "--background") {
      opts.background = requiredValue(argv[++i], "background");
      opts.backgroundExplicit = true;
      continue;
    }
    if (arg === "--quality") {
      opts.quality = parseNumber(argv[++i], "quality");
      continue;
    }
    if (arg === "--raster-scale") {
      opts.rasterScale = parseNumber(argv[++i], "raster-scale");
      continue;
    }
    if (arg === "--theme") {
      opts.theme = requiredValue(argv[++i], "theme");
      continue;
    }
    if (arg === "--output-dir") {
      opts.outputDir = path.resolve(requiredValue(argv[++i], "output-dir"));
      continue;
    }
    if (arg === "--input-root") {
      opts.inputRoot = path.resolve(requiredValue(argv[++i], "input-root"));
      continue;
    }
    if (arg === "--flat-output") {
      opts.flatOutput = true;
      continue;
    }
    if (arg === "--manifest") {
      opts.manifest = path.resolve(requiredValue(argv[++i], "manifest"));
      continue;
    }
    if (arg === "--vendor-node-root") {
      opts.vendorRoot = path.resolve(requiredValue(argv[++i], "vendor-node-root"));
      continue;
    }
    if (arg === "--png") {
      opts.png = true;
      continue;
    }
    if (arg === "--ascii") {
      opts.ascii = true;
      continue;
    }
    if (arg === "--ascii-mode") {
      opts.asciiMode = requiredValue(argv[++i], "ascii-mode").toLowerCase();
      continue;
    }
    if (arg === "--ascii-output") {
      opts.asciiOutput = path.resolve(requiredValue(argv[++i], "ascii-output"));
      continue;
    }
    if (arg === "--ascii-coords") {
      opts.asciiCoords = true;
      continue;
    }
    if (arg === "--puppeteer-config" || arg === "--css-file") {
      i += 1; // accepted for shell-wrapper compatibility; not used by vendor mode.
      continue;
    }
    if (arg === "--") {
      opts.inputs.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option in vendor mode: ${arg}`);
    }
    opts.inputs.push(arg);
  }

  if (opts.inputs.length === 0) opts.inputs.push(".");
  opts.vendorRoot = path.resolve(opts.vendorRoot);
  opts.quality = Math.max(1, Math.min(100, opts.quality));
  if (!Number.isFinite(opts.rasterScale) || opts.rasterScale <= 0) {
    throw new Error("--raster-scale must be a number greater than zero.");
  }
  if (!["unicode", "ascii"].includes(opts.asciiMode)) {
    throw new Error("--ascii-mode accepts only unicode or ascii.");
  }
  return opts;
}

function requiredValue(value, name) {
  if (!value) throw new Error(`missing value for --${name}`);
  return value;
}

function parseNumber(value, name) {
  const num = Number(requiredValue(value, name));
  if (!Number.isFinite(num)) throw new Error(`invalid value for --${name}: ${value}`);
  return num;
}

async function collectMermaidFiles(inputs) {
  const files = [];
  async function visit(current) {
    const stat = await fsp.stat(current);
    if (stat.isDirectory()) {
      const entries = await fsp.readdir(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === "vendor" || entry.name.startsWith(".")) continue;
        await visit(path.join(current, entry.name));
      }
      return;
    }
    if (stat.isFile() && (current.endsWith(".mmd") || current.endsWith(".mermaid"))) {
      files.push(path.resolve(current));
    }
  }
  for (const input of inputs) await visit(path.resolve(input));
  return files.sort((a, b) => a.localeCompare(b));
}

function vendorFile(vendorRoot, ...parts) {
  return path.join(vendorRoot, "node_modules", ...parts);
}

function vendorRootAvailable(vendorRoot) {
  const packageFile = path.join(vendorRoot, "package.json");
  const nodeModules = path.join(vendorRoot, "node_modules");
  return fs.existsSync(packageFile) && fs.existsSync(nodeModules);
}

function resolveRuntimeFile(runtime, packageName, ...parts) {
  if (runtime.vendorAvailable) {
    return vendorFile(runtime.vendorRoot, packageName, ...parts);
  }
  const spec = [packageName, ...parts].join("/");
  try {
    return REQUIRE.resolve(spec);
  } catch (error) {
    throw new Error(
      `missing dependency (${spec}). Run 'npm install' or 'npm run vendor:refresh' in vaults-diagram-tools. Detail: ${error.message}`,
    );
  }
}

async function importRuntime(runtime, label, packageName, ...parts) {
  if (packageName === "beautiful-mermaid") {
    const patched = path.join(SCRIPT_DIR, "vendor-patches", "beautiful-mermaid", "dist", "index.js");
    if (fs.existsSync(patched)) return import(pathToFileURL(patched).href);
  }
  if (!runtime.vendorAvailable) {
    const spec = runtimeImportSpec(packageName, ...parts);
    try {
      return import(spec);
    } catch (error) {
      throw new Error(`missing dependency (${label}/${spec}). Run 'npm install' or 'npm run vendor:refresh' in vaults-diagram-tools. Detail: ${error.message}`);
    }
  }
  const target = resolveRuntimeFile(runtime, packageName, ...parts);
  if (!fs.existsSync(target)) {
    throw new Error(`missing dependency (${label}): ${target}`);
  }
  return import(pathToFileURL(target).href);
}

function runtimeImportSpec(packageName, ...parts) {
  if (packageName === "beautiful-mermaid") return "beautiful-mermaid";
  if (packageName === "@resvg" && parts[0] === "resvg-wasm") return "@resvg/resvg-wasm";
  if (packageName === "jpeg-js") return "jpeg-js";
  return [packageName, ...parts].join("/");
}

async function loadJson(file) {
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

async function loadRuntime(opts) {
  const runtime = {
    vendorRoot: opts.vendorRoot,
    vendorAvailable: vendorRootAvailable(opts.vendorRoot),
  };
  if (!runtime.vendorAvailable && process.env.MMDC_VENDOR_ONLY === "1") {
    throw new Error(
      `vendor node root unavailable: ${opts.vendorRoot}. Run 'npm run vendor:refresh' in vaults-diagram-tools and distribute packages/renderer/vendor/node.`,
    );
  }
  const beautiful = await importRuntime(runtime, "beautiful-mermaid", "beautiful-mermaid", "dist", "index.js");
  const resvg = await importRuntime(runtime, "@resvg/resvg-wasm", "@resvg", "resvg-wasm", "index.mjs");
  const jpeg = await importRuntime(runtime, "jpeg-js", "jpeg-js", "index.js");
  const wasmFile = resolveRuntimeFile(runtime, "@resvg", "resvg-wasm", "index_bg.wasm");
  await resvg.initWasm(fs.readFileSync(wasmFile));
  const packs = await loadIconPacks(runtime, parseIconPrefixes());
  const fontBuffers = loadVendorFontBuffers(runtime);
  return { beautiful, resvg, jpeg, packs, fontBuffers, runtimeMode: runtime.vendorAvailable ? "vendor" : "node_modules" };
}

function parseIconPrefixes() {
  const raw = process.env.MMDC_ICON_PREFIXES || DEFAULT_ICON_PREFIXES.join(",");
  return [...new Set(raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))];
}

async function loadIconPacks(runtime, prefixes) {
  const packs = new Map();
  for (const prefix of prefixes) {
    const parts = ICON_PACK_PATHS[prefix];
    if (!parts) continue;
    let file;
    try {
      file = resolveRuntimeFile(runtime, ...parts);
    } catch (error) {
      if (process.env.MMDC_STRICT_ICON_INJECTION === "1") throw error;
      continue;
    }
    if (!fs.existsSync(file)) {
      if (process.env.MMDC_STRICT_ICON_INJECTION === "1") {
        throw new Error(`icon pack missing for prefix ${prefix}: ${file}`);
      }
      continue;
    }
    packs.set(prefix, await loadJson(file));
  }
  return packs;
}

function loadVendorFontBuffers(runtime) {
  const files = VENDOR_FONT_PATHS.map((parts) => resolveRuntimeFile(runtime, ...parts));
  const found = files.filter((file) => fs.existsSync(file));
  if (found.length === 0) {
    throw new Error(
      `vendor assets missing for rasterization: ${files[0]}. Run 'npm install' or 'npm run vendor:refresh' in vaults-diagram-tools.`,
    );
  }
  return found.map((file) => fs.readFileSync(file));
}

function detectDiagramType(source) {
  const line = source
    .split(/\r?\n/)
    .map((x) => x.trim())
    .find((x) => x && !x.startsWith("%%"));
  return line ? line.split(/\s+/)[0] : "";
}

function assertSupported(source, file) {
  const type = detectDiagramType(source);
  const supported = SUPPORTED_VENDOR_DIAGRAMS.some((candidate) => type === candidate);
  if (!supported) {
    throw new Error(`tipo Mermaid unsupported pelo vendor Node-only (${type || "unknown"}) em ${file}. Use MMDC_RENDER_ENGINE=mmdc for full compatibility.`);
  }
}

function colorOptions(opts, themeCatalog = {}) {
  const theme = opts.theme && opts.theme !== "default" ? opts.theme : process.env.MMDC_BM_THEME || "default";
  const themeColors = resolveThemeDescriptor(theme, themeCatalog);
  if (theme !== "default" && !themeColors) {
    throw new Error(`Unknown theme in vendor mode: ${theme}`);
  }
  const base = { ...(themeColors || {}) };
  if (opts.backgroundExplicit || !themeColors) base.bg = cssColor(opts.background);
  for (const [key, envName] of [
    ["fg", "MMDC_BM_FG"],
    ["line", "MMDC_BM_LINE"],
    ["accent", "MMDC_BM_ACCENT"],
    ["muted", "MMDC_BM_MUTED"],
    ["surface", "MMDC_BM_SURFACE"],
    ["border", "MMDC_BM_BORDER"],
  ]) {
    const value = process.env[envName];
    if (value !== undefined && value !== "") base[key] = value;
  }
  base.font = process.env.MMDC_BM_FONT || "Inter";
  base.padding = Number(process.env.MMDC_BM_PADDING || 40);
  base.transparent = process.env.MMDC_BM_TRANSPARENT === "1";
  base.interactive = process.env.MMDC_BM_INTERACTIVE === "1";
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined && value !== ""));
}

function cssColor(value) {
  if (!value || value === "white") return "#FFFFFF";
  if (value === "transparent") return "transparent";
  return value;
}

function stripRemoteReferences(svg) {
  return svg
    .replace(/\s*@import\s+url\([^)]*\);?/g, "")
    .replace(/\s*@import\s+["'][^"']+["'];?/g, "");
}

function stripCssComments(value) {
  return String(value).replace(/\/\*[\s\S]*?\*\//g, "");
}

function splitTopLevel(value, separator = ",") {
  const parts = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && value[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0 && ch === separator) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function splitFirstTopLevelComma(value) {
  const parts = splitTopLevel(value, ",");
  if (parts.length <= 1) return [parts[0]?.trim() || "", ""];
  return [parts[0].trim(), parts.slice(1).join(", ").trim()];
}

function findMatchingParen(value, openIndex) {
  let depth = 0;
  let quote = "";
  for (let i = openIndex; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && value[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function replaceCssFunctionCalls(value, functionName, replacer) {
  const needle = `${functionName}(`;
  let output = "";
  let offset = 0;
  while (offset < value.length) {
    const start = value.indexOf(needle, offset);
    if (start === -1) {
      output += value.slice(offset);
      break;
    }
    const open = start + functionName.length;
    const close = findMatchingParen(value, open);
    if (close === -1) throw new Error(`Invalid CSS: ${functionName}( without closing delimiter.`);
    output += value.slice(offset, start);
    output += replacer(value.slice(open + 1, close).trim());
    offset = close + 1;
  }
  return output;
}

function parseCustomPropertiesFromDeclarations(text, variables) {
  const declarations = stripCssComments(text);
  for (const match of declarations.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);?/g)) {
    variables.set(match[1], match[2].trim());
  }
}

function collectCssVariables(svg) {
  const variables = new Map();
  for (const match of svg.matchAll(/<svg\b[^>]*\sstyle="([^"]*)"/gi)) {
    parseCustomPropertiesFromDeclarations(match[1], variables);
  }
  for (const match of svg.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    parseCustomPropertiesFromDeclarations(match[1], variables);
  }
  return variables;
}

function parseHexColor(value) {
  const hex = value.replace(/^#/, "").trim();
  if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-f]/i.test(hex)) return null;
  const expand = (text) => text.split("").map((ch) => ch + ch).join("");
  const full = hex.length === 3 || hex.length === 4 ? expand(hex) : hex;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const a = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseRgbComponent(value) {
  const text = value.trim();
  if (text.endsWith("%")) return Math.round((Number.parseFloat(text) / 100) * 255);
  return Number.parseFloat(text);
}

function parseCssColor(value) {
  const text = String(value).trim();
  const named = {
    black: { r: 0, g: 0, b: 0, a: 1 },
    white: { r: 255, g: 255, b: 255, a: 1 },
    transparent: { r: 0, g: 0, b: 0, a: 0 },
    red: { r: 255, g: 0, b: 0, a: 1 },
    green: { r: 0, g: 128, b: 0, a: 1 },
    blue: { r: 0, g: 0, b: 255, a: 1 },
  };
  if (text.startsWith("#")) {
    const parsed = parseHexColor(text);
    if (parsed) return parsed;
  }
  const rgb = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = splitTopLevel(rgb[1], ",");
    if (parts.length >= 3) {
      return {
        r: parseRgbComponent(parts[0]),
        g: parseRgbComponent(parts[1]),
        b: parseRgbComponent(parts[2]),
        a: parts[3] === undefined ? 1 : Number.parseFloat(parts[3]),
      };
    }
  }
  const lower = text.toLowerCase();
  if (named[lower]) return named[lower];
  throw new Error(`Unsupported CSS color-mix color: ${value}`);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function formatCssColor(color) {
  const r = clampByte(color.r);
  const g = clampByte(color.g);
  const b = clampByte(color.b);
  const a = Math.max(0, Math.min(1, Number.isFinite(color.a) ? color.a : 1));
  if (a < 0.999) {
    const alpha = Number(a.toFixed(4)).toString();
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function parseColorStop(value, defaultPercent) {
  const text = value.trim();
  const match = text.match(/^(.+?)\s+([0-9.]+)%$/);
  if (!match) return { color: parseCssColor(text), percent: defaultPercent };
  return { color: parseCssColor(match[1]), percent: Number.parseFloat(match[2]) };
}

function mixCssColors(first, firstPercent, second, secondPercent) {
  const total = firstPercent + secondPercent;
  const firstWeight = total > 0 ? firstPercent / total : 0.5;
  const secondWeight = total > 0 ? secondPercent / total : 0.5;
  return {
    r: first.r * firstWeight + second.r * secondWeight,
    g: first.g * firstWeight + second.g * secondWeight,
    b: first.b * firstWeight + second.b * secondWeight,
    a: first.a * firstWeight + second.a * secondWeight,
  };
}

function resolveColorMix(content) {
  const match = content.match(/^in\s+srgb\s*,\s*([\s\S]+)$/i);
  if (!match) throw new Error(`CSS color-mix unsupported: color-mix(${content})`);
  const stops = splitTopLevel(match[1], ",");
  if (stops.length !== 2) throw new Error(`CSS color-mix requires two colors: color-mix(${content})`);
  const first = parseColorStop(stops[0], 50);
  const secondDefault = Number.isFinite(first.percent) ? 100 - first.percent : 50;
  const second = parseColorStop(stops[1], secondDefault);
  return formatCssColor(mixCssColors(first.color, first.percent, second.color, second.percent));
}

function replaceCssVariables(value, variables, stack = []) {
  return replaceCssFunctionCalls(value, "var", (content) => {
    const [name, fallback] = splitFirstTopLevelComma(content);
    if (!name.startsWith("--")) throw new Error(`Invalid CSS var: var(${content})`);
    if (variables.has(name)) {
      if (stack.includes(name)) throw new Error(`Cyclic CSS var: ${[...stack, name].join(" -> ")}`);
      return resolveCssValue(variables.get(name), variables, [...stack, name]);
    }
    if (fallback) return resolveCssValue(fallback, variables, stack);
    throw new Error(`CSS var unresolved no SVG raster-ready: ${name}`);
  });
}

function replaceColorMix(value) {
  return replaceCssFunctionCalls(value, "color-mix", resolveColorMix);
}

function resolveCssValue(value, variables, stack = []) {
  let output = stripCssComments(value).trim();
  for (let i = 0; i < 20; i += 1) {
    const previous = output;
    output = replaceCssVariables(output, variables, stack);
    output = replaceColorMix(output);
    if (output === previous) return output;
  }
  throw new Error(`CSS did not stabilize while materializing SVG: ${value}`);
}

function escapeAttributeValueForQuote(value, quote) {
  if (quote === "'") return value.replaceAll("'", "&apos;");
  return value.replaceAll('"', "&quot;");
}

function materializeStyleBlocks(svg, variables) {
  return svg.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (full, open, css, close) => {
    return `${open}${resolveCssValue(css, variables)}${close}`;
  });
}

function materializeRasterAttributes(svg, variables) {
  const rasterAttrs = "style|fill|stroke|color|background|stop-color|flood-color|lighting-color";
  const attrPattern = new RegExp(`\\b(${rasterAttrs})=(["'])([\\s\\S]*?)\\2`, "gi");
  return svg.replace(attrPattern, (full, name, quote, value) => {
    const resolved = resolveCssValue(value, variables);
    return `${name}=${quote}${escapeAttributeValueForQuote(resolved, quote)}${quote}`;
  });
}

function rasterCssPayloads(svg) {
  const payloads = [];
  for (const match of svg.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) payloads.push(match[1]);
  const rasterAttrs = "style|fill|stroke|color|background|stop-color|flood-color|lighting-color";
  const attrPattern = new RegExp(`\\b(?:${rasterAttrs})=(["'])([\\s\\S]*?)\\1`, "gi");
  for (const match of svg.matchAll(attrPattern)) payloads.push(match[2]);
  return payloads;
}

export function materializeSvgForRaster(svg) {
  const variables = collectCssVariables(svg);
  let materialized = materializeStyleBlocks(svg, variables);
  materialized = materializeRasterAttributes(materialized, variables);
  if (rasterCssPayloads(materialized).some((payload) => /var\(|color-mix\(/i.test(payload))) {
    throw new Error("CSS unresolved no SVG raster-ready: ainda existe var(...) ou color-mix(...).");
  }
  return materialized;
}

const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function tokenPattern(prefixes) {
  const escaped = prefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return null;
  return new RegExp(`^\\s*(${escaped.join("|")}):([a-zA-Z0-9_-]+)(?:\\s+|$)(.*)$`, "i");
}

function stripFaName(name) {
  return name.startsWith("fa-") ? name.slice(3) : name;
}

function resolveAlias(pack, iconName, limit = 6) {
  let current = iconName;
  const seen = new Set([current]);
  for (let i = 0; i < limit; i += 1) {
    const alias = pack.aliases?.[current];
    if (!alias?.parent) break;
    const parent = String(alias.parent).toLowerCase();
    if (seen.has(parent)) break;
    if (pack.icons?.[parent]) return parent;
    seen.add(parent);
    current = parent;
  }
  return iconName;
}

function resolveIcon(pack, tokenName) {
  const candidates = [tokenName.toLowerCase(), stripFaName(tokenName.toLowerCase())];
  for (const candidate of [...candidates]) {
    const alias = resolveAlias(pack, candidate);
    if (!candidates.includes(alias)) candidates.push(alias);
  }
  for (const candidate of candidates) {
    const icon = pack.icons?.[candidate];
    if (icon) return { name: candidate, icon };
  }
  return null;
}

function iconBody(pack, icon) {
  return {
    body: icon.body,
    width: icon.width || pack.width || 16,
    height: icon.height || pack.height || 16,
    left: icon.left || 0,
    top: icon.top || 0,
  };
}

function parseAttrs(attrText) {
  const attrs = new Map();
  for (const match of attrText.matchAll(/([:\w-]+)="([^"]*)"/g)) attrs.set(match[1], match[2]);
  return attrs;
}

function textWidthApprox(text, fontSize) {
  return Math.max(0, Array.from(text || "").length * fontSize * 0.31);
}

function makeIconSvg({ prefix, name, x, y, size, pack, icon }) {
  const body = iconBody(pack, icon);
  const viewBox = `${body.left} ${body.top} ${body.width} ${body.height}`;
  return `<svg class="mermaid-icon mermaid-icon-${escapeAttr(prefix)}" data-mermaid-icon-token="${escapeAttr(`${prefix}:${name}`)}" x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${size.toFixed(3)}" height="${size.toFixed(3)}" viewBox="${viewBox}" aria-hidden="true">${body.body}</svg>`;
}

function injectIcons(svg, packs) {
  if (packs.size === 0) return svg;
  const pattern = tokenPattern([...packs.keys()]);
  if (!pattern) return svg;
  const icons = [];
  let count = 0;

  const replaced = svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (full, attrText, rawText) => {
    const plain = decodeEntities(rawText.replace(/<[^>]+>/g, "")).trim();
    const match = plain.match(pattern);
    if (!match) return full;
    const prefix = match[1].toLowerCase();
    const tokenName = match[2].toLowerCase();
    const rest = match[3] || "";
    const pack = packs.get(prefix);
    const resolved = pack ? resolveIcon(pack, tokenName) : null;
    if (!resolved) {
      if (process.env.MMDC_STRICT_ICON_INJECTION === "1") {
        throw new Error(`icon not found in vendor runtime: ${prefix}:${tokenName}`);
      }
      return full;
    }

    const attrs = parseAttrs(attrText);
    const fontSize = Number(attrs.get("font-size") || 14);
    const textX = Number(attrs.get("x") || 0);
    const textY = Number(attrs.get("y") || 0);
    const anchor = attrs.get("text-anchor") || "start";
    const size = Math.max(10, fontSize * 1.1);
    const restWidth = textWidthApprox(rest, fontSize);
    let x = textX;
    if (anchor === "middle") x = textX - restWidth / 2 - size - 4;
    if (anchor === "end") x = textX - restWidth - size - 4;
    const y = textY - size / 2;
    icons.push(makeIconSvg({ prefix, name: tokenName, x, y, size, pack, icon: resolved.icon }));
    count += 1;
    return `<text${attrText}>${escapeText(rest)}</text>`;
  });

  if (count === 0) return replaced;
  const withCount = replaced.replace(/<svg\b([^>]*)>/, (full, attrs) => `<svg${attrs} data-mermaid-icon-injected-count="${count}">`);
  return withCount.replace("</svg>", `${icons.join("\n")}\n</svg>`);
}

function renderSvg(runtime, source, file, opts) {
  assertSupported(source, file);
  let svg = runtime.beautiful.renderMermaidSVG(source, colorOptions(opts, runtime.beautiful.THEMES || {}));
  svg = stripRemoteReferences(svg);
  svg = injectIcons(svg, runtime.packs);
  return svg;
}

function renderAscii(runtime, source, opts) {
  const paddingX = Number(process.env.MMDC_ASCII_PADDING_X || 5);
  const paddingY = Number(process.env.MMDC_ASCII_PADDING_Y || 5);
  const boxBorderPadding = Number(process.env.MMDC_ASCII_BORDER_PADDING || 1);
  return stripAnsi(runtime.beautiful.renderMermaidASCII(source, {
    useAscii: opts.asciiMode === "ascii",
    paddingX,
    paddingY,
    boxBorderPadding,
  }));
}

function pngBufferFromSvg(runtime, svg, opts) {
  const bg = opts.background === "transparent" ? undefined : cssColor(opts.background);
  const rasterSvg = materializeSvgForRaster(svg);
  const renderer = new runtime.resvg.Resvg(rasterSvg, {
    background: bg,
    fitTo: { mode: "zoom", value: opts.rasterScale },
    shapeRendering: 2,
    textRendering: 2,
    imageRendering: 0,
    font: {
      fontBuffers: runtime.fontBuffers,
      defaultFontFamily: "DejaVu Sans",
      sansSerifFamily: "DejaVu Sans",
      serifFamily: "DejaVu Serif",
      monospaceFamily: "DejaVu Sans Mono",
    },
  });
  const image = renderer.render();
  return { png: Buffer.from(image.asPng()), rgba: Buffer.from(image.pixels), width: image.width, height: image.height };
}

function jpegBuffer(runtime, rgba, width, height, quality) {
  const encoder = runtime.jpeg.default?.encode || runtime.jpeg.encode;
  return Buffer.from(encoder({ data: rgba, width, height }, quality).data);
}

function outputBaseForFile(file, opts) {
  if (!opts.outputDir) {
    const ext = path.extname(file);
    return path.join(path.dirname(file), path.basename(file, ext));
  }

  let relative;
  if (opts.flatOutput || !opts.inputRoot) {
    relative = path.basename(file);
  } else {
    relative = path.relative(opts.inputRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`file outside --input-root: ${file}`);
    }
  }

  const parsed = path.parse(relative);
  return path.join(opts.outputDir, parsed.dir, parsed.name);
}

function coordsOutputForText(txt) {
  const ext = path.extname(txt);
  if (!ext) return `${txt}.coords.txt`;
  return `${txt.slice(0, -ext.length)}.coords.txt`;
}

function planOutputs(files, opts) {
  if (opts.asciiOutput && files.length !== 1) {
    throw new Error("--ascii-output is only allowed with a single input file.");
  }
  const planned = new Map();
  const seen = new Map();
  for (const file of files) {
    const base = outputBaseForFile(file, opts);
    const outputs = {
      svg: `${base}.svg`,
      jpg: `${base}.jpg`,
    };
    if (opts.png) outputs.png = `${base}.png`;
    if (opts.ascii) {
      outputs.txt = opts.asciiOutput || `${base}.txt`;
      if (opts.asciiCoords) outputs.coords = coordsOutputForText(outputs.txt);
    }
    for (const output of Object.values(outputs)) {
      const previous = seen.get(output);
      if (previous && previous !== file) {
        throw new Error(`output collision${opts.flatOutput ? " in --flat-output" : ""}: ${output} used by ${previous} e ${file}`);
      }
      seen.set(output, file);
    }
    planned.set(file, outputs);
  }
  return planned;
}

async function ensureOutputDirs(outputs) {
  for (const output of Object.values(outputs)) {
    await fsp.mkdir(path.dirname(output), { recursive: true });
  }
}

function createManifest(opts, files) {
  return {
    generatedAt: new Date().toISOString(),
    renderer: "vaults-mermaid-render",
    mode: "node-js-wasm",
    cwd: process.cwd(),
    vendorNodeRoot: opts.vendorRoot,
    runtimeMode: null,
    outputDir: opts.outputDir,
    inputRoot: opts.inputRoot,
    flatOutput: opts.flatOutput,
    png: opts.png,
    ascii: opts.ascii,
    asciiMode: opts.asciiMode,
    asciiOutput: opts.asciiOutput,
    asciiCoords: opts.asciiCoords,
    rasterScale: opts.rasterScale,
    summary: { total: files.length, ok: 0, failed: 0 },
    files: [],
  };
}

async function writeManifest(manifestPath, manifest) {
  if (!manifestPath) return;
  manifest.summary.ok = manifest.files.filter((entry) => entry.status === "ok").length;
  manifest.summary.failed = manifest.files.filter((entry) => entry.status === "error").length;
  await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

async function renderOne(runtime, file, outputs, opts) {
  const source = await fsp.readFile(file, "utf8");
  const diagramType = detectDiagramType(source);
  const svg = renderSvg(runtime, source, file, opts);
  await ensureOutputDirs(outputs);
  await fsp.writeFile(outputs.svg, svg, "utf8");
  const raster = pngBufferFromSvg(runtime, svg, opts);
  await fsp.writeFile(outputs.jpg, jpegBuffer(runtime, raster.rgba, raster.width, raster.height, opts.quality));
  if (opts.png && outputs.png) await fsp.writeFile(outputs.png, raster.png);
  if (opts.ascii && outputs.txt) {
    const ascii = renderAscii(runtime, source, opts);
    await fsp.writeFile(outputs.txt, ascii, "utf8");
    if (opts.asciiCoords && outputs.coords) {
      const relInput = path.relative(process.cwd(), file) || file;
      await fsp.writeFile(
        outputs.coords,
        [
          "0 coords unavailable for engine=vendor",
          `1 input=${relInput}`,
          "2 vendor Node-only ASCII uses beautiful-mermaid without coordinate grid",
          "",
        ].join("\n"),
        "utf8",
      );
    }
  }
  console.log(`[mermaid:${runtime.runtimeMode}] ${file}`);
  console.log(`  -> ${outputs.svg}`);
  console.log(`  -> ${outputs.jpg}`);
  if (opts.png && outputs.png) console.log(`  -> ${outputs.png}`);
  if (opts.ascii && outputs.txt) console.log(`  -> ${outputs.txt}`);
  if (opts.asciiCoords && outputs.coords) console.log(`  -> ${outputs.coords}`);
  return {
    input: file,
    diagramType,
    status: "ok",
    outputs,
    error: null,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const files = await collectMermaidFiles(opts.inputs);
  if (files.length === 0) throw new Error("No .mmd or .mermaid files found.");
  const manifest = createManifest(opts, files);
  const planned = planOutputs(files, opts);
  const runtime = await loadRuntime(opts);

  for (const file of files) {
    const outputs = planned.get(file);
    try {
      manifest.files.push(await renderOne(runtime, file, outputs, opts));
    } catch (error) {
      manifest.files.push({
        input: file,
        diagramType: null,
        status: "error",
        outputs,
        error: error.message,
      });
      console.error(`[ERROR] ${file}: ${error.message}`);
    }
  }

  await writeManifest(opts.manifest, manifest);
  if (manifest.files.some((entry) => entry.status === "error")) process.exit(1);
  console.log(`OK: ${files.length} diagram(s) rendered by the JS/WASM runtime.`);
}

if (isCliEntryPoint()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

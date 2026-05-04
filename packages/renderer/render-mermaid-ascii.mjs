#!/usr/bin/env node
/**
 * Optional Mermaid ASCII/Unicode sidecar renderer.
 *
 * Preferred engine order in --engine auto:
 *   1. external mermaid-ascii binary, if available
 *   2. beautiful-mermaid renderMermaidASCII fallback
 *
 * This script never renders SVG/JPEG. It only writes text artifacts.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = {
  engine: "auto",
  mode: "unicode",
  paddingX: 5,
  paddingY: 5,
  borderPadding: 1,
  coords: false,
  coordsOutput: null,
};

const USAGE = `
Usage: render-mermaid-ascii.mjs --input FILE --output FILE [options]

Options:
  --input FILE              Input Mermaid file (.mmd or .mermaid)
  --output FILE             Output text file
  --engine auto|mermaid-ascii|beautiful
                            ASCII engine. Default: auto.
  --mode unicode|ascii      Output charset. Default: unicode.
  --ascii                   Alias for --mode ascii.
  --padding-x N             Horizontal spacing between nodes. Default: ${DEFAULTS.paddingX}.
  --padding-y N             Vertical spacing between nodes. Default: ${DEFAULTS.paddingY}.
  --border-padding N        Inner box padding. Default: ${DEFAULTS.borderPadding}.
  --coords                  Generate a coordinate debug file when possible.
  --coords-output FILE      Debug path. Default: <output without extension>.coords.txt.
  -h, --help                Show this help.

Environment variables:
  MERMAID_ASCII_BIN         Explicit path to the mermaid-ascii binary.

Detection in --engine auto:
  1. MERMAID_ASCII_BIN
  2. packages/renderer/bin/mermaid-ascii
  3. mermaid-ascii no PATH
  4. fallback beautiful-mermaid
`;

function toCamel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv) {
  const opts = {
    input: null,
    output: null,
    ...DEFAULTS,
  };

  const boolFlags = new Set(["--coords", "--ascii"]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }

    if (boolFlags.has(arg)) {
      if (arg === "--ascii") {
        opts.mode = "ascii";
      } else {
        opts[toCamel(arg.slice(2))] = true;
      }
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Invalid argument: ${arg}`);
    }

    const equalsPos = arg.indexOf("=");
    const rawKey = equalsPos >= 0 ? arg.slice(2, equalsPos) : arg.slice(2);
    const key = toCamel(rawKey);
    const value = equalsPos >= 0 ? arg.slice(equalsPos + 1) : argv[i + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option ${arg} requires a value.`);
    }
    if (!(key in opts)) {
      throw new Error(`Unknown option: ${arg}`);
    }

    opts[key] = value;
    if (equalsPos < 0) i += 1;
  }

  if (!opts.input) throw new Error("--input is required.");
  if (!opts.output) throw new Error("--output is required.");

  opts.engine = String(opts.engine).toLowerCase();
  if (opts.engine === "bm") opts.engine = "beautiful";
  if (!["auto", "mermaid-ascii", "beautiful"].includes(opts.engine)) {
    throw new Error("--engine accepts only auto, mermaid-ascii, or beautiful.");
  }

  opts.mode = String(opts.mode).toLowerCase();
  if (!["unicode", "ascii"].includes(opts.mode)) {
    throw new Error("--mode accepts only unicode or ascii.");
  }

  opts.paddingX = parseNonNegativeInteger(opts.paddingX, "padding-x");
  opts.paddingY = parseNonNegativeInteger(opts.paddingY, "padding-y");
  opts.borderPadding = parseNonNegativeInteger(opts.borderPadding, "border-padding");

  opts.input = path.resolve(opts.input);
  opts.output = path.resolve(opts.output);
  opts.coordsOutput = opts.coordsOutput
    ? path.resolve(opts.coordsOutput)
    : defaultCoordsOutput(opts.output);

  return opts;
}

function parseNonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for --${name}: ${value}`);
  }
  return parsed;
}

function defaultCoordsOutput(output) {
  const ext = path.extname(output);
  if (!ext) return `${output}.coords.txt`;
  return `${output.slice(0, -ext.length)}.coords.txt`;
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findOnPath(binaryName) {
  const pathEnv = process.env.PATH || "";
  for (const entry of pathEnv.split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, binaryName);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function findMermaidAsciiBinary() {
  const candidates = [];
  if (process.env.MERMAID_ASCII_BIN) {
    candidates.push({ source: "MERMAID_ASCII_BIN", path: process.env.MERMAID_ASCII_BIN });
  }
  candidates.push({ source: "packages/renderer/bin", path: path.join(SCRIPT_DIR, "bin", "mermaid-ascii") });

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.path);
    if (isExecutable(resolved)) return { ...candidate, path: resolved };
  }

  const pathCandidate = findOnPath("mermaid-ascii");
  if (pathCandidate) return { source: "PATH", path: pathCandidate };
  return null;
}

function stripAnsi(text) {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function runMermaidAsciiOnce(opts, bin, coords = false) {
  const args = ["-f", opts.input, "-x", String(opts.paddingX), "-y", String(opts.paddingY), "-p", String(opts.borderPadding)];
  if (opts.mode === "ascii") args.push("--ascii");
  if (coords) args.push("--coords");

  const result = spawnSync(bin.path, args, {
    cwd: SCRIPT_DIR,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`failed to execute mermaid-ascii (${bin.path}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : "";
    throw new Error(`mermaid-ascii retornou status ${result.status}.${stderr}`);
  }
  return stripAnsi(result.stdout || "");
}

function renderWithMermaidAscii(opts, bin) {
  const output = runMermaidAsciiOnce(opts, bin, false);
  writeText(opts.output, output);

  if (opts.coords) {
    const coordsOutput = runMermaidAsciiOnce(opts, bin, true);
    writeText(opts.coordsOutput, coordsOutput);
  }
}

function vendorNodeModuleFile(...parts) {
  const vendorRoot = path.resolve(process.env.MMDC_VENDOR_NODE_ROOT || path.join(SCRIPT_DIR, "vendor", "node"));
  return path.join(vendorRoot, "node_modules", ...parts);
}

async function importVendorModule(label, ...parts) {
  const target = vendorNodeModuleFile(...parts);
  if (fs.existsSync(target)) return import(pathToFileURL(target).href);
  if (process.env.MMDC_VENDOR_ONLY === "1") {
    throw new Error(`${label} vendor missing: ${target}`);
  }
  return null;
}

async function loadBeautifulMermaid() {
  const vendor = await importVendorModule("beautiful-mermaid", "beautiful-mermaid", "dist", "index.js");
  if (vendor) return vendor;

  try {
    return await import("beautiful-mermaid");
  } catch (error) {
    const localDist = path.resolve(
      SCRIPT_DIR,
      "../..",
      "ref",
      "beautiful-mermaid",
      "dist",
      "index.js"
    );
    if (fs.existsSync(localDist)) return import(pathToFileURL(localDist).href);
    throw new Error(`beautiful-mermaid not found: ${error.message}`);
  }
}

async function renderWithBeautiful(opts) {
  const source = fs.readFileSync(opts.input, "utf8");
  const { renderMermaidASCII } = await loadBeautifulMermaid();
  const output = renderMermaidASCII(source, {
    useAscii: opts.mode === "ascii",
    paddingX: opts.paddingX,
    paddingY: opts.paddingY,
    boxBorderPadding: opts.borderPadding,
  });
  writeText(opts.output, output);

  if (opts.coords) {
    const relInput = path.relative(process.cwd(), opts.input) || opts.input;
    writeText(
      opts.coordsOutput,
      [
        "0 coords unavailable for engine=beautiful",
        `1 input=${relInput}`,
        "2 install or set MERMAID_ASCII_BIN for mermaid-ascii coordinate grid",
        "",
      ].join(os.EOL),
    );
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exit(2);
  }

  if (!fs.existsSync(opts.input) || !fs.statSync(opts.input).isFile()) {
    console.error(`Input not found: ${opts.input}`);
    process.exit(1);
  }

  try {
    const mermaidAsciiBin = findMermaidAsciiBinary();

    if (opts.engine === "mermaid-ascii") {
      if (!mermaidAsciiBin) {
        throw new Error("mermaid-ascii not found. Set MERMAID_ASCII_BIN, install it in packages/renderer/bin/, or put it on PATH.");
      }
      renderWithMermaidAscii(opts, mermaidAsciiBin);
      return;
    }

    if (opts.engine === "beautiful") {
      await renderWithBeautiful(opts);
      return;
    }

    if (mermaidAsciiBin) {
      renderWithMermaidAscii(opts, mermaidAsciiBin);
      return;
    }

    await renderWithBeautiful(opts);
  } catch (error) {
    console.error(`Failed to render ASCII for ${opts.input}: ${error.message}`);
    process.exit(1);
  }
}

main();

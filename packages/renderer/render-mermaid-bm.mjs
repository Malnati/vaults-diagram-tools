#!/usr/bin/env node
/**
 * Optional local renderer wrapper powered by beautiful-mermaid.
 *
 * Supports:
 *  - SVG output (default)
 *  - optional ASCII/Unicode output
 *  - built-in themes, custom JSON theme, and Shiki theme compatibility
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveThemeDescriptor } from "./theme-resolver.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_FONT = "Inter";

const USAGE = `
Usage: render-mermaid-bm.mjs --input FILE --output FILE [options]

Options:
  --input FILE              Input file (.mmd or .mermaid)
  --output FILE             Output SVG file
  --theme VALUE             beautiful-mermaid theme (theme name, JSON path, or JSON string)
  --bg COLOR                Background color (override)
  --fg COLOR                Text color (override)
  --line COLOR              Edge color
  --accent COLOR            Accent color
  --muted COLOR             Muted color
  --surface COLOR           Surface color
  --border COLOR            Border color
  --font FONT               Font (default: ${DEFAULT_FONT})
  --padding N               Canvas spacing (default: 40)
  --transparent             Transparent background
  --interactive             Tooltip interativo (XYChart)
  --ascii                   Also generate ASCII/Unicode output
  --ascii-mode ascii|unicode ASCII mode (default: unicode)
  --ascii-output FILE       Path to the .txt file (default: <output>.txt)
  --shiki-theme THEME       Shiki theme name to convert with fromShikiTheme

Output:
  - Escreve SVG em --output
  - Writes text to --ascii-output when --ascii is enabled
`;

function parseCliArgs(argv) {
  const out = {
    input: null,
    output: null,
    theme: null,
    bg: null,
    fg: null,
    line: null,
    accent: null,
    muted: null,
    surface: null,
    border: null,
    font: DEFAULT_FONT,
    padding: 40,
    transparent: false,
    interactive: false,
    ascii: false,
    asciiMode: "unicode",
    asciiOutput: null,
    shikiTheme: null,
  };

  const boolFlags = new Set(["--transparent", "--interactive", "--ascii"]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }

    if (boolFlags.has(arg)) {
      const flag = arg.slice(2);
      out[flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const equalsPos = arg.indexOf("=");
      const optionName = equalsPos >= 0 ? arg.slice(2, equalsPos) : arg.slice(2);
      const key = optionName
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = equalsPos >= 0
        ? arg.slice(equalsPos + 1)
        : null;

      const next = value === null ? argv[i + 1] : value;
      if (!next || next.startsWith("--")) {
        throw new Error(`Option ${arg} requires an argument.`);
      }

      if (!(key in out)) {
        throw new Error(`Unknown option: ${arg}`);
      }
      out[key] = next;
      if (equalsPos < 0) {
        i += 1;
      }
      continue;
    }

    throw new Error(`Invalid argument: ${arg}`);
  }

  if (!out.input) {
    throw new Error("--input is required.");
  }
  if (!out.output) {
    throw new Error("--output is required.");
  }
  if (out.asciiMode !== "ascii" && out.asciiMode !== "unicode") {
    throw new Error("--ascii-mode accepts only ascii or unicode.");
  }
  return out;
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

async function loadRendererModule() {
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
    if (fs.existsSync(localDist)) {
      return import(pathToFileURL(localDist).href);
    }

    throw new Error(
      "beautiful-mermaid was not found in the environment. Install it with npm or generate dist in ../ref/beautiful-mermaid/dist/index.js"
    );
  }
}

function parseNumber(value, name) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid value for --${name}: ${value}`);
  }
  return num;
}

function normalizeThemeObject(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const hasBg = typeof value.bg === "string";
  const hasFg = typeof value.fg === "string";
  if (!hasBg || !hasFg) {
    return null;
  }

  return {
    bg: value.bg,
    fg: value.fg,
    line: value.line,
    accent: value.accent,
    muted: value.muted,
    surface: value.surface,
    border: value.border,
  };
}

function readThemeFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  const normalized = normalizeThemeObject(parsed);
  if (!normalized) {
    throw new Error(`Invalid theme in ${filePath}: expected object with bg/fg.`);
  }
  return normalized;
}

function mergeColors(base, overrides) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function writeFileEnsureDir(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function stripRemoteReferences(svg) {
  return svg
    .replace(/\s*@import\s+url\([^)]*\);?/g, "")
    .replace(/\s*@import\s+["'][^"']+["'];?/g, "");
}

function toThemeDescriptor(themeArg, THEME_CATALOG) {
  if (!themeArg) {
    return null;
  }

  const namedTheme = resolveThemeDescriptor(themeArg, THEME_CATALOG);
  if (namedTheme) return namedTheme;

  // Theme from file path
  const filePath = path.resolve(themeArg);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return readThemeFromFile(filePath);
  }

  // Theme from inline JSON
  try {
    const parsed = JSON.parse(themeArg);
    const normalized = normalizeThemeObject(parsed);
    if (normalized) return normalized;
  } catch {
    // ignore
  }

  throw new Error(`Unknown theme for --theme: ${themeArg}`);
}

function parseArgsLikeColors(value) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

async function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exit(1);
  }

  const inputPath = path.resolve(opts.input);
  const outputPath = path.resolve(opts.output);
  const asciiOutput =
    opts.asciiOutput
      ? path.resolve(opts.asciiOutput)
      : `${outputPath.replace(/\.svg$/i, "")}.txt`;

  let source;
  try {
    source = fs.readFileSync(inputPath, "utf-8");
  } catch (error) {
    console.error(`Error reading ${inputPath}: ${error.message}`);
    process.exit(1);
  }

  const {
    renderMermaidSVG,
    renderMermaidASCII,
    THEMES,
    DEFAULTS,
    fromShikiTheme,
  } = await loadRendererModule();

  let colors = { ...DEFAULTS };

  if (opts.shikiTheme) {
    try {
      const shikiVendor = await importVendorModule("shiki", "shiki", "dist", "index.mjs");
      const { getSingletonHighlighter } = shikiVendor || await import("shiki");
      const highlighter = await getSingletonHighlighter({ themes: [opts.shikiTheme] });
      const shikiThemeObject = highlighter.getTheme(opts.shikiTheme);
      if (!shikiThemeObject) {
        throw new Error(`Shiki theme not found: ${opts.shikiTheme}`);
      }
      colors = mergeColors(fromShikiTheme(shikiThemeObject), {});
    } catch (error) {
      console.error(`Failure in --shiki-theme ${opts.shikiTheme}: ${error.message}`);
      process.exit(1);
    }
  } else {
    try {
      const themeFromArg = toThemeDescriptor(opts.theme, THEMES);
      if (themeFromArg) {
        colors = themeFromArg;
      }
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  const themeOverrides = {
    bg: parseArgsLikeColors(opts.bg),
    fg: parseArgsLikeColors(opts.fg),
    line: parseArgsLikeColors(opts.line),
    accent: parseArgsLikeColors(opts.accent),
    muted: parseArgsLikeColors(opts.muted),
    surface: parseArgsLikeColors(opts.surface),
    border: parseArgsLikeColors(opts.border),
  };

  const renderOptions = {
    ...mergeColors(colors, themeOverrides),
    font: opts.font || DEFAULT_FONT,
    padding: parseNumber(opts.padding, "padding"),
    transparent: Boolean(opts.transparent),
    interactive: Boolean(opts.interactive),
  };

  try {
    const svg = stripRemoteReferences(renderMermaidSVG(source, {
      bg: renderOptions.bg,
      fg: renderOptions.fg,
      line: renderOptions.line,
      accent: renderOptions.accent,
      muted: renderOptions.muted,
      surface: renderOptions.surface,
      border: renderOptions.border,
      font: renderOptions.font,
      padding: renderOptions.padding,
      transparent: renderOptions.transparent,
      interactive: renderOptions.interactive,
    }));

    writeFileEnsureDir(outputPath, svg);

    if (opts.ascii) {
      const ascii = renderMermaidASCII(source, {
        useAscii: opts.asciiMode === "ascii",
        paddingX: Number(renderOptions.padding),
        paddingY: Number(renderOptions.padding),
      });
      writeFileEnsureDir(asciiOutput, ascii);
    }
  } catch (error) {
    console.error(`Failed to render ${inputPath}: ${error.message}`);
    process.exit(1);
  }
}

main();

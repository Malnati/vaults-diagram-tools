#!/usr/bin/env node
/**
 * Build a minimal Mermaid icon registry payload from local Iconify packs.
 */

import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PREFIXES = ["fa", "logos", "lucide"];
const ICONIFY_PACKS = {
  fa: "@iconify-json/fa",
  logos: "@iconify-json/logos",
  lucide: "@iconify-json/lucide",
};

function printUsage() {
  console.log(`Usage: build-mermaid-icon-registry.mjs --prefixes fa,logos,lucide --output FILE [--strict] <file-or-dir ...>

Arguments:
  --prefixes PREFIXES   Comma-separated icon prefixes (default: fa,logos,lucide)
  --output FILE         JSON output file (required)
  --strict              Fail when a referenced token cannot be resolved
  --help                Show this help`);
}

function parseArgs(argv) {
  const out = {
    prefixes: [...DEFAULT_PREFIXES],
    output: null,
    strict: false,
    sources: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--prefixes") {
      if (i + 1 >= argv.length) {
        throw new Error("--prefixes requires a comma-separated value");
      }
      const raw = argv[i + 1];
      out.prefixes = raw
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.length > 0);
      i += 1;
      continue;
    }
    if (arg === "--output") {
      if (i + 1 >= argv.length) {
        throw new Error("--output requires a path");
      }
      out.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--strict") {
      out.strict = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    out.sources.push(arg);
  }

  if (!out.output) {
    throw new Error("--output is required");
  }
  if (out.sources.length === 0) {
    throw new Error("No source files provided");
  }
  return out;
}

function readText(file) {
  return fs.readFile(file, "utf-8");
}

async function collectSourceFiles(inputs) {
  const files = [];
  const visit = async (currentPath) => {
    const stat = await fs.stat(currentPath);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "." || entry.name === "..") continue;
        await visit(path.join(currentPath, entry.name));
      }
      return;
    }

    if (!stat.isFile()) {
      return;
    }
    if (!currentPath.endsWith(".mmd") && !currentPath.endsWith(".mermaid")) {
      return;
    }
    files.push(currentPath);
  };

  for (const input of inputs) {
    await visit(input);
  }

  return files;
}

function resolvePrefixes(prefixes) {
  const normalized = [...new Set(prefixes.map((value) => value.toLowerCase().trim()).filter(Boolean))];
  const missing = normalized.filter((prefix) => !(prefix in ICONIFY_PACKS));
  if (missing.length > 0) {
    throw new Error(`Unsupported icon prefixes: ${missing.join(", ")}`);
  }
  return normalized;
}

function tokenRegex(prefixes) {
  const escaped = prefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:^|[^a-zA-Z0-9_-])((?:${escaped.join("|")})(?::[a-zA-Z0-9_-]+))`, "gi");
}

function splitToken(token) {
  const [prefix, name] = token.toLowerCase().split(":");
  return { prefix, name: (name || "").toLowerCase() };
}

function stripFaName(tokenName) {
  if (tokenName.startsWith("fa-")) {
    return tokenName.slice(3);
  }
  return tokenName;
}

function getPackForPrefix(prefix) {
  const packageName = ICONIFY_PACKS[prefix];
  if (!packageName) {
    throw new Error(`Missing package mapping for prefix '${prefix}'.`);
  }
  return packageName;
}

async function loadPack(prefix) {
  const packageName = getPackForPrefix(prefix);
  const vendorRoot = path.resolve(process.env.MMDC_VENDOR_NODE_ROOT || path.join(SCRIPT_DIR, "vendor", "node"));
  const vendorIconsJson = path.join(vendorRoot, "node_modules", ...packageName.split("/"), "icons.json");

  if (fsSync.existsSync(vendorIconsJson)) {
    const pack = JSON.parse(await fs.readFile(vendorIconsJson, "utf-8"));
    return {
      prefix: pack.prefix || prefix,
      data: pack,
      defaultWidth: pack.width || 0,
      defaultHeight: pack.height || 0,
    };
  }

  if (process.env.MMDC_VENDOR_ONLY === "1") {
    throw new Error(`Vendor icon pack missing for '${prefix}': ${vendorIconsJson}`);
  }

  const imported = await import(packageName);
  const pack = imported.icons || imported.default?.icons;
  if (!pack || !pack.icons || typeof pack.icons !== "object") {
    throw new Error(`Malformed icon pack module for '${prefix}' (${packageName}).`);
  }
  return {
    prefix: pack.prefix || imported.info?.prefix || prefix,
    data: pack,
    defaultWidth: pack.width || 0,
    defaultHeight: pack.height || 0,
  };
}

function resolveAlias(packData, iconName, limit = 4) {
  if (!packData?.aliases || !(iconName in packData.aliases)) {
    return iconName;
  }

  let current = iconName;
  const seen = new Set([current]);
  for (let i = 0; i < limit; i += 1) {
    const alias = packData.aliases[current];
    if (!alias || !alias.parent) break;
    const parent = String(alias.parent);
    if (seen.has(parent)) break;
    if (packData.icons && packData.icons[parent]) {
      return parent;
    }
    seen.add(parent);
    current = parent;
  }

  return iconName;
}

function normalizeTokenShape(tokenName, packData, strict) {
  if (tokenName in packData.icons) {
    return tokenName;
  }

  const stripped = stripFaName(tokenName);
  if (stripped !== tokenName && stripped in packData.icons) {
    return stripped;
  }

  const alias = resolveAlias(packData, tokenName);
  if (alias !== tokenName && alias in packData.icons) {
    return alias;
  }

  const aliasFallback = resolveAlias(packData, stripped);
  if (aliasFallback !== stripped && aliasFallback in packData.icons) {
    return aliasFallback;
  }

  if (strict) {
    throw new Error(`Icon not found in pack '${packData.prefix}': ${tokenName}`);
  }

  return null;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const prefixes = resolvePrefixes(args.prefixes);
    const sourceFiles = await collectSourceFiles(args.sources);

    const tokenPattern = tokenRegex(prefixes);
    const usedTokens = new Set();

    for (const source of sourceFiles) {
      const content = await readText(source);
      for (const match of content.matchAll(tokenPattern)) {
        const matchToken = match[1];
        const parsed = splitToken(matchToken);
        const { name } = parsed;
        if (!name) continue;
        usedTokens.add(matchToken.toLowerCase());
      }
    }

    const missingTokens = [];
    const packs = new Map();
    const tokenEntries = {};

    for (const prefix of prefixes) {
      const pack = await loadPack(prefix);
      packs.set(prefix, pack);
    }

    const sortedTokens = [...usedTokens].sort();
    for (const token of sortedTokens) {
      const parsed = splitToken(token);
      const pack = packs.get(parsed.prefix);
      if (!pack) continue;

      const resolvedName = normalizeTokenShape(parsed.name, pack.data, false);
      if (!resolvedName) {
        missingTokens.push(token);
        continue;
      }
      const icon = pack.data.icons[resolvedName];
      if (!icon || !icon.body) {
        missingTokens.push(token);
        continue;
      }
      tokenEntries[token] = {
        body: icon.body,
        width: Number(icon.width || pack.defaultWidth || 0),
        height: Number(icon.height || pack.defaultHeight || 0),
        left: Number(icon.left || 0),
        top: Number(icon.top || 0),
      };
    }

    if (args.strict && missingTokens.length > 0) {
      console.error(`Missing icons (${missingTokens.length}):`);
      for (const missing of missingTokens) {
        console.error(`- ${missing}`);
      }
      process.exitCode = 1;
      return;
    }

    const registry = {
      tokens: tokenEntries,
    };

    await fs.writeFile(args.output, `${JSON.stringify(registry)}\n`, "utf-8");
    process.exitCode = 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();

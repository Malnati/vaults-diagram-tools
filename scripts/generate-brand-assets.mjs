#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import jpeg from "jpeg-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "docs", "assets", "brand");
const REQUIRE = createRequire(import.meta.url);
const SECONDARY_COPIES = [
  {
    from: "icon-512.png",
    to: path.join(ROOT, "packaging", "vscode", "icon.png"),
    label: "packaging/vscode/icon.png",
  },
];

const BRAND = Object.freeze({
  name: "vaults-diagram-tools",
  tagline: "Mermaid to assets. Source code to maps. MCP for agents.",
  description: "Portable Mermaid, source-code diagrams, and MCP workflows.",
  homepage: "https://malnati.github.io/vaults-diagram-tools/",
  repository: "https://github.com/Malnati/vaults-diagram-tools",
  colors: {
    bg: "#0b1020",
    bg2: "#10172a",
    cyan: "#67e8f9",
    purple: "#a78bfa",
    text: "#f8fafc",
    muted: "#cbd5e1",
    line: "#334155",
    green: "#86efac",
    yellow: "#fde68a",
    red: "#fb7185",
  },
});

const FONT_FILES = [
  "dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
  "dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
  "dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf",
].map((specifier) => REQUIRE.resolve(specifier));

function usage() {
  console.log(`Usage: node scripts/generate-brand-assets.mjs [--check] [--output-dir DIR]

Generate or verify deterministic brand assets for vaults-diagram-tools.

Options:
  --check           Verify files and manifest without writing.
  --output-dir DIR  Target directory. Default: docs/assets/brand.
  -h, --help        Show this help.
`);
}

function parseArgs(argv) {
  const opts = {
    check: false,
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--check") {
      opts.check = true;
      continue;
    }
    if (arg === "--output-dir") {
      const value = argv[++i];
      if (!value) throw new Error("missing value for --output-dir");
      opts.outputDir = path.resolve(value);
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return opts;
}

function xml(strings, ...values) {
  return strings.reduce((acc, value, index) => acc + value + (values[index] ?? ""), "");
}

function baseSvg(width, height, body, { label = BRAND.name } = {}) {
  return xml`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="brand-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#123247"/>
      <stop offset="0.48" stop-color="#0b1020"/>
      <stop offset="1" stop-color="#251d48"/>
    </linearGradient>
    <linearGradient id="brand-accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.colors.cyan}"/>
      <stop offset="1" stop-color="${BRAND.colors.purple}"/>
    </linearGradient>
    <pattern id="brand-grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#94a3b8" stroke-opacity="0.12" stroke-width="1"/>
    </pattern>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#020617" flood-opacity="0.34"/>
    </filter>
  </defs>
${body}
</svg>
`;
}

function markSvg(width, height, { appBadge = false } = {}) {
  const radius = appBadge ? 40 : Math.round(width * 0.2);
  const inset = Math.round(width * 0.1);
  const stroke = Math.round(width * 0.07);
  const circle = Math.round(width * 0.055);
  return baseSvg(width, height, xml`
  <rect width="${width}" height="${height}" rx="${radius}" fill="url(#brand-bg)"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" fill="none" stroke="#67e8f9" stroke-opacity="0.32"/>
  <rect width="${width}" height="${height}" fill="url(#brand-grid)" opacity="0.9"/>
  <circle cx="${width * 0.22}" cy="${height * 0.2}" r="${width * 0.34}" fill="#67e8f9" opacity="0.16"/>
  <circle cx="${width * 0.84}" cy="${height * 0.12}" r="${width * 0.34}" fill="#a78bfa" opacity="0.14"/>
  <path d="M${inset * 1.5} ${height * 0.58} L${width * 0.42} ${height * 0.32} L${width * 0.54} ${height * 0.68} L${width - inset * 1.4} ${height * 0.42}" fill="none" stroke="url(#brand-accent)" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${inset * 1.5}" cy="${height * 0.58}" r="${circle}" fill="${BRAND.colors.cyan}"/>
  <circle cx="${width * 0.42}" cy="${height * 0.32}" r="${circle}" fill="${BRAND.colors.purple}"/>
  <circle cx="${width * 0.54}" cy="${height * 0.68}" r="${circle}" fill="${BRAND.colors.cyan}"/>
  <circle cx="${width - inset * 1.4}" cy="${height * 0.42}" r="${circle}" fill="${BRAND.colors.purple}"/>
  ${appBadge ? xml`<text x="${width / 2}" y="${height * 0.83}" text-anchor="middle" fill="${BRAND.colors.text}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${Math.round(width * 0.13)}" font-weight="700" letter-spacing="-1">VDT</text>` : ""}
`, { label: appBadge ? `${BRAND.name} GitHub App badge` : `${BRAND.name} icon` });
}

function logoSvg(width = 1200, height = 260) {
  return baseSvg(width, height, xml`
  <rect width="${width}" height="${height}" fill="none"/>
  <g transform="translate(24 34)">
    ${markInner(192, 192, 30)}
  </g>
  <text x="252" y="116" fill="${BRAND.colors.text}" font-family="DejaVu Sans, Arial, sans-serif" font-size="56" font-weight="700" letter-spacing="-2">${BRAND.name}</text>
  <text x="256" y="168" fill="${BRAND.colors.cyan}" font-family="DejaVu Sans Mono, monospace" font-size="25" font-weight="700">${BRAND.tagline}</text>
  <text x="256" y="210" fill="${BRAND.colors.muted}" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">${BRAND.description}</text>
`, { label: `${BRAND.name} logo` });
}

function markInner(width, height, radius) {
  return xml`<g>
    <rect width="${width}" height="${height}" rx="${radius}" fill="url(#brand-bg)" filter="url(#soft-shadow)"/>
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" fill="none" stroke="#67e8f9" stroke-opacity="0.36"/>
    <rect width="${width}" height="${height}" fill="url(#brand-grid)" opacity="0.9"/>
    <path d="M42 112 L82 62 L108 132 L150 82" fill="none" stroke="url(#brand-accent)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="42" cy="112" r="11" fill="${BRAND.colors.cyan}"/>
    <circle cx="82" cy="62" r="11" fill="${BRAND.colors.purple}"/>
    <circle cx="108" cy="132" r="11" fill="${BRAND.colors.cyan}"/>
    <circle cx="150" cy="82" r="11" fill="${BRAND.colors.purple}"/>
  </g>`;
}

function terminalCard(x, y, width, height, commands) {
  const rows = commands.map((cmd, index) => {
    const color = index === 0 ? BRAND.colors.text : BRAND.colors.cyan;
    return `<text x="${x + 34}" y="${y + 92 + index * 40}" fill="${color}" font-family="DejaVu Sans Mono, monospace" font-size="22" font-weight="700">${cmd}</text>`;
  }).join("\n");
  return xml`<g filter="url(#soft-shadow)">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="28" fill="#071020" stroke="#334155"/>
    <rect x="${x}" y="${y}" width="${width}" height="58" rx="28" fill="#0f172a" stroke="#334155"/>
    <circle cx="${x + 34}" cy="${y + 29}" r="7" fill="${BRAND.colors.red}"/>
    <circle cx="${x + 56}" cy="${y + 29}" r="7" fill="${BRAND.colors.yellow}"/>
    <circle cx="${x + 78}" cy="${y + 29}" r="7" fill="${BRAND.colors.green}"/>
    <text x="${x + width - 110}" y="${y + 37}" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">terminal</text>
    ${rows}
  </g>`;
}

function heroSvg(width, height, variant) {
  const compact = width <= 1280;
  const titleSize = compact ? 64 : 72;
  const titleGap = compact ? 74 : 80;
  const textX = compact ? 76 : 98;
  const titleY = compact ? 220 : 205;
  const titleLines = compact
    ? [
        ["Mermaid to assets.", BRAND.colors.text],
        ["Source code to maps.", BRAND.colors.text],
        ["MCP for agents.", BRAND.colors.cyan],
      ]
    : [
        ["Mermaid to assets.", BRAND.colors.text],
        ["Source code to maps.", BRAND.colors.text],
        ["MCP for agents.", BRAND.colors.cyan],
      ];
  const terminalX = compact ? 768 : 980;
  const terminalY = compact ? 248 : 214;
  const terminalW = compact ? 442 : 510;
  const terminalH = compact ? 232 : 222;
  const terminal = terminalCard(terminalX, terminalY, terminalW, terminalH, [
    "npm install -D vaults-diagram-tools",
    "npx vaults-mermaid-render",
    "npx vaults-source-diagrams",
    "npx vaults-diagram-mcp",
  ]);
  const leadText = compact
    ? "Reproducible Mermaid assets, source diagrams, MCP."
    : BRAND.description;
  const lines = titleLines.map(([text, color], index) => (
    `<text x="${textX}" y="${titleY + index * titleGap}" fill="${color}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${titleSize}" font-weight="700" letter-spacing="-4">${text}</text>`
  )).join("\n");
  return baseSvg(width, height, xml`
  <rect width="${width}" height="${height}" fill="url(#brand-bg)"/>
  <rect width="${width}" height="${height}" fill="url(#brand-grid)" opacity="0.85"/>
  <circle cx="${width * 0.12}" cy="${height * 0.05}" r="${width * 0.23}" fill="#67e8f9" opacity="0.16"/>
  <circle cx="${width * 0.82}" cy="${height * 0.04}" r="${width * 0.26}" fill="#a78bfa" opacity="0.15"/>
  <g transform="translate(${textX} ${compact ? 54 : 56})">
    ${markInner(78, 78, 18)}
    <text x="98" y="49" fill="${BRAND.colors.text}" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="-1">${BRAND.name}</text>
  </g>
  ${lines}
  <text x="${textX}" y="${compact ? 444 : 430}" fill="${BRAND.colors.muted}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${compact ? 25 : 27}" font-weight="400">${leadText}</text>
  <g transform="translate(${textX} ${compact ? 494 : 464})">
    ${pill(0, 0, "Node ≥20.11")}
    ${pill(170, 0, "SVG + JPEG")}
    ${pill(342, 0, "3 MCP tools")}
  </g>
  ${terminal}
  <text x="${width - 92}" y="${height - 34}" text-anchor="end" fill="#94a3b8" font-family="DejaVu Sans Mono, monospace" font-size="18">${variant}</text>
`, { label: `${BRAND.name} ${variant}` });
}

function pill(x, y, text) {
  const width = 48 + text.length * 12;
  return xml`<g>
    <rect x="${x}" y="${y}" width="${width}" height="40" rx="20" fill="#0f172a" stroke="#334155"/>
    <text x="${x + 20}" y="${y + 27}" fill="${BRAND.colors.text}" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700">${text}</text>
  </g>`;
}

function actionsSvg() {
  return baseSvg(1200, 300, xml`
  <rect width="1200" height="300" fill="url(#brand-bg)"/>
  <rect width="1200" height="300" fill="url(#brand-grid)" opacity="0.85"/>
  <circle cx="120" cy="40" r="220" fill="#67e8f9" opacity="0.14"/>
  <g transform="translate(70 54)">
    ${markInner(132, 132, 24)}
    <text x="166" y="54" fill="${BRAND.colors.text}" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="700" letter-spacing="-2">GitHub Actions</text>
    <text x="168" y="96" fill="${BRAND.colors.cyan}" font-family="DejaVu Sans Mono, monospace" font-size="23" font-weight="700">${BRAND.name}</text>
    <text x="168" y="136" fill="${BRAND.colors.muted}" font-family="DejaVu Sans, Arial, sans-serif" font-size="24">${BRAND.tagline}</text>
  </g>
  <g transform="translate(680 78)">
    ${pill(0, 0, "CI")}
    ${pill(92, 0, "CodeQL")}
    ${pill(232, 0, "Pages")}
    ${pill(388, 0, "Release")}
  </g>
  <path d="M764 204 H1116" stroke="#67e8f9" stroke-opacity="0.62" stroke-width="4" stroke-linecap="round"/>
  <circle cx="764" cy="204" r="9" fill="${BRAND.colors.cyan}"/>
  <circle cx="882" cy="204" r="9" fill="${BRAND.colors.purple}"/>
  <circle cx="1000" cy="204" r="9" fill="${BRAND.colors.cyan}"/>
  <circle cx="1116" cy="204" r="9" fill="${BRAND.colors.purple}"/>
`, { label: `${BRAND.name} GitHub Actions banner` });
}

function releaseSvg() {
  return baseSvg(1600, 480, xml`
  <rect width="1600" height="480" fill="url(#brand-bg)"/>
  <rect width="1600" height="480" fill="url(#brand-grid)" opacity="0.85"/>
  <circle cx="190" cy="44" r="340" fill="#67e8f9" opacity="0.15"/>
  <circle cx="1320" cy="0" r="390" fill="#a78bfa" opacity="0.15"/>
  <g transform="translate(92 72)">
    ${markInner(128, 128, 24)}
    <text x="168" y="54" fill="${BRAND.colors.text}" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="-2">${BRAND.name}</text>
    <text x="170" y="104" fill="${BRAND.colors.cyan}" font-family="DejaVu Sans Mono, monospace" font-size="23" font-weight="700">Mermaid to assets · source maps · MCP agents</text>
  </g>
  <text x="96" y="304" fill="${BRAND.colors.text}" font-family="DejaVu Sans, Arial, sans-serif" font-size="60" font-weight="700" letter-spacing="-3">Release-ready brand assets.</text>
  <text x="100" y="360" fill="${BRAND.colors.muted}" font-family="DejaVu Sans, Arial, sans-serif" font-size="30">npm package · zip artifact · GHCR + Quay images · MCP server metadata</text>
  ${terminalCard(1030, 120, 446, 230, [
    "npm test",
    "npm pack --dry-run",
    "npm run package:zip",
  ])}
`, { label: `${BRAND.name} release banner` });
}

function assetDefinitions() {
  const icon = markSvg(512, 512);
  const appBadge = markSvg(200, 200, { appBadge: true });
  const logo = logoSvg();
  const social = heroSvg(1280, 640, "social-preview");
  return [
    { file: "logo.svg", type: "svg", width: 1200, height: 260, svg: logo, destination: "README, landing, package surfaces" },
    { file: "logo.png", type: "png", width: 1200, height: 260, svg: logo, destination: "README, landing, package surfaces" },
    { file: "icon.svg", type: "svg", width: 512, height: 512, svg: icon, destination: "Package icon source" },
    { file: "icon-200.png", type: "png", width: 200, height: 200, svg: markSvg(200, 200), destination: "Small package icon" },
    { file: "icon-512.png", type: "png", width: 512, height: 512, svg: icon, destination: "Large package icon" },
    { file: "favicon.svg", type: "svg", width: 64, height: 64, svg: markSvg(64, 64), destination: "GitHub Pages favicon" },
    { file: "repository-banner.png", type: "png", width: 1600, height: 520, svg: heroSvg(1600, 520, "repository-banner"), destination: "README and repository landing" },
    { file: "social-preview.png", type: "png", width: 1280, height: 640, svg: social, destination: "GitHub repository social preview" },
    { file: "social-preview.jpg", type: "jpg", width: 1280, height: 640, svg: social, destination: "Open Graph fallback" },
    { file: "github-app-badge.png", type: "png", width: 200, height: 200, svg: appBadge, destination: "GitHub App badge" },
    { file: "actions-banner.png", type: "png", width: 1200, height: 300, svg: actionsSvg(), destination: "GitHub Actions step summaries" },
    { file: "release-banner.png", type: "png", width: 1600, height: 480, svg: releaseSvg(), destination: "GitHub Release notes" },
  ];
}

async function loadFontBuffers() {
  return Promise.all(FONT_FILES.map((file) => fsp.readFile(file)));
}

async function renderRaster(svg, type, fontBuffers) {
  const resvg = new Resvg(svg, {
    font: {
      fontBuffers,
      defaultFontFamily: "DejaVu Sans",
      sansSerifFamily: "DejaVu Sans",
      monospaceFamily: "DejaVu Sans Mono",
    },
    background: "transparent",
  });
  const image = resvg.render();
  try {
    if (type === "png") return Buffer.from(image.asPng());
    if (type === "jpg") {
      return Buffer.from(jpeg.encode({
        data: Buffer.from(image.pixels),
        width: image.width,
        height: image.height,
      }, 88).data);
    }
    throw new Error(`unsupported raster type: ${type}`);
  } finally {
    image.free();
    resvg.free();
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function buildAssets() {
  const wasm = await fsp.readFile(REQUIRE.resolve("@resvg/resvg-wasm/index_bg.wasm"));
  await initWasm(wasm);
  const fontBuffers = await loadFontBuffers();
  const assets = [];
  for (const def of assetDefinitions()) {
    const bytes = def.type === "svg"
      ? Buffer.from(def.svg, "utf8")
      : await renderRaster(def.svg, def.type, fontBuffers);
    assets.push({ ...def, bytes, sha256: sha256(bytes), size: bytes.length });
  }
  return assets;
}

function manifestFor(assets) {
  return {
    name: BRAND.name,
    tagline: BRAND.tagline,
    brandSource: "docs/index.html landing layout",
    palette: BRAND.colors,
    assets: assets.map(({ file, type, width, height, destination, size, sha256: hash }) => ({
      file,
      type,
      width,
      height,
      bytes: size,
      sha256: hash,
      destination,
    })),
  };
}

function manifestBytes(manifest) {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function writeAssets(outputDir, assets, manifest) {
  await fsp.mkdir(outputDir, { recursive: true });
  for (const asset of assets) {
    await fsp.writeFile(path.join(outputDir, asset.file), asset.bytes);
  }
  await fsp.writeFile(path.join(outputDir, "brand-manifest.json"), manifestBytes(manifest));
  if (path.resolve(outputDir) === DEFAULT_OUTPUT_DIR) {
    const byName = new Map(assets.map((asset) => [asset.file, asset]));
    for (const copy of SECONDARY_COPIES) {
      const asset = byName.get(copy.from);
      await fsp.mkdir(path.dirname(copy.to), { recursive: true });
      await fsp.writeFile(copy.to, asset.bytes);
    }
  }
  console.log(`OK: wrote ${assets.length} brand assets to ${path.relative(ROOT, outputDir)}`);
}

async function checkAssets(outputDir, assets, manifest) {
  const failures = [];
  const byName = new Map(assets.map((asset) => [asset.file, asset]));
  for (const asset of assets) {
    const file = path.join(outputDir, asset.file);
    if (!fs.existsSync(file)) {
      failures.push(`missing file: ${asset.file}`);
      continue;
    }
    const current = await fsp.readFile(file);
    const currentHash = sha256(current);
    if (currentHash !== asset.sha256) {
      failures.push(`hash mismatch: ${asset.file}`);
    }
    if (asset.file === "social-preview.png" && current.length >= 1_000_000) {
      failures.push("social-preview.png must be <1MB for GitHub social preview");
    }
    if (asset.file === "github-app-badge.png" && current.length >= 1_000_000) {
      failures.push("github-app-badge.png must be <1MB for GitHub App badge");
    }
  }
  const manifestFile = path.join(outputDir, "brand-manifest.json");
  const expectedManifestBytes = manifestBytes(manifest);
  if (!fs.existsSync(manifestFile)) {
    failures.push("missing file: brand-manifest.json");
  } else {
    const currentManifest = await fsp.readFile(manifestFile);
    if (!currentManifest.equals(expectedManifestBytes)) {
      failures.push("hash mismatch: brand-manifest.json");
    }
  }
  if (path.resolve(outputDir) === DEFAULT_OUTPUT_DIR) {
    for (const copy of SECONDARY_COPIES) {
      const asset = byName.get(copy.from);
      if (!fs.existsSync(copy.to)) {
        failures.push(`missing file: ${copy.label}`);
        continue;
      }
      const current = await fsp.readFile(copy.to);
      if (sha256(current) !== asset.sha256) {
        failures.push(`hash mismatch: ${copy.label}`);
      }
    }
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: brand assets current in ${path.relative(ROOT, outputDir)}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const assets = await buildAssets();
  const manifest = manifestFor(assets);
  if (opts.check) {
    await checkAssets(opts.outputDir, assets, manifest);
    return;
  }
  await writeAssets(opts.outputDir, assets, manifest);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

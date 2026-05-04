import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const MCP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(MCP_DIR, "..", "..");
const RENDERER_CLI = path.join(PACKAGE_ROOT, "packages", "renderer", "render-mermaid-assets.mjs");
const SOURCE_DIAGRAMS_CLI = path.join(PACKAGE_ROOT, "packages", "source-diagrams", "source-diagrams.mjs");

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function pushOption(args, flag, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(flag, String(value));
}

async function mkOutputDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function readJsonMaybe(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function runNode(script, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function collectOutputFiles(manifest) {
  if (!manifest?.files) return [];
  return manifest.files.flatMap((entry) => Object.values(entry.outputs || {})).filter(Boolean);
}

export async function renderMermaidText(input) {
  const outputDir = path.resolve(input.outputDir || await mkOutputDir("vaults-mermaid-render-"));
  await fsp.mkdir(outputDir, { recursive: true });
  const fileName = input.fileName || "diagram.mmd";
  if (path.basename(fileName) !== fileName || !/\.(mmd|mermaid)$/i.test(fileName)) {
    throw new Error("fileName must be a basename with .mmd or .mermaid extension");
  }
  const sourceFile = path.join(outputDir, fileName);
  await fsp.writeFile(sourceFile, input.source, "utf8");
  return renderMermaidFile({ ...input, source: sourceFile, outputDir });
}

export async function renderMermaidFile(input) {
  const source = path.resolve(input.source);
  if (!fs.existsSync(source)) throw new Error(`source does not exist: ${source}`);
  const outputDir = path.resolve(input.outputDir || await mkOutputDir("vaults-mermaid-render-"));
  await fsp.mkdir(outputDir, { recursive: true });
  const manifestPath = path.resolve(input.manifest || path.join(outputDir, "render-manifest.json"));
  const args = ["--output-dir", outputDir, "--manifest", manifestPath];
  pushOption(args, "--input-root", input.inputRoot ? path.resolve(input.inputRoot) : path.dirname(source));
  pushOption(args, "--theme", input.theme);
  pushOption(args, "--background", input.background);
  pushOption(args, "--quality", input.quality);
  pushOption(args, "--raster-scale", input.rasterScale);
  if (input.png) args.push("--png");
  if (input.ascii) args.push("--ascii");
  if (input.asciiMode) args.push("--ascii-mode", input.asciiMode);
  args.push(...asArray(input.extraArgs), source);
  const result = await runNode(RENDERER_CLI, args, { env: { MMDC_VENDOR_ONLY: input.vendorOnly ? "1" : "0" } });
  const manifest = await readJsonMaybe(manifestPath);
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    source,
    outputDir,
    manifestPath,
    files: collectOutputFiles(manifest),
    manifest,
  };
}

export async function generateSourceDiagrams(input) {
  const sourceDir = path.resolve(input.sourceDir);
  if (!fs.existsSync(sourceDir)) throw new Error(`sourceDir does not exist: ${sourceDir}`);
  const outputDir = path.resolve(input.outputDir || await mkOutputDir("vaults-source-diagrams-"));
  await fsp.mkdir(outputDir, { recursive: true });
  const manifestPath = path.resolve(input.manifest || path.join(outputDir, "manifest.json"));
  const args = ["--source-dir", sourceDir, "--output-dir", outputDir, "--manifest", manifestPath];
  pushOption(args, "--langs", Array.isArray(input.langs) ? input.langs.join(",") : input.langs);
  pushOption(args, "--diagrams", Array.isArray(input.diagrams) ? input.diagrams.join(",") : input.diagrams);
  pushOption(args, "--files", Array.isArray(input.files) ? input.files.join(",") : input.files);
  for (const file of asArray(input.filesFrom)) args.push("--files-from", path.resolve(file));
  pushOption(args, "--max-nodes", input.maxNodes);
  for (const item of asArray(input.exclude)) args.push("--exclude", item);
  pushOption(args, "--adapter-mode", input.adapterMode);
  pushOption(args, "--render-mode", input.renderMode);
  if (input.noRender) args.push("--no-render");
  if (input.noIndex) args.push("--no-index");
  args.push(...asArray(input.extraArgs));
  const result = await runNode(SOURCE_DIAGRAMS_CLI, args, { env: { MMDC_VENDOR_ONLY: input.vendorOnly ? "1" : "0" } });
  const manifest = await readJsonMaybe(manifestPath);
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    sourceDir,
    outputDir,
    manifestPath,
    manifest,
  };
}

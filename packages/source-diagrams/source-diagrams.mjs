#!/usr/bin/env node
/**
 * Headless source-code -> Mermaid diagram generator.
 *
 * Generates .mmd files from source trees, then delegates SVG/JPEG rendering to
 * vaults-mermaid-render. External analyzers are optional;
 * deterministic heuristic adapters keep the CLI usable offline.
 */

import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_MERMAID_RENDERER = path.resolve(SCRIPT_DIR, "..", "renderer", "render-mermaid-assets.mjs");
const DEFAULT_MERMAID_RENDERER_SH = path.resolve(SCRIPT_DIR, "..", "renderer", "render-mermaid-assets.sh");
const MERMAID_RENDERER = process.env.VAULTS_MERMAID_RENDERER
  ? path.resolve(process.env.VAULTS_MERMAID_RENDERER)
  : DEFAULT_MERMAID_RENDERER;
const MERMAID_RENDERER_SH = process.env.VAULTS_MERMAID_RENDERER_SH
  ? path.resolve(process.env.VAULTS_MERMAID_RENDERER_SH)
  : DEFAULT_MERMAID_RENDERER_SH;
const DEFAULT_EXCLUDES = [
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
];
const LANGUAGE_ALIASES = new Map([
  ["py", "python"],
  ["python", "python"],
  ["js", "javascript"],
  ["javascript", "javascript"],
  ["ts", "typescript"],
  ["typescript", "typescript"],
  ["java", "java"],
  ["cpp", "cpp"],
  ["c++", "cpp"],
  ["c", "cpp"],
]);
const DIAGRAMS = new Set(["dependency", "class", "package", "call", "sequence"]);
const EXTENSIONS = {
  python: new Set([".py"]),
  javascript: new Set([".js", ".jsx", ".mjs", ".cjs"]),
  typescript: new Set([".ts", ".tsx"]),
  java: new Set([".java"]),
  cpp: new Set([".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"]),
};

function usage() {
  console.log(`Usage: source-diagrams.mjs --source-dir DIR --output-dir DIR [options]

Generate Mermaid (.mmd) from source code and materialize SVG/JPEG through vaults-mermaid-render.

Options:
  --source-dir DIR          Source root directory.
  --output-dir DIR          Directory where .mmd/.svg/.jpg/manifest files are written.
  --langs LIST            auto | python,javascript,typescript,java,cpp. Default: auto.
  --diagrams LIST         dependency,class,package,call,sequence. Default: dependency,class.
  --files LIST            Focus files separated by commas, relative to source-dir or absolute paths inside it.
  --files-from FILE        UTF-8 file with one focus file per line; ignores empty lines and # comments.
  --max-nodes N            Maximum nodes per heuristic diagram. Default: 120.
  --exclude PATTERN         Name/path to ignore; can be repeated or comma-separated.
  --manifest FILE          Path to the final manifest. Default: <output-dir>/manifest.json.
  --adapter-mode MODE      auto | external | heuristic. Default: auto.
  --render-mode MODE       canonical | placeholder. Default: canonical.
  --no-render              Generate only .mmd and manifest files; do not call vaults-mermaid-render.
  --no-index               Do not generate INDEX.md.
  -h, --help               Mostra esta ajuda.

Exemplo:
  node tools/source-diagrams/source-diagrams.mjs \\
    --source-dir /repo/src \\
    --output-dir /tmp/source-diagrams \\
    --langs auto \\
    --diagrams dependency,class
`);
}

function parseArgs(argv) {
  if (argv.length === 0) {
    usage();
    process.exit(0);
  }
  const opts = {
    sourceDir: null,
    outputDir: null,
    manifest: null,
    langs: "auto",
    diagrams: ["dependency", "class"],
    files: [],
    filesFrom: [],
    maxNodes: 120,
    excludes: [...DEFAULT_EXCLUDES],
    render: true,
    index: true,
    adapterMode: (process.env.SOURCE_DIAGRAMS_ADAPTER_MODE || "auto").toLowerCase(),
    renderMode: (process.env.SOURCE_DIAGRAMS_RENDER_MODE || "canonical").toLowerCase(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--source-dir") {
      opts.sourceDir = path.resolve(requiredValue(argv[++i], "source-dir"));
      continue;
    }
    if (arg === "--output-dir") {
      opts.outputDir = path.resolve(requiredValue(argv[++i], "output-dir"));
      continue;
    }
    if (arg === "--langs") {
      opts.langs = requiredValue(argv[++i], "langs");
      continue;
    }
    if (arg === "--diagrams") {
      opts.diagrams = splitList(requiredValue(argv[++i], "diagrams"));
      continue;
    }
    if (arg === "--files") {
      opts.files.push(...splitList(requiredValue(argv[++i], "files")));
      continue;
    }
    if (arg === "--files-from") {
      opts.filesFrom.push(path.resolve(requiredValue(argv[++i], "files-from")));
      continue;
    }
    if (arg === "--max-nodes") {
      opts.maxNodes = parsePositiveInt(requiredValue(argv[++i], "max-nodes"), "max-nodes");
      continue;
    }
    if (arg === "--exclude") {
      opts.excludes.push(...splitList(requiredValue(argv[++i], "exclude")));
      continue;
    }
    if (arg === "--manifest") {
      opts.manifest = path.resolve(requiredValue(argv[++i], "manifest"));
      continue;
    }
    if (arg === "--adapter-mode") {
      opts.adapterMode = requiredValue(argv[++i], "adapter-mode").toLowerCase();
      continue;
    }
    if (arg === "--render-mode") {
      opts.renderMode = requiredValue(argv[++i], "render-mode").toLowerCase();
      continue;
    }
    if (arg === "--no-render") {
      opts.render = false;
      continue;
    }
    if (arg === "--no-index") {
      opts.index = false;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }

  if (!opts.sourceDir) throw new Error("--source-dir is required.");
  if (!opts.outputDir) throw new Error("--output-dir is required.");
  if (!opts.manifest) opts.manifest = path.join(opts.outputDir, "manifest.json");
  if (!["auto", "external", "heuristic"].includes(opts.adapterMode)) {
    throw new Error("--adapter-mode accepts only auto, external, or heuristic.");
  }
  if (!["canonical", "placeholder"].includes(opts.renderMode)) {
    throw new Error("--render-mode accepts only canonical or placeholder.");
  }
  opts.diagrams = opts.diagrams.map((diagram) => diagram.toLowerCase());
  for (const diagram of opts.diagrams) {
    if (!DIAGRAMS.has(diagram)) throw new Error(`unknown diagram: ${diagram}`);
  }
  opts.langs = parseLangs(opts.langs);
  opts.excludes = [...new Set(opts.excludes.filter(Boolean))];
  opts.selection = null;
  return opts;
}

function requiredValue(value, name) {
  if (!value) throw new Error(`missing value for --${name}`);
  return value;
}

function splitList(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

function parseLangs(value) {
  if (value === "auto") return "auto";
  return splitList(value).map((lang) => {
    const normalized = LANGUAGE_ALIASES.get(lang.toLowerCase());
    if (!normalized) throw new Error(`unknown language: ${lang}`);
    return normalized;
  });
}

async function assertInputs(opts) {
  let stat;
  try {
    stat = await fsp.stat(opts.sourceDir);
  } catch {
    throw new Error(`source-dir does not exist: ${opts.sourceDir}`);
  }
  if (!stat.isDirectory()) throw new Error(`source-dir is not a directory: ${opts.sourceDir}`);
  await fsp.mkdir(opts.outputDir, { recursive: true });
}

async function resolveFileSelection(opts, allFiles) {
  const requested = [...opts.files];
  for (const file of opts.filesFrom) {
    let text;
    try {
      text = await fsp.readFile(file, "utf8");
    } catch {
      throw new Error(`files-from does not exist or cannot be read: ${file}`);
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      requested.push(trimmed);
    }
  }
  if (requested.length === 0) return null;

  const available = new Set(allFiles.map((file) => rel(opts.sourceDir, file)));
  const requestedFiles = [];
  const seen = new Set();

  for (const item of requested) {
    const absolute = path.resolve(path.isAbsolute(item) ? item : path.join(opts.sourceDir, item));
    const relative = rel(opts.sourceDir, absolute);
    if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
      throw new Error(`selected file outside source-dir: ${item}`);
    }
    if (!fs.existsSync(absolute)) throw new Error(`selected file does not exist: ${item}`);
    const stat = await fsp.stat(absolute);
    if (!stat.isFile()) throw new Error(`selected path is not a file: ${item}`);
    if (!available.has(relative)) throw new Error(`selected file omitted by --exclude: ${relative}`);
    if (seen.has(relative)) continue;
    seen.add(relative);
    requestedFiles.push(relative);
  }

  return { requestedFiles };
}

async function collectSourceFiles(sourceDir, excludes) {
  const files = [];
  const excludeSet = new Set(excludes.map((entry) => entry.replaceAll("\\", "/")));

  async function visit(current) {
    const rel = path.relative(sourceDir, current).replaceAll(path.sep, "/");
    const base = path.basename(current);
    if (rel && (excludeSet.has(base) || excludeSet.has(rel))) return;
    const stat = await fsp.stat(current);
    if (stat.isDirectory()) {
      const entries = await fsp.readdir(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) await visit(path.join(current, entry.name));
      return;
    }
    if (stat.isFile()) files.push(path.resolve(current));
  }

  await visit(sourceDir);
  return files.sort((a, b) => a.localeCompare(b));
}

async function detectLanguages(opts, files) {
  if (opts.langs !== "auto") return opts.langs;
  const found = new Set();
  const names = new Set(files.map((file) => path.basename(file)));
  if (names.has("pyproject.toml") || names.has("requirements.txt") || files.some((f) => EXTENSIONS.python.has(path.extname(f)))) found.add("python");
  if (names.has("package.json") || files.some((f) => EXTENSIONS.javascript.has(path.extname(f)))) found.add("javascript");
  if (names.has("tsconfig.json") || files.some((f) => EXTENSIONS.typescript.has(path.extname(f)))) {
    found.delete("javascript");
    found.add("typescript");
  }
  if (names.has("pom.xml") || names.has("build.gradle") || names.has("settings.gradle") || files.some((f) => EXTENSIONS.java.has(path.extname(f)))) found.add("java");
  if (names.has("compile_commands.json") || files.some((f) => EXTENSIONS.cpp.has(path.extname(f)))) found.add("cpp");
  return [...found];
}

function filesForLanguage(language, files) {
  const exts = EXTENSIONS[language] || new Set();
  if (language === "typescript") {
    return files.filter((file) => EXTENSIONS.typescript.has(path.extname(file)) || EXTENSIONS.javascript.has(path.extname(file)) || ["package.json", "tsconfig.json"].includes(path.basename(file)));
  }
  if (language === "javascript") {
    return files.filter((file) => EXTENSIONS.javascript.has(path.extname(file)) || path.basename(file) === "package.json");
  }
  return files.filter((file) => exts.has(path.extname(file)) || languageManifestMatch(language, path.basename(file)));
}

function languageManifestMatch(language, basename) {
  if (language === "python") return ["pyproject.toml", "requirements.txt"].includes(basename);
  if (language === "java") return ["pom.xml", "build.gradle", "settings.gradle"].includes(basename);
  if (language === "cpp") return basename === "compile_commands.json";
  return false;
}

async function generateAll(opts, files, languages) {
  const runs = [];
  for (const language of languages) {
    const languageFiles = filesForLanguage(language, files);
    if (languageFiles.length === 0) continue;
    for (const diagram of opts.diagrams) {
      const result = await generateDiagram(opts, language, diagram, languageFiles);
      if (result) runs.push(result);
    }
  }
  return runs;
}

async function generateDiagram(opts, language, diagram, languageFiles) {
  const outputBase = path.join(opts.outputDir, language, diagram);
  const mmdPath = `${outputBase}.mmd`;
  await fsp.mkdir(path.dirname(mmdPath), { recursive: true });

  const external = opts.selection || opts.adapterMode === "heuristic" ? null : await tryExternalAdapter(opts, language, diagram, mmdPath);
  const generated = external || heuristicDiagram(opts, language, diagram, languageFiles);
  if (!generated) return null;
  await fsp.writeFile(mmdPath, ensureTrailingNewline(generated.mmd), "utf8");

  return {
    language,
    diagram,
    adapter: generated.adapter,
    confidence: generated.confidence,
    command: generated.command,
    status: "ok",
    error: null,
    sourceCount: languageFiles.length,
    nodes: generated.nodes,
    edges: generated.edges,
    selection: generated.selection || null,
    outputs: {
      mmd: mmdPath,
      svg: `${outputBase}.svg`,
      jpg: `${outputBase}.jpg`,
    },
  };
}

async function tryExternalAdapter(opts, language, diagram, mmdPath) {
  const attempts = [];
  if (language === "python" && ["class", "package"].includes(diagram)) {
    attempts.push(() => runPyreverse(opts, diagram, mmdPath));
  }
  if (language === "python" && diagram === "call") attempts.push(() => runPyCodeVisualizer(opts, mmdPath));
  if (["javascript", "typescript"].includes(language) && diagram === "dependency") attempts.push(() => runDependencyCruiser(opts, mmdPath));
  if (language === "typescript" && diagram === "class") attempts.push(() => runTsUml2(opts, mmdPath));
  if (language === "java" && diagram === "dependency") attempts.push(() => runMavenDependencyTree(opts, mmdPath));
  if (language === "cpp" && ["class", "dependency", "package"].includes(diagram)) attempts.push(() => runClangUml(opts, diagram, mmdPath));

  for (const attempt of attempts) {
    const result = await attempt();
    if (result) return result;
  }
  if (opts.adapterMode === "external") {
    throw new Error(`no external adapter available for ${language}/${diagram}`);
  }
  return null;
}

async function runPyreverse(opts, diagram, mmdPath) {
  if (!commandExists("pyreverse")) return null;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "source-diagrams-pyreverse-"));
  const project = safeFileName(path.basename(opts.sourceDir) || "source");
  const args = ["-o", "mmd", "-p", project, opts.sourceDir];
  const result = spawnSync("pyreverse", args, { cwd: tmp, encoding: "utf8" });
  if (result.status !== 0) return null;
  const candidates = (await fsp.readdir(tmp)).filter((name) => name.endsWith(".mmd"));
  const needle = diagram === "package" ? "packages" : "classes";
  const match = candidates.find((name) => name.includes(needle)) || candidates[0];
  if (!match) return null;
  const mmd = await fsp.readFile(path.join(tmp, match), "utf8");
  return { adapter: "pyreverse", confidence: "external", command: commandString("pyreverse", args), mmd, nodes: null, edges: null };
}

async function runPyCodeVisualizer(opts, mmdPath) {
  if (!commandExists("py-code-visualizer")) return null;
  const args = [opts.sourceDir, "--format", "mermaid", "-o", mmdPath];
  const result = spawnSync("py-code-visualizer", args, { cwd: opts.sourceDir, encoding: "utf8" });
  if (result.status !== 0 || !fs.existsSync(mmdPath)) return null;
  const mmd = await fsp.readFile(mmdPath, "utf8");
  return { adapter: "py-code-visualizer", confidence: "external", command: commandString("py-code-visualizer", args), mmd, nodes: null, edges: null };
}

async function runDependencyCruiser(opts, mmdPath) {
  if (!commandExists("depcruise")) return null;
  const args = [opts.sourceDir, "--output-type", "mermaid"];
  const result = spawnSync("depcruise", args, { cwd: opts.sourceDir, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return { adapter: "dependency-cruiser", confidence: "external", command: commandString("depcruise", args), mmd: result.stdout, nodes: null, edges: null };
}

async function runTsUml2(opts, mmdPath) {
  if (!commandExists("tsuml2")) return null;
  const glob = path.join(opts.sourceDir, "**", "!(*.d|*.spec|*.test).ts");
  const args = ["--glob", glob, "--outMermaidDsl", mmdPath];
  const result = spawnSync("tsuml2", args, { cwd: opts.sourceDir, encoding: "utf8" });
  if (result.status !== 0 || !fs.existsSync(mmdPath)) return null;
  const mmd = await fsp.readFile(mmdPath, "utf8");
  return { adapter: "tsuml2", confidence: "external", command: commandString("tsuml2", args), mmd, nodes: null, edges: null };
}

async function runMavenDependencyTree(opts) {
  if (!commandExists("mvn") || !fs.existsSync(path.join(opts.sourceDir, "pom.xml"))) return null;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "source-diagrams-maven-"));
  const jsonPath = path.join(tmp, "dependency-tree.json");
  const args = ["-q", "dependency:tree", "-DoutputType=json", `-DoutputFile=${jsonPath}`];
  const result = spawnSync("mvn", args, { cwd: opts.sourceDir, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0 || !fs.existsSync(jsonPath)) return null;
  try {
    const tree = JSON.parse(await fsp.readFile(jsonPath, "utf8"));
    const graph = graphFromMavenTree(tree);
    return { adapter: "maven-dependency-plugin", confidence: "external", command: commandString("mvn", args), mmd: flowchartMmd("Java Maven dependency graph", graph.nodes, graph.edges), nodes: graph.nodes.length, edges: graph.edges.length };
  } catch {
    return null;
  }
}

async function runClangUml(opts, diagram, mmdPath) {
  if (!commandExists("clang-uml")) return null;
  const config = [".clang-uml", ".clang-uml.yaml", ".clang-uml.yml"].map((name) => path.join(opts.sourceDir, name)).find((file) => fs.existsSync(file));
  if (!config) return null;
  const args = ["-g", "mermaid", "-o", path.dirname(mmdPath), "-c", config];
  const result = spawnSync("clang-uml", args, { cwd: opts.sourceDir, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) return null;
  const candidates = await collectMmdFiles(path.dirname(mmdPath));
  const match = candidates.find((file) => path.basename(file).includes(diagram)) || candidates[0];
  if (!match) return null;
  const mmd = await fsp.readFile(match, "utf8");
  return { adapter: "clang-uml", confidence: "external", command: commandString("clang-uml", args), mmd, nodes: null, edges: null };
}

function heuristicDiagram(opts, language, diagram, languageFiles) {
  if (opts.selection && diagram === "dependency") return focusedDependency(opts, language, languageFiles);
  if (diagram === "sequence") {
    if (!opts.selection) throw new Error("sequence requires --files or --files-from to select the flow endpoints.");
    return focusedSequence(opts, language, languageFiles);
  }
  const sourceFiles = languageFiles.filter((file) => !languageManifestMatch(language, path.basename(file))).slice(0, opts.maxNodes);
  if (diagram === "dependency") return heuristicDependency(opts, language, sourceFiles);
  if (diagram === "class") return heuristicClass(opts, language, sourceFiles);
  if (diagram === "package") return heuristicPackage(opts, language, sourceFiles);
  if (diagram === "call") return heuristicCall(opts, language, sourceFiles);
  return null;
}

function buildFocusedSelection(opts, language, languageFiles) {
  const sourceFiles = languageFiles.filter((file) => !languageManifestMatch(language, path.basename(file)));
  const fileSet = new Set(sourceFiles.map((file) => rel(opts.sourceDir, file)));
  const requested = opts.selection.requestedFiles.filter((file) => fileSet.has(file));
  if (requested.length === 0) return null;
  if (requested.length > opts.maxNodes) {
    throw new Error(`--max-nodes is lower than the focused selection (${opts.maxNodes} < ${requested.length}).`);
  }

  const moduleIndex = moduleIndexFor(language, opts.sourceDir, sourceFiles);
  const graph = dependencyGraphFor(language, opts.sourceDir, sourceFiles, moduleIndex);
  const selected = new Set(requested);
  const edgeInfos = [];
  const seenPairs = new Set();

  for (const from of requested) {
    const paths = shortestPathsToSelected(from, graph, selected);
    for (const pathItems of paths) {
      const to = pathItems.at(-1);
      const key = `${from}\u0000${to}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const omittedFiles = pathItems.slice(1, -1);
      const label = omittedFiles.length === 0
        ? null
        : omittedFiles.length === 1
          ? `via ${omittedFiles[0]}`
          : `via ${omittedFiles.length} files`;
      edgeInfos.push({ from, to, omittedFiles, label });
    }
  }

  const connected = new Set(edgeInfos.flatMap((edge) => [edge.from, edge.to]));
  const diagramFiles = requested.filter((file) => connected.has(file));
  const prunedIsolatedFiles = requested.filter((file) => !connected.has(file));
  if (edgeInfos.length === 0) {
    throw new Error("no real connection between selected files; all remained isolated.");
  }

  const omittedConnectorFiles = uniqueItems(edgeInfos.flatMap((edge) => edge.omittedFiles)).sort((a, b) => a.localeCompare(b));
  const warnings = prunedIsolatedFiles.map((file) => `selected file without a real connection omitted from the diagram: ${file}`);
  const edgesFromOmittedFiles = edgeInfos.map((edge) => ({
    from: edge.from,
    to: edge.to,
    omittedFiles: edge.omittedFiles,
    label: edge.label,
  }));

  return {
    requestedFiles: opts.selection.requestedFiles,
    diagramFiles,
    edgeInfos,
    omittedConnectorFiles,
    edgesFromOmittedFiles,
    prunedIsolatedFiles,
    warnings,
  };
}

function selectionMetadata(focused) {
  return {
    requestedFiles: focused.requestedFiles,
    diagramFiles: focused.diagramFiles,
    omittedConnectorFiles: focused.omittedConnectorFiles,
    edgesFromOmittedFiles: focused.edgesFromOmittedFiles,
    prunedIsolatedFiles: focused.prunedIsolatedFiles,
    warnings: focused.warnings,
  };
}

function focusedDependency(opts, language, languageFiles) {
  const focused = buildFocusedSelection(opts, language, languageFiles);
  if (!focused) return null;
  return {
    adapter: `${language}-heuristic-focused-dependency`,
    confidence: "heuristic",
    command: null,
    mmd: flowchartMmd(
      `${displayLanguage(language)} focused dependency graph`,
      focused.diagramFiles,
      focused.edgeInfos.map((edge) => [edge.from, edge.to, edge.label]),
    ),
    nodes: focused.diagramFiles.length,
    edges: focused.edgeInfos.length,
    selection: selectionMetadata(focused),
  };
}

function focusedSequence(opts, language, languageFiles) {
  const focused = buildFocusedSelection(opts, language, languageFiles);
  if (!focused) return null;
  return {
    adapter: `${language}-heuristic-focused-sequence`,
    confidence: "heuristic",
    command: null,
    mmd: sequenceMmd(
      `${displayLanguage(language)} focused sequence graph`,
      focused.diagramFiles,
      focused.edgeInfos,
    ),
    nodes: focused.diagramFiles.length,
    edges: focused.edgeInfos.length,
    selection: selectionMetadata(focused),
  };
}

function dependencyGraphFor(language, sourceDir, files, moduleIndex) {
  const graph = new Map();
  for (const file of files) {
    const from = rel(sourceDir, file);
    graph.set(from, uniqueItems(importsFor(language, sourceDir, file, readTextSync(file), moduleIndex)));
  }
  return graph;
}

function shortestPathsToSelected(from, graph, selected) {
  const out = [];
  const queue = [[from]];
  const visited = new Set([from]);
  while (queue.length) {
    const currentPath = queue.shift();
    const current = currentPath.at(-1);
    for (const next of graph.get(current) || []) {
      if (visited.has(next)) continue;
      const nextPath = [...currentPath, next];
      if (selected.has(next) && next !== from) {
        out.push(nextPath);
        continue;
      }
      visited.add(next);
      queue.push(nextPath);
    }
  }
  return out;
}

function heuristicDependency(opts, language, files) {
  const nodes = files.map((file) => rel(opts.sourceDir, file));
  const moduleIndex = moduleIndexFor(language, opts.sourceDir, files);
  const edges = uniqueEdges(files.flatMap((file) => importsFor(language, opts.sourceDir, file, readTextSync(file), moduleIndex).map((target) => [rel(opts.sourceDir, file), target])));
  const graph = limitGraph(nodes, edges, opts.maxNodes);
  if (graph.edges.length === 0) addContainmentEdges(graph.nodes, graph.edges, language);
  return {
    adapter: `${language}-heuristic-dependency`,
    confidence: "heuristic",
    command: null,
    mmd: flowchartMmd(`${displayLanguage(language)} dependency graph`, graph.nodes, graph.edges),
    nodes: graph.nodes.length,
    edges: graph.edges.length,
  };
}

function heuristicPackage(opts, language, files) {
  const packages = [...new Set(files.map((file) => packageNameFor(language, opts.sourceDir, file)).filter(Boolean))].slice(0, opts.maxNodes);
  const fileToPkg = new Map(files.map((file) => [rel(opts.sourceDir, file), packageNameFor(language, opts.sourceDir, file)]));
  const moduleIndex = moduleIndexFor(language, opts.sourceDir, files);
  const edges = uniqueEdges(files.flatMap((file) => {
    const fromPkg = fileToPkg.get(rel(opts.sourceDir, file));
    if (!fromPkg) return [];
    return importsFor(language, opts.sourceDir, file, readTextSync(file), moduleIndex)
      .map((target) => fileToPkg.get(target))
      .filter((toPkg) => toPkg && toPkg !== fromPkg)
      .map((toPkg) => [fromPkg, toPkg]);
  }));
  if (edges.length === 0 && packages.length > 1) {
    for (let i = 0; i < packages.length - 1; i += 1) edges.push([packages[i], packages[i + 1]]);
  }
  return {
    adapter: `${language}-heuristic-package`,
    confidence: "heuristic",
    command: null,
    mmd: flowchartMmd(`${displayLanguage(language)} package graph`, packages.length ? packages : [displayLanguage(language)], edges),
    nodes: packages.length,
    edges: edges.length,
  };
}

function heuristicClass(opts, language, files) {
  const classes = [];
  const relations = [];
  for (const file of files) {
    const text = readTextSync(file);
    const parsed = classesFor(language, text);
    classes.push(...parsed.classes);
    relations.push(...parsed.relations);
  }
  const dedupedClasses = uniqueBy(classes, (item) => item.name).slice(0, opts.maxNodes);
  const classNames = new Set(dedupedClasses.map((item) => item.name));
  const dedupedRelations = uniqueEdges(relations.filter(([from, to]) => classNames.has(from) && classNames.has(to)));
  const mmd = classDiagramMmd(`${displayLanguage(language)} class diagram`, dedupedClasses, dedupedRelations);
  return {
    adapter: `${language}-heuristic-class`,
    confidence: "heuristic",
    command: null,
    mmd,
    nodes: dedupedClasses.length,
    edges: dedupedRelations.length,
  };
}

function heuristicCall(opts, language, files) {
  const functions = [];
  const edges = [];
  for (const file of files) {
    const text = readTextSync(file);
    const parsed = functionsFor(language, text, rel(opts.sourceDir, file));
    functions.push(...parsed.functions);
    edges.push(...parsed.edges);
  }
  const nodes = uniqueBy(functions, (name) => name).slice(0, opts.maxNodes);
  const nodeSet = new Set(nodes);
  const filteredEdges = uniqueEdges(edges.filter(([from, to]) => nodeSet.has(from) && nodeSet.has(to)));
  if (filteredEdges.length === 0 && nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i += 1) filteredEdges.push([nodes[i], nodes[i + 1]]);
  }
  return {
    adapter: `${language}-heuristic-call`,
    confidence: "heuristic",
    command: null,
    mmd: flowchartMmd(`${displayLanguage(language)} call graph`, nodes.length ? nodes : [`${displayLanguage(language)} source`], filteredEdges),
    nodes: nodes.length,
    edges: filteredEdges.length,
  };
}

function moduleIndexFor(language, sourceDir, files) {
  const index = new Map();
  for (const file of files) {
    const relative = rel(sourceDir, file);
    const parsed = path.parse(relative);
    const noExt = path.join(parsed.dir, parsed.name).replaceAll(path.sep, "/");
    index.set(relative, relative);
    index.set(noExt, relative);
    index.set(noExt.replaceAll("/", "."), relative);
    index.set(parsed.name, relative);
    if (language === "java") {
      const text = readTextSync(file);
      const pkg = text.match(/\bpackage\s+([\w.]+)\s*;/)?.[1];
      const cls = text.match(/\b(?:class|interface|enum)\s+(\w+)/)?.[1];
      if (pkg && cls) index.set(`${pkg}.${cls}`, relative);
    }
  }
  return index;
}

function importsFor(language, sourceDir, file, text, moduleIndex) {
  if (language === "python") return pythonImports(sourceDir, file, text, moduleIndex);
  if (["javascript", "typescript"].includes(language)) return jsImports(sourceDir, file, text, moduleIndex);
  if (language === "java") return javaImports(text, moduleIndex);
  if (language === "cpp") return cppImports(sourceDir, file, text, moduleIndex);
  return [];
}

function pythonImports(sourceDir, file, text, moduleIndex) {
  const targets = [];
  const importRe = /^\s*import\s+([\w.,\s]+)/gm;
  const fromRe = /^\s*from\s+([\w.]+)\s+import\s+([\w*,\s]+)/gm;
  for (const match of text.matchAll(importRe)) {
    for (const mod of match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0])) {
      const target = moduleIndex.get(mod) || moduleIndex.get(mod.split(".").slice(0, -1).join("."));
      if (target) targets.push(target);
    }
  }
  for (const match of text.matchAll(fromRe)) {
    const target = moduleIndex.get(match[1]) || moduleIndex.get(`${match[1]}.${match[2].split(",")[0].trim()}`);
    if (target) targets.push(target);
  }
  return targets.filter((target) => target !== rel(sourceDir, file));
}

function jsImports(sourceDir, file, text, moduleIndex) {
  const targets = [];
  const importRe = /(?:import\s+(?:[^'\"]+?\s+from\s+)?|require\()\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(importRe)) {
    const spec = match[1];
    if (!spec.startsWith(".")) continue;
    const resolvedBase = path.normalize(path.join(path.dirname(rel(sourceDir, file)), spec)).replaceAll(path.sep, "/");
    const target = moduleIndex.get(resolvedBase) || moduleIndex.get(`${resolvedBase}/index`);
    if (target) targets.push(target);
  }
  return targets.filter((target) => target !== rel(sourceDir, file));
}

function javaImports(text, moduleIndex) {
  const targets = [];
  for (const match of text.matchAll(/\bimport\s+([\w.]+)\s*;/g)) {
    const target = moduleIndex.get(match[1]);
    if (target) targets.push(target);
  }
  return targets;
}

function cppImports(sourceDir, file, text, moduleIndex) {
  const targets = [];
  for (const match of text.matchAll(/^\s*#include\s+"([^"]+)"/gm)) {
    const resolvedBase = path.normalize(path.join(path.dirname(rel(sourceDir, file)), match[1])).replaceAll(path.sep, "/");
    const target = moduleIndex.get(stripKnownExt(resolvedBase)) || moduleIndex.get(resolvedBase);
    if (target) targets.push(target);
  }
  return targets.filter((target) => target !== rel(sourceDir, file));
}

function classesFor(language, text) {
  if (language === "python") return pythonClasses(text);
  if (["javascript", "typescript"].includes(language)) return tsClasses(text);
  if (language === "java") return javaClasses(text);
  if (language === "cpp") return cppClasses(text);
  return { classes: [], relations: [] };
}

function pythonClasses(text) {
  const classes = [];
  const relations = [];
  for (const match of text.matchAll(/^\s*class\s+([A-Za-z_]\w*)(?:\(([^)]*)\))?:/gm)) {
    const name = sanitizeClassName(match[1]);
    classes.push({ name, kind: "class" });
    for (const base of (match[2] || "").split(",").map((part) => sanitizeClassName(part.trim().split(".").pop())).filter(Boolean)) {
      classes.push({ name: base, kind: "class" });
      relations.push([name, base]);
    }
  }
  return { classes, relations };
}

function tsClasses(text) {
  const classes = [];
  const relations = [];
  for (const match of text.matchAll(/\b(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/g)) {
    const name = sanitizeClassName(match[1]);
    classes.push({ name, kind: "class" });
    if (match[2]) {
      const base = sanitizeClassName(match[2]);
      classes.push({ name: base, kind: "class" });
      relations.push([name, base]);
    }
  }
  for (const match of text.matchAll(/\b(?:export\s+)?interface\s+(\w+)/g)) classes.push({ name: sanitizeClassName(match[1]), kind: "interface" });
  for (const match of text.matchAll(/\b(?:export\s+)?enum\s+(\w+)/g)) classes.push({ name: sanitizeClassName(match[1]), kind: "enum" });
  return { classes, relations };
}

function javaClasses(text) {
  const classes = [];
  const relations = [];
  for (const match of text.matchAll(/\b(class|interface|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,.]+))?/g)) {
    const kind = match[1];
    const name = sanitizeClassName(match[2]);
    classes.push({ name, kind });
    if (match[3]) {
      const base = sanitizeClassName(match[3]);
      classes.push({ name: base, kind: "class" });
      relations.push([name, base]);
    }
    for (const iface of (match[4] || "").split(",").map((part) => sanitizeClassName(part.trim())).filter(Boolean)) {
      classes.push({ name: iface, kind: "interface" });
      relations.push([name, iface]);
    }
  }
  return { classes, relations };
}

function cppClasses(text) {
  const classes = [];
  const relations = [];
  for (const match of text.matchAll(/\b(class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)?\s*([\w:]+))?/g)) {
    const name = sanitizeClassName(match[2]);
    classes.push({ name, kind: match[1] });
    if (match[3]) {
      const base = sanitizeClassName(match[3].split("::").pop());
      classes.push({ name: base, kind: "class" });
      relations.push([name, base]);
    }
  }
  return { classes, relations };
}

function functionsFor(language, text, fileLabel) {
  const functions = [];
  if (language === "python") {
    for (const match of text.matchAll(/^\s*def\s+([A-Za-z_]\w*)\s*\(/gm)) functions.push(`${fileLabel}:${match[1]}()`);
  } else if (["javascript", "typescript"].includes(language)) {
    for (const match of text.matchAll(/\bfunction\s+(\w+)\s*\(|\b(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g)) functions.push(`${fileLabel}:${match[1] || match[2]}()`);
  } else if (language === "java") {
    for (const match of text.matchAll(/\b(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*\{/g)) functions.push(`${fileLabel}:${match[1]}()`);
  } else if (language === "cpp") {
    for (const match of text.matchAll(/\b[\w:<>~]+\s+(\w+)\s*\([^)]*\)\s*\{/g)) functions.push(`${fileLabel}:${match[1]}()`);
  }
  return { functions, edges: [] };
}

function graphFromMavenTree(root) {
  const nodes = [];
  const edges = [];
  function label(node) {
    return [node.groupId, node.artifactId, node.version].filter(Boolean).join(":") || node.name || "artifact";
  }
  function visit(node) {
    const from = label(node);
    nodes.push(from);
    for (const child of node.children || []) {
      const to = label(child);
      nodes.push(to);
      edges.push([from, to]);
      visit(child);
    }
  }
  visit(root);
  return { nodes: [...new Set(nodes)], edges: uniqueEdges(edges) };
}

function flowchartMmd(title, nodes, edges) {
  const dedupedNodes = [...new Set(nodes.filter(Boolean))];
  const idByNode = new Map(dedupedNodes.map((node, index) => [node, `N${index + 1}`]));
  const lines = ["flowchart LR"];
  for (const node of dedupedNodes) lines.push(`  ${idByNode.get(node)}["${escapeMermaidLabel(node)}"]`);
  for (const [from, to, label] of edges) {
    if (idByNode.has(from) && idByNode.has(to)) {
      const arrow = label ? `-- "${escapeMermaidLabel(label)}" -->` : "-->";
      lines.push(`  ${idByNode.get(from)} ${arrow} ${idByNode.get(to)}`);
    }
  }
  if (dedupedNodes.length === 0) lines.push('  Empty["No items detected"]');
  return lines.join("\n");
}

function sequenceMmd(title, nodes, edges) {
  const dedupedNodes = [...new Set(nodes.filter(Boolean))];
  const idByNode = new Map(dedupedNodes.map((node, index) => [node, `N${index + 1}`]));
  const lines = ["sequenceDiagram"];
  for (const node of dedupedNodes) {
    lines.push(`  participant ${idByNode.get(node)} as ${escapeMermaidSequenceText(node)}`);
  }
  for (const edge of edges) {
    if (idByNode.has(edge.from) && idByNode.has(edge.to)) {
      lines.push(`  ${idByNode.get(edge.from)}->>${idByNode.get(edge.to)}: ${escapeMermaidSequenceText(edge.label || "direct link")}`);
    }
  }
  if (dedupedNodes.length === 0) lines.push("  participant Empty as No items detected");
  return lines.join("\n");
}

function classDiagramMmd(title, classes, relations) {
  const deduped = uniqueBy(classes, (item) => item.name).filter((item) => item.name);
  const lines = ["classDiagram"];
  if (deduped.length === 0) {
    lines.push("  class Source");
    return lines.join("\n");
  }
  for (const item of deduped) {
    lines.push(`  class ${item.name}`);
    if (item.kind === "interface") lines.push(`  <<interface>> ${item.name}`);
    if (item.kind === "enum") lines.push(`  <<enumeration>> ${item.name}`);
    if (item.kind === "struct") lines.push(`  <<struct>> ${item.name}`);
  }
  for (const [from, to] of relations) lines.push(`  ${to} <|-- ${from}`);
  return lines.join("\n");
}

async function renderOutputs(opts, runs) {
  if (!opts.render || runs.length === 0) return { status: "skipped", manifest: null, error: null };
  if (opts.renderMode === "placeholder") {
    await writePlaceholderOutputs(runs);
    return { status: "ok", manifest: null, renderer: "source-diagrams-placeholder", error: null };
  }
  const renderManifest = path.join(opts.outputDir, "render-manifest.json");
  const args = [
    MERMAID_RENDERER,
    "--output-dir", opts.outputDir,
    "--input-root", opts.outputDir,
    "--manifest", renderManifest,
    opts.outputDir,
  ];
  const first = spawnSync(process.execPath, args, {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    env: { ...process.env, MMDC_VENDOR_ONLY: process.env.MMDC_VENDOR_ONLY || "1" },
  });
  if (first.status === 0) return { status: "ok", manifest: renderManifest, renderer: MERMAID_RENDERER, error: null };

  const fallback = spawnSync(MERMAID_RENDERER_SH, [opts.outputDir], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    env: { ...process.env, MMDC_VENDOR_ONLY: "0", MMDC_RENDER_ENGINE: process.env.MMDC_RENDER_ENGINE || "mmdc" },
  });
  if (fallback.status === 0) {
    return {
      status: "ok",
      manifest: renderManifest,
      renderer: MERMAID_RENDERER_SH,
      fallbackFrom: MERMAID_RENDERER,
      fallbackReason: first.stderr || first.stdout,
      error: null,
    };
  }
  return {
    status: "error",
    manifest: renderManifest,
    renderer: MERMAID_RENDERER,
    fallbackRenderer: MERMAID_RENDERER_SH,
    error: [first.stderr || first.stdout, fallback.stderr || fallback.stdout].filter(Boolean).join("\n--- fallback ---\n"),
  };
}

async function writePlaceholderOutputs(runs) {
  for (const run of runs) {
    const mmd = await fsp.readFile(run.outputs.mmd, "utf8");
    await fsp.mkdir(path.dirname(run.outputs.svg), { recursive: true });
    const lines = stripFrontmatter(mmd).split(/\r?\n/).slice(0, 24);
    const text = lines.map((line, index) => `<text x="24" y="${42 + index * 18}" font-family="Menlo, monospace" font-size="13" fill="#1f2937">${escapeXml(line.slice(0, 110))}</text>`).join("\n  ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-label="${escapeXml(run.language)} ${escapeXml(run.diagram)} placeholder">\n  <rect width="1200" height="720" fill="#ffffff"/>\n  <rect x="12" y="12" width="1176" height="696" rx="18" fill="#f8fafc" stroke="#94a3b8"/>\n  <text x="24" y="28" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${escapeXml(displayLanguage(run.language))} ${escapeXml(run.diagram)} Mermaid source</text>\n  ${text}\n</svg>\n`;
    await fsp.writeFile(run.outputs.svg, svg, "utf8");
    await fsp.writeFile(run.outputs.jpg, PLACEHOLDER_JPEG);
  }
}

const PLACEHOLDER_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Amf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QP//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QP//EFBABAQAAAAAAAAAAAAAAAAAAARD/2gAIAQEAAT8QP//Z",
  "base64",
);

async function writeIndex(opts, runs) {
  if (!opts.index) return null;
  const indexPath = path.join(opts.outputDir, "INDEX.md");
  const lines = [
    "# Source diagrams",
    "",
    `Generated at ${new Date().toISOString()}.`,
    "",
  ];
  for (const run of runs) {
    const mmd = await fsp.readFile(run.outputs.mmd, "utf8");
    const title = `${displayLanguage(run.language)} — ${run.diagram}`;
    lines.push(`#### ${title}`);
    lines.push(`- Adapter: \`${run.adapter}\`; confidence: \`${run.confidence}\`.`);
    lines.push(`- Links: [Mermaid source](${rel(opts.outputDir, run.outputs.mmd)}) / [SVG](${rel(opts.outputDir, run.outputs.svg)}) / [JPEG](${rel(opts.outputDir, run.outputs.jpg)})`);
    lines.push("");
    lines.push("```mermaid");
    lines.push(stripFrontmatter(mmd).trimEnd());
    lines.push("```");
    lines.push("");
  }
  await fsp.writeFile(indexPath, lines.join("\n"), "utf8");
  return indexPath;
}

async function writeManifest(opts, files, languages, runs, renderResult, indexPath) {
  const selectionRuns = runs.map((run) => run.selection).filter(Boolean);
  const selection = opts.selection ? {
    requestedFiles: opts.selection.requestedFiles,
    diagramFiles: uniqueItems(selectionRuns.flatMap((entry) => entry.diagramFiles || [])),
    omittedConnectorFiles: uniqueItems(selectionRuns.flatMap((entry) => entry.omittedConnectorFiles || [])).sort((a, b) => a.localeCompare(b)),
    edgesFromOmittedFiles: uniqueSelectionEdges(selectionRuns.flatMap((entry) => entry.edgesFromOmittedFiles || [])),
    prunedIsolatedFiles: uniqueItems(selectionRuns.flatMap((entry) => entry.prunedIsolatedFiles || [])),
    warnings: uniqueItems(selectionRuns.flatMap((entry) => entry.warnings || [])),
  } : null;
  const manifest = {
    generatedAt: new Date().toISOString(),
    tool: "vaults-source-diagrams",
    sourceDir: opts.sourceDir,
    outputDir: opts.outputDir,
    adapterMode: opts.adapterMode,
    renderMode: opts.renderMode,
    languages,
    diagrams: opts.diagrams,
    maxNodes: opts.maxNodes,
    excludes: opts.excludes,
    renderer: MERMAID_RENDERER,
    render: renderResult,
    index: indexPath,
    selection,
    summary: {
      sourceFiles: files.length,
      generated: runs.length,
      ok: runs.filter((run) => run.status === "ok").length,
      failed: runs.filter((run) => run.status === "error").length,
      status: renderResult.status === "error" || runs.some((run) => run.status === "error") ? "error" : "ok",
    },
    runs,
  };
  await fsp.mkdir(path.dirname(opts.manifest), { recursive: true });
  await fsp.writeFile(opts.manifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 10000 });
  return !result.error || result.error.code !== "ENOENT";
}

async function collectMmdFiles(dir) {
  const files = [];
  async function visit(current) {
    const stat = await fsp.stat(current);
    if (stat.isDirectory()) {
      for (const entry of await fsp.readdir(current)) await visit(path.join(current, entry));
      return;
    }
    if (current.endsWith(".mmd") || current.endsWith(".mermaid")) files.push(current);
  }
  await visit(dir);
  return files;
}

function readTextSync(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function stripKnownExt(file) {
  const ext = path.extname(file);
  return ext ? file.slice(0, -ext.length) : file;
}

function rel(from, to) {
  return path.relative(from, to).replaceAll(path.sep, "/") || path.basename(to);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function uniqueEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const [from, to] of edges) {
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([from, to]);
  }
  return out;
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function uniqueSelectionEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const edge of edges) {
    const key = JSON.stringify({
      from: edge.from,
      to: edge.to,
      omittedFiles: edge.omittedFiles || [],
      label: edge.label || null,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

function limitGraph(nodes, edges, maxNodes) {
  const limitedNodes = [...new Set(nodes)].slice(0, maxNodes);
  const nodeSet = new Set(limitedNodes);
  return { nodes: limitedNodes, edges: edges.filter(([from, to]) => nodeSet.has(from) && nodeSet.has(to)) };
}

function addContainmentEdges(nodes, edges, language) {
  const root = `${displayLanguage(language)} source`;
  nodes.unshift(root);
  for (const node of nodes.slice(1, Math.min(nodes.length, 9))) edges.push([root, node]);
}

function packageNameFor(language, sourceDir, file) {
  const text = readTextSync(file);
  if (language === "java") return text.match(/\bpackage\s+([\w.]+)\s*;/)?.[1] || path.dirname(rel(sourceDir, file));
  if (language === "python") {
    const pkg = path.dirname(rel(sourceDir, file)).replaceAll("/", ".");
    return pkg === "." ? "root" : pkg || "root";
  }
  if (["javascript", "typescript", "cpp"].includes(language)) {
    const pkg = path.dirname(rel(sourceDir, file));
    return pkg === "." ? "root" : pkg || "root";
  }
  return "root";
}

function sanitizeClassName(name) {
  if (!name) return "";
  const clean = name.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([^A-Za-z_])/, "_$1");
  return clean || "Source";
}

function safeFileName(name) {
  return name.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "source";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function escapeMermaidLabel(label) {
  return String(label).replaceAll("\\", "\\\\").replaceAll('"', "'").replaceAll("\n", " ");
}

function escapeMermaidSequenceText(label) {
  return String(label).replaceAll("\n", " ").replaceAll("\r", " ").trim();
}


function displayLanguage(language) {
  return {
    python: "Python",
    javascript: "JavaScript",
    typescript: "TypeScript",
    java: "Java",
    cpp: "C/C++",
  }[language] || language;
}

function commandString(command, args) {
  return [command, ...args.map((arg) => (String(arg).includes(" ") ? JSON.stringify(arg) : String(arg)))].join(" ");
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function stripFrontmatter(mmd) {
  if (!mmd.startsWith("---\n")) return mmd;
  const end = mmd.indexOf("\n---\n", 4);
  if (end === -1) return mmd;
  return mmd.slice(end + 5);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await assertInputs(opts);
  const files = await collectSourceFiles(opts.sourceDir, opts.excludes);
  opts.selection = await resolveFileSelection(opts, files);
  const languages = await detectLanguages(opts, files);
  if (languages.length === 0) throw new Error("no supported language detected.");
  const runs = await generateAll(opts, files, languages);
  if (runs.length === 0) throw new Error("no diagrams generated.");
  const renderResult = await renderOutputs(opts, runs);
  const indexPath = await writeIndex(opts, runs);
  const manifest = await writeManifest(opts, files, languages, runs, renderResult, indexPath);
  if (manifest.summary.status !== "ok") {
    console.error(renderResult.error || "failed to generate diagrams");
    process.exit(1);
  }
  console.log(`OK: ${runs.length} diagram(s) generated in ${opts.outputDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

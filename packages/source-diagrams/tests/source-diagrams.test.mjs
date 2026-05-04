import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = path.join(REPO_ROOT, "packages", "source-diagrams", "source-diagrams.mjs");

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      SOURCE_DIAGRAMS_ADAPTER_MODE: "heuristic",
      MMDC_VENDOR_ONLY: "0",
      ...options.env,
    },
  });
}

async function writeFixture(root) {
  await mkdir(path.join(root, "src", "python_pkg"), { recursive: true });
  await mkdir(path.join(root, "src", "ts"), { recursive: true });
  await mkdir(path.join(root, "src", "java", "com", "example"), { recursive: true });
  await mkdir(path.join(root, "src", "cpp"), { recursive: true });

  await writeFile(path.join(root, "src", "python_pkg", "service.py"), [
    "import os",
    "from python_pkg.model import Device",
    "class Service:",
    "    def run(self):",
    "        return Device()",
    "",
  ].join("\n"));
  await writeFile(path.join(root, "src", "python_pkg", "model.py"), "class Device:\n    pass\n");

  await writeFile(path.join(root, "src", "ts", "api.ts"), [
    "import { Client } from './client';",
    "export interface Port { send(): void }",
    "export class Api extends Client { start(): void {} }",
    "",
  ].join("\n"));
  await writeFile(path.join(root, "src", "ts", "client.ts"), "export class Client {}\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", type: "module" }, null, 2));

  await writeFile(path.join(root, "pom.xml"), [
    "<project><modelVersion>4.0.0</modelVersion>",
    "<groupId>com.example</groupId><artifactId>fixture</artifactId><version>1.0.0</version>",
    "</project>",
  ].join("\n"));
  await writeFile(path.join(root, "src", "java", "com", "example", "Controller.java"), [
    "package com.example;",
    "import com.example.Service;",
    "public class Controller extends Service {}",
    "interface Port {}",
    "",
  ].join("\n"));
  await writeFile(path.join(root, "src", "java", "com", "example", "Service.java"), "package com.example; public class Service {}\n");

  await writeFile(path.join(root, "src", "cpp", "main.cpp"), [
    "#include \"service.hpp\"",
    "class App : public Service {};",
    "int main() { return 0; }",
    "",
  ].join("\n"));
  await writeFile(path.join(root, "src", "cpp", "service.hpp"), "class Service {};\n");
}

async function writeFocusedFixture(root) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "a.ts"), "import { B } from './b';\nexport class A extends B {}\n");
  await writeFile(path.join(root, "b.ts"), "import { C } from './c';\nexport class B extends C {}\n");
  await writeFile(path.join(root, "c.ts"), "export class C {}\n");
  await writeFile(path.join(root, "d.ts"), "export class D {}\n");
}

test("CLI without arguments prints usage", () => {
  const result = runCli([]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Usage: source-diagrams\.mjs/);
  assert.match(result.stdout, /--source-dir/);
  assert.doesNotMatch(result.stdout, /\/(?:repo|tmp|path)\//);
});

test("missing source directory fails with clear message", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-missing-"));
  const result = runCli(["--source-dir", path.join(tmp, "nope"), "--output-dir", path.join(tmp, "out")]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source-dir does not exist/);
});

test("generates mmd svg jpg index and manifest for mixed source tree", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-mixed-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  await writeFixture(sourceDir);

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "auto",
    "--diagrams", "dependency,class",
    "--max-nodes", "80",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8"));
  assert.equal(manifest.summary.status, "ok");
  assert.ok(manifest.summary.generated >= 4);
  assert.ok(manifest.runs.every((run) => run.status === "ok"));
  assert.ok(manifest.runs.some((run) => run.language === "python" && run.diagram === "class"));
  assert.ok(manifest.runs.some((run) => run.language === "typescript" && run.diagram === "dependency"));
  assert.ok(manifest.runs.some((run) => run.language === "java"));
  assert.ok(manifest.runs.some((run) => run.language === "cpp"));
  assert.ok(manifest.runs.every((run) => run.confidence === "heuristic"));

  for (const run of manifest.runs) {
    assert.ok(run.outputs.mmd.endsWith(".mmd"));
    assert.ok(run.outputs.svg.endsWith(".svg"));
    assert.ok(run.outputs.jpg.endsWith(".jpg"));
    assert.ok(await readFile(run.outputs.mmd, "utf8"));
    assert.ok((await readFile(run.outputs.svg, "utf8")).includes("<svg"));
    assert.ok((await readFile(run.outputs.jpg)).byteLength > 100);
  }

  const index = await readFile(path.join(outputDir, "INDEX.md"), "utf8");
  assert.match(index, /```mermaid/);
  assert.doesNotMatch(index, /```mmd/);
  assert.match(index, /\[Mermaid source\]/);
  assert.match(index, /\[SVG\]/);
  assert.match(index, /\[JPEG\]/);
});

test("focused dependency diagrams collapse omitted source files into connector edges", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-focused-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  await writeFocusedFixture(sourceDir);

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "dependency",
    "--files", "a.ts,c.ts",
    "--render-mode", "placeholder",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.selection.requestedFiles, ["a.ts", "c.ts"]);
  assert.deepEqual(manifest.selection.diagramFiles, ["a.ts", "c.ts"]);
  assert.deepEqual(manifest.selection.omittedConnectorFiles, ["b.ts"]);
  assert.deepEqual(manifest.selection.prunedIsolatedFiles, []);
  assert.deepEqual(manifest.selection.edgesFromOmittedFiles, [
    { from: "a.ts", to: "c.ts", omittedFiles: ["b.ts"], label: "via b.ts" },
  ]);

  const mmd = await readFile(path.join(outputDir, "typescript", "dependency.mmd"), "utf8");
  assert.match(mmd, /\["a\.ts"\]/);
  assert.match(mmd, /\["c\.ts"\]/);
  assert.doesNotMatch(mmd, /\["b\.ts"\]/);
  assert.match(mmd, /-- "via b\.ts" -->/);
});

test("focused sequence diagrams collapse omitted source files into participant messages", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-focused-sequence-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  await writeFocusedFixture(sourceDir);

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "sequence",
    "--files", "a.ts,c.ts",
    "--render-mode", "placeholder",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.selection.requestedFiles, ["a.ts", "c.ts"]);
  assert.deepEqual(manifest.selection.diagramFiles, ["a.ts", "c.ts"]);
  assert.deepEqual(manifest.selection.omittedConnectorFiles, ["b.ts"]);
  assert.deepEqual(manifest.selection.prunedIsolatedFiles, []);
  assert.deepEqual(manifest.selection.edgesFromOmittedFiles, [
    { from: "a.ts", to: "c.ts", omittedFiles: ["b.ts"], label: "via b.ts" },
  ]);
  assert.equal(manifest.runs[0].diagram, "sequence");

  const mmd = await readFile(path.join(outputDir, "typescript", "sequence.mmd"), "utf8");
  assert.match(mmd, /^sequenceDiagram/m);
  assert.match(mmd, /participant N1 as a\.ts/);
  assert.match(mmd, /participant N2 as c\.ts/);
  assert.doesNotMatch(mmd, /participant .*b\.ts/);
  assert.match(mmd, /N1->>N2: via b\.ts/);
});

test("focused dependency and sequence diagrams share one consistent selection manifest", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-focused-combined-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  await writeFocusedFixture(sourceDir);

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "dependency,sequence",
    "--files", "a.ts,c.ts",
    "--render-mode", "placeholder",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.runs.map((run) => run.diagram), ["dependency", "sequence"]);
  assert.deepEqual(manifest.selection.diagramFiles, ["a.ts", "c.ts"]);
  assert.deepEqual(manifest.selection.omittedConnectorFiles, ["b.ts"]);
  assert.deepEqual(manifest.selection.edgesFromOmittedFiles, [
    { from: "a.ts", to: "c.ts", omittedFiles: ["b.ts"], label: "via b.ts" },
  ]);
});

test("sequence diagrams require focused file selectors", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-sequence-no-selection-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  await writeFocusedFixture(sourceDir);

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "sequence",
    "--render-mode", "placeholder",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sequence.*--files|--files.*sequence/i);
});

test("focused file lists support files-from and prune isolated requested files", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-files-from-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  const filesFrom = path.join(tmp, "files.txt");
  await writeFocusedFixture(sourceDir);
  await writeFile(filesFrom, "# focused files\n\na.ts\nc.ts\nd.ts\n");

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "dependency",
    "--files-from", filesFrom,
    "--render-mode", "placeholder",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.selection.requestedFiles, ["a.ts", "c.ts", "d.ts"]);
  assert.deepEqual(manifest.selection.diagramFiles, ["a.ts", "c.ts"]);
  assert.deepEqual(manifest.selection.omittedConnectorFiles, ["b.ts"]);
  assert.deepEqual(manifest.selection.prunedIsolatedFiles, ["d.ts"]);
  assert.ok(manifest.selection.warnings.some((warning) => warning.includes("d.ts")));
});

test("focused diagrams fail when an excluded omitted connector leaves every requested file isolated", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-excluded-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  await writeFocusedFixture(sourceDir);

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "dependency",
    "--files", "a.ts,c.ts",
    "--exclude", "b.ts",
    "--render-mode", "placeholder",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no real connection between selected files|all.*isolated/i);
});

test("focused file selectors reject missing files and paths outside source-dir", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "source-diagrams-invalid-file-"));
  const sourceDir = path.join(tmp, "input");
  const outputDir = path.join(tmp, "out");
  await writeFocusedFixture(sourceDir);

  const missing = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "dependency",
    "--files", "missing.ts",
  ]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /selected file does not exist/);

  const outside = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "dependency",
    "--files", path.join(tmp, "outside.ts"),
  ]);
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /outside source-dir/);
});

test("canonical render fails instead of falling back to the shell renderer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vaults-source-diagrams-no-fallback-"));
  const sourceDir = path.join(root, "src");
  const outputDir = path.join(root, "out");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, "index.ts"), "export class A {}\n");

  const failingRenderer = path.join(root, "fail-renderer.mjs");
  const fallbackRenderer = path.join(root, "fallback-renderer.sh");
  const fallbackMarker = path.join(root, "fallback-invoked.txt");
  await writeFile(failingRenderer, "console.error('synthetic renderer failure'); process.exit(17);\n");
  await writeFile(fallbackRenderer, `#!/usr/bin/env bash
echo fallback > "${fallbackMarker}"
exit 0
`);
  await chmod(fallbackRenderer, 0o755);

  const result = runCli([
    "--source-dir", sourceDir,
    "--output-dir", outputDir,
    "--langs", "typescript",
    "--diagrams", "dependency",
    "--no-index",
  ], {
    env: {
      VAULTS_MERMAID_RENDERER: failingRenderer,
      VAULTS_MERMAID_RENDERER_SH: fallbackRenderer,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /synthetic renderer failure/);
  await assert.rejects(readFile(fallbackMarker, "utf8"), /ENOENT/);
});

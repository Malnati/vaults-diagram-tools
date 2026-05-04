import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { generateSourceDiagrams, renderMermaidFile, renderMermaidText } from "../tools.mjs";

test("renderMermaidText renders SVG and JPEG artifacts", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mcp-render-text-"));
  const result = await renderMermaidText({
    source: "flowchart TD\n  A[Start] --> B[Done]\n",
    fileName: "from-text.mmd",
    outputDir,
  });
  assert.equal(result.ok, true, result.stderr);
  assert.ok(result.files.some((file) => file.endsWith("from-text.svg")));
  assert.ok(result.files.some((file) => file.endsWith("from-text.jpg")));
});

test("renderMermaidFile renders existing Mermaid file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-render-file-"));
  const source = path.join(dir, "from-file.mmd");
  const outputDir = path.join(dir, "out");
  await writeFile(source, "flowchart TD\n  A --> B\n", "utf8");
  const result = await renderMermaidFile({ source, outputDir });
  assert.equal(result.ok, true, result.stderr);
  assert.ok(result.manifest.summary.ok >= 1);
});

test("generateSourceDiagrams calls source generator with placeholder render", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-source-diagrams-"));
  const sourceDir = path.join(dir, "src");
  const outputDir = path.join(dir, "out");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, "a.ts"), "import { B } from './b';\nexport class A extends B {}\n", "utf8");
  await writeFile(path.join(sourceDir, "b.ts"), "export class B {}\n", "utf8");
  const result = await generateSourceDiagrams({
    sourceDir,
    outputDir,
    langs: "typescript",
    diagrams: "dependency",
    renderMode: "placeholder",
    adapterMode: "heuristic",
  });
  assert.equal(result.ok, true, result.stderr);
  assert.equal(result.manifest.summary.status, "ok");
  assert.ok(result.manifest.runs.some((run) => run.diagram === "dependency"));
});

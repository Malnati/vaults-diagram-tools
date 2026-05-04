import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = path.dirname(TEST_DIR);
const CHECKER = path.join(TOOL_DIR, "check-markdown-diagram-policy.py");
const PYTHON = process.env.PYTHON_BIN || "python3";

test("Markdown policy checker reports generated SVG embeds without crashing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-md-policy-"));
  fs.writeFileSync(path.join(tmp, "example.mmd"), "flowchart TB\n  A --> B\n", "utf8");
  fs.writeFileSync(
    path.join(tmp, "README.md"),
    [
      "# Bad diagram",
      "",
      "![Generated](example.svg)",
      "",
      "```mmd",
      "flowchart TB",
      "  A --> B",
      "```",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = spawnSync(PYTHON, [CHECKER, path.join(tmp, "README.md")], {
    cwd: tmp,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md: uses a ```mmd block/);
  assert.match(result.stderr, /embedded Mermaid diagram SVG found: example\.svg/);
  assert.doesNotMatch(result.stderr, /NameError|Traceback/);
});

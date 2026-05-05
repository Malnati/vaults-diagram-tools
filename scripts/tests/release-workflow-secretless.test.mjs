import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function readWorkflow(name) {
  return fs.readFileSync(path.join(ROOT, ".github", "workflows", name), "utf8");
}

test("release workflow never publishes with GitHub-hosted npm or extension secrets", () => {
  const release = readWorkflow("release.yml");
  const forbidden = [
    "NPM_TOKEN",
    "VSCE_PAT",
    "OVSX_PAT",
    "npm publish",
    "vscode:publish:marketplace",
    "vscode:publish:openvsx",
    "vsce publish",
    "ovsx publish",
  ];

  for (const needle of forbidden) {
    assert.equal(release.includes(needle), false, `release.yml must not contain ${needle}`);
  }
});

test("ci workflow only validates and packages extension artifacts", () => {
  const ci = readWorkflow("ci.yml");
  assert.match(ci, /npm run vscode:package/);
  assert.equal(/npm publish|vscode:publish:marketplace|vscode:publish:openvsx|VSCE_PAT|OVSX_PAT|NPM_TOKEN/.test(ci), false);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const MAKEFILE = path.join(ROOT, "Makefile");
const RELEASE_WORKFLOW = path.join(ROOT, ".github", "workflows", "release.yml");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function targetLine(makefile, target) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = makefile.match(new RegExp(`^${escaped}:.*$`, "m"));
  assert.ok(match, `Makefile must define target ${target}`);
  return match[0];
}

function targetRecipe(makefile, target) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = makefile.match(new RegExp(`^${escaped}:.*(?:\\n\\t[^\\n]*)*`, "m"));
  assert.ok(match, `Makefile must define recipe for ${target}`);
  return match[0];
}

test("publish-all starts with auth and preserves sequential publication order", () => {
  const makefile = read(MAKEFILE);
  assert.match(makefile, /^\.NOTPARALLEL:.*publish-all/m);
  assert.equal(
    targetLine(makefile, "publish-all"),
    "publish-all: auth preflight package publish-github-release publish-registries verify-publication",
  );
});

test("preflight target enforces metadata and already-published guards", () => {
  const makefile = read(MAKEFILE);
  const recipe = targetRecipe(makefile, "preflight");
  assert.match(recipe, /package-lock\.json/);
  assert.match(recipe, /server\.json/);
  assert.match(recipe, /mcpName/);
  assert.match(recipe, /refs\/tags\/\$\(TAG\)/);
  assert.match(recipe, /npm view "\$\(PACKAGE_NAME\)@\$\(VERSION\)"/);
  assert.match(recipe, /already exists; bump version before publishing/);
});

test("MCP Registry publication runs only after npm package publication", () => {
  const makefile = read(MAKEFILE);
  const recipe = targetRecipe(makefile, "publish-registries");
  const npmPublish = recipe.indexOf("npm publish --access public");
  const mcpPublish = recipe.indexOf("$(MCP_PUBLISHER) publish");
  assert.notEqual(npmPublish, -1, "publish-registries must publish npm package");
  assert.notEqual(mcpPublish, -1, "publish-registries must publish MCP metadata");
  assert.ok(npmPublish < mcpPublish, "MCP Registry publish must run after npm publish");
});

test("release workflow remains secretless for external registry publication", () => {
  const release = read(RELEASE_WORKFLOW);
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

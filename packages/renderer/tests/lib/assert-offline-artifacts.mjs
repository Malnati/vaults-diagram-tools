#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ALLOWED_URLS = new Set([
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/2000/xmlns/",
]);
const TEXT_EXTENSIONS = new Set([".svg", ".txt", ".json", ".html", ".css", ".mmd", ".mermaid"]);
const URL_PATTERN = /https?:\/\/[^\s"'<>),;]+/gi;
const CDN_PATTERN = /(?:^|[\s"'(])(?:cdn\.|[^/\s"']*\b(?:jsdelivr|unpkg|esm\.sh|skypack|fonts\.googleapis|registry\.npmjs)\b)/i;

async function* walk(target) {
  const stat = await fs.stat(target);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      yield* walk(path.join(target, entry.name));
    }
    return;
  }
  if (stat.isFile()) yield target;
}

function stripAllowedUrls(text) {
  let output = text;
  for (const allowed of ALLOWED_URLS) {
    output = output.split(allowed).join("");
  }
  return output;
}

function findRemoteReference(text) {
  const withoutAllowed = stripAllowedUrls(text);
  const url = withoutAllowed.match(URL_PATTERN)?.[0];
  if (url) return url;
  const cdn = withoutAllowed.match(CDN_PATTERN)?.[0]?.trim();
  return cdn || null;
}

async function scanFile(file) {
  if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) return null;
  const text = await fs.readFile(file, "utf8");
  const remote = findRemoteReference(text);
  return remote ? { file, remote } : null;
}

async function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) throw new Error("usage: assert-offline-artifacts.mjs <file-or-directory> [...]");

  const failures = [];
  for (const target of targets) {
    for await (const file of walk(path.resolve(target))) {
      const failure = await scanFile(file);
      if (failure) failures.push(failure);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`forbidden remote reference: ${failure.file}: ${failure.remote}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

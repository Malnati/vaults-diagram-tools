import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = path.dirname(TEST_DIR);
const CLI = path.join(TOOL_DIR, "render-mermaid-assets.mjs");
let cachedSvg = null;

function renderFixture() {
  if (cachedSvg) return cachedSvg;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mermaid-seq-layout-"));
  const input = path.join(tmp, "sequence-layout.mmd");
  const outputDir = path.join(tmp, "out");
  fs.writeFileSync(input, `sequenceDiagram
  participant A as Frontend
  participant B as API Gateway
  participant C as Backend
  participant D as External Service
  A->>B: GET /tmf-api/productOfferingQualification/v4<br/>fields=eligibilityUnavailabilityReason,productOfferingQualificationCharacteristic<br/>relatedParty.id=<msisdn>
  Note over B,C: Multiline note one<br/>Multiline note two<br/>Multiline note three
  Note over B: Long note about a single participant with HTTP payload and huge parameters to invade neighboring lifelines without margin<br/>second line
  B->>B: QueryCloudService.checkSubscriberEligibilityByMsisdn<br/>normalizes full payload with validators
  alt happy path
    B->>C: calls backend<br/>with adapted payload
  else backend error
    C-->>B: error return
  end
`, "utf8");

  execFileSync(process.execPath, [CLI, "--output-dir", outputDir, input], {
    cwd: path.dirname(TOOL_DIR),
    stdio: "pipe",
    timeout: 30_000,
  });
  cachedSvg = fs.readFileSync(path.join(outputDir, "sequence-layout.svg"), "utf8");
  return cachedSvg;
}

function groupsByClass(svg, className) {
  return [...svg.matchAll(new RegExp(`<g class="${className}"[\\s\\S]*?<\\/g>`, "g"))].map((match) => match[0]);
}

function firstNumber(attr, text) {
  const match = text.match(new RegExp(`${attr}="([^"]+)"`));
  assert.ok(match, `missing ${attr} in ${text}`);
  return Number(match[1]);
}

function firstRect(group, className) {
  const match = group.match(new RegExp(`<rect class="${className}"[^>]*>`));
  assert.ok(match, `missing rect.${className} in ${group}`);
  return match[0];
}

function firstLineY(group) {
  const line = group.match(/<(?:line|polyline)\b[^>]*>/)?.[0];
  assert.ok(line, `missing line/polyline in ${group}`);
  if (line.startsWith("<line")) return firstNumber("y1", line);
  const points = line.match(/points="([^"]+)"/)?.[1];
  assert.ok(points, `missing polyline points in ${group}`);
  return Number(points.split(/[,\s]+/)[1]);
}

function polygonHeight(group) {
  const polygon = group.match(/<polygon\b[^>]*points="([^"]+)"/)?.[1];
  assert.ok(polygon, `missing note polygon in ${group}`);
  const ys = polygon
    .trim()
    .split(/\s+/)
    .map((pair) => Number(pair.split(",")[1]));
  return Math.max(...ys) - Math.min(...ys);
}

function lifelines(svg) {
  return [...svg.matchAll(/<line class="lifeline" data-actor="([^"]+)" x1="([^"]+)"/g)]
    .map((match) => ({ actor: match[1], x: Number(match[2]) }));
}

function rectBounds(rect) {
  const x = firstNumber("x", rect);
  const y = firstNumber("y", rect);
  const width = firstNumber("width", rect);
  const height = firstNumber("height", rect);
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function polygonBounds(group) {
  const polygon = group.match(/<polygon\b[^>]*points="([^"]+)"/)?.[1];
  assert.ok(polygon, `missing note polygon in ${group}`);
  const points = polygon
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function groupDataAttr(group, attr) {
  const match = group.match(new RegExp(`data-${attr}="([^"]*)"`));
  assert.ok(match, `missing data-${attr} in ${group}`);
  return match[1];
}

function assertNoForeignLifelineInsideBox(svg, box, ownActors, label) {
  const crossed = lifelines(svg)
    .filter(({ actor }) => !ownActors.includes(actor))
    .filter(({ x }) => x > box.x && x < box.right)
    .map(({ actor }) => actor);
  assert.deepEqual(crossed, [], `${label} crosses foreign lifelines: ${crossed.join(", ")}`);
}

test("sequence messages render as left-aligned blocks with margin above connector lines", () => {
  const svg = renderFixture();
  const messages = groupsByClass(svg, "message");
  const firstMessage = messages.find((group) => group.includes("GET /tmf-api/productOfferingQualification"));
  assert.ok(firstMessage, "expected first multiline message");

  const labelBg = firstRect(firstMessage, "message-label-bg");
  const labelBottom = firstNumber("y", labelBg) + firstNumber("height", labelBg);
  const lineY = firstLineY(firstMessage);

  assert.match(firstMessage, /text-anchor="start"/);
  assert.ok(labelBottom <= lineY - 8, `message label bottom ${labelBottom} must leave margin before line ${lineY}`);
});

test("sequence notes reserve multiline height and use near-white yellow note background", () => {
  const svg = renderFixture();
  const notes = groupsByClass(svg, "note");
  const note = notes.find((group) => group.includes("Multiline note"));
  assert.ok(note, "expected multiline note");

  assert.match(note, /fill="#fffef2"/);
  assert.match(note, /text-anchor="start"/);
  assert.ok(polygonHeight(note) >= 58, `note polygon too short: ${polygonHeight(note)}`);
});

test("sequence self-message labels reserve horizontal space before neighboring lifelines", () => {
  const svg = renderFixture();
  const messages = groupsByClass(svg, "message");
  const selfMessage = messages.find((group) => group.includes("QueryCloudService.checkSubscriberEligibilityByMsisdn"));
  assert.ok(selfMessage, "expected long self-message");

  const labelBg = firstRect(selfMessage, "message-label-bg");
  const labelBox = rectBounds(labelBg);
  const owner = groupDataAttr(selfMessage, "from");

  assertNoForeignLifelineInsideBox(svg, labelBox, [owner], "self-message label");
});

test("sequence single-actor notes reserve horizontal space before neighboring lifelines", () => {
  const svg = renderFixture();
  const notes = groupsByClass(svg, "note");
  const note = notes.find((group) => group.includes("Long note about a single participant"));
  assert.ok(note, "expected long single-actor note");

  const noteBox = polygonBounds(note);
  const actors = groupDataAttr(note, "actors").split(",");

  assertNoForeignLifelineInsideBox(svg, noteBox, actors, "single-actor note");
});

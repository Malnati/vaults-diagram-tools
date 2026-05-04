import assert from "node:assert/strict";
import test from "node:test";

import {
  materializeSvgForRaster,
  stripAnsi,
} from "../render-mermaid-assets.mjs";

test("materializeSvgForRaster resolves CSS variables and color-mix for resvg", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" style="--bg:#FFFFFF;--fg:#27272A;background:var(--bg)">
<style>
  svg {
    --_line: color-mix(in srgb, var(--fg) 50%, var(--bg));
    --_node-fill: var(--surface, color-mix(in srgb, var(--fg) 3%, var(--bg)));
  }
  text { font-family: var(--font, Inter, system-ui, sans-serif); color: var(--fg); }
</style>
<defs><marker id="arrow"><polygon fill="var(--_line)" stroke="var(--_line)" /></marker></defs>
<rect fill="var(--_node-fill)" stroke="var(--_line)" />
<text fill="var(--fg)">Ok</text>
</svg>`;

  const materialized = materializeSvgForRaster(svg);

  assert.doesNotMatch(materialized, /var\(/);
  assert.doesNotMatch(materialized, /color-mix\(/);
  assert.match(materialized, /stroke="#939395"/i);
  assert.match(materialized, /fill="#f9f9f9"/i);
  assert.match(materialized, /background:#ffffff/i);
  assert.match(materialized, /font-family: Inter, system-ui, sans-serif/);
});

test("materializeSvgForRaster fails clearly on unresolved CSS variables", () => {
  assert.throws(
    () => materializeSvgForRaster('<svg><rect fill="var(--unknown)" /></svg>'),
    /CSS.*unresolved|unresolved/i,
  );
});

test("materializeSvgForRaster does not treat text labels as CSS", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="--bg:#fff;background:var(--bg)">
<text>literal var(--not-css) and color-mix(in srgb, red 50%, blue)</text>
</svg>`;

  const materialized = materializeSvgForRaster(svg);

  assert.match(materialized, /background:#fff/i);
  assert.match(materialized, /literal var\(--not-css\)/);
  assert.match(materialized, /color-mix\(in srgb, red 50%, blue\)/);
});

test("stripAnsi removes terminal color escapes from ASCII sidecars", () => {
  assert.equal(stripAnsi("\u001b[38;5;247mTexto\u001b[0m limpo"), "Texto limpo");
});

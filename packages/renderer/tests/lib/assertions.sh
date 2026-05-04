#!/usr/bin/env bash
# Shared assertions for tools/mermaid shell tests.

if [[ -n "${MERMAID_ASSERTIONS_SH_LOADED:-}" ]]; then
  return 0
fi
MERMAID_ASSERTIONS_SH_LOADED=1

assert_file() {
  local path="$1"
  if [[ ! -s "$path" ]]; then
    echo "expected file missing/empty: $path" >&2
    return 1
  fi
}

assert_absent() {
  local path="$1"
  if [[ -e "$path" ]]; then
    echo "file should not exist: $path" >&2
    return 1
  fi
}

assert_contains() {
  local path="$1"
  local needle="$2"
  if ! grep -q "$needle" "$path"; then
    echo "file does not contain [$needle]: $path" >&2
    return 1
  fi
}

assert_not_contains_regex() {
  local path="$1"
  local pattern="$2"
  if grep -Eq "$pattern" "$path"; then
    echo "file contains forbidden pattern [$pattern]: $path" >&2
    return 1
  fi
}

assert_jpeg() {
  local path="$1"
  "${NODE_BIN:?NODE_BIN missing}" -e 'const fs=require("fs"); const p=process.argv[1]; const b=fs.readFileSync(p); if (b[0] !== 0xff || b[1] !== 0xd8) { console.error("Invalid JPEG: "+p); process.exit(1); }' "$path"
}

assert_png() {
  local path="$1"
  "${NODE_BIN:?NODE_BIN missing}" -e 'const fs=require("fs"); const p=process.argv[1]; const b=fs.readFileSync(p); const ok=b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47; if (!ok) { console.error("Invalid PNG: "+p); process.exit(1); }' "$path"
}

assert_png_min_dimensions() {
  local path="$1"
  local min_width="$2"
  local min_height="$3"
  assert_png "$path"
  "${NODE_BIN:?NODE_BIN missing}" - "$path" "$min_width" "$min_height" <<'NODE'
const fs = require('fs');
const [file, minWidth, minHeight] = process.argv.slice(2);
const b = fs.readFileSync(file);
const width = b.readUInt32BE(16);
const height = b.readUInt32BE(20);
if (width < Number(minWidth) || height < Number(minHeight)) {
  console.error(`PNG too small: ${file}: ${width}x${height}, minimum ${minWidth}x${minHeight}`);
  process.exit(1);
}
NODE
}

assert_png_dark_pixels_min() {
  local path="$1"
  local min_dark_pixels="$2"
  assert_png "$path"
  "${NODE_BIN:?NODE_BIN missing}" - "$path" "$min_dark_pixels" <<'NODE'
const fs = require('fs');
const zlib = require('zlib');
const [file, minDarkPixels] = process.argv.slice(2);
const png = fs.readFileSync(file);
let offset = 8;
let width = 0;
let height = 0;
const idats = [];
while (offset < png.length) {
  const length = png.readUInt32BE(offset);
  const type = png.toString('ascii', offset + 4, offset + 8);
  const data = png.subarray(offset + 8, offset + 8 + length);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    const bitDepth = data[8];
    const colorType = data[9];
    if (bitDepth !== 8 || colorType !== 6) {
      throw new Error(`PNG must be 8-bit RGBA for assertion: ${file}`);
    }
  }
  if (type === 'IDAT') idats.push(data);
  offset += 12 + length;
}
const raw = zlib.inflateSync(Buffer.concat(idats));
const bytesPerPixel = 4;
const stride = width * bytesPerPixel;
let previous = Buffer.alloc(stride);
let pos = 0;
let dark = 0;
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
for (let y = 0; y < height; y += 1) {
  const filter = raw[pos++];
  const row = Buffer.alloc(stride);
  for (let x = 0; x < stride; x += 1) {
    const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
    const up = previous[x];
    const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
    let value = raw[pos++];
    if (filter === 1) value = (value + left) & 255;
    else if (filter === 2) value = (value + up) & 255;
    else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}: ${file}`);
    row[x] = value;
  }
  for (let x = 0; x < stride; x += 4) {
    const r = row[x];
    const g = row[x + 1];
    const b = row[x + 2];
    const a = row[x + 3];
    if (a > 128 && r < 120 && g < 120 && b < 120) dark += 1;
  }
  previous = row;
}
if (dark < Number(minDarkPixels)) {
  console.error(`PNG with too few dark pixels: ${file}: ${dark}, minimum ${minDarkPixels}`);
  process.exit(1);
}
NODE
}

assert_jpeg_min_dimensions() {
  local path="$1"
  local min_width="$2"
  local min_height="$3"
  assert_jpeg "$path"
  "${NODE_BIN:?NODE_BIN missing}" - "$path" "$min_width" "$min_height" <<'NODE'
const fs = require('fs');
const [file, minWidth, minHeight] = process.argv.slice(2);
const b = fs.readFileSync(file);
let offset = 2;
let width = 0;
let height = 0;
while (offset + 9 < b.length) {
  if (b[offset] !== 0xff) {
    offset += 1;
    continue;
  }
  while (b[offset] === 0xff) offset += 1;
  const marker = b[offset++];
  if (marker === 0xd9 || marker === 0xda) break;
  const length = b.readUInt16BE(offset);
  const isSof =
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf);
  if (isSof) {
    height = b.readUInt16BE(offset + 3);
    width = b.readUInt16BE(offset + 5);
    break;
  }
  offset += length;
}
if (!width || !height) {
  console.error(`could not read JPEG dimensions: ${file}`);
  process.exit(1);
}
if (width < Number(minWidth) || height < Number(minHeight)) {
  console.error(`JPEG too small: ${file}: ${width}x${height}, minimum ${minWidth}x${minHeight}`);
  process.exit(1);
}
NODE
}

assert_svg() {
  local path="$1"
  assert_file "$path"
  assert_contains "$path" "<svg"
}

assert_svg_remote_free() {
  local path="$1"
  assert_svg "$path"
  "${NODE_BIN:?NODE_BIN missing}" - "$path" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const svg = fs.readFileSync(path, 'utf8')
  .replaceAll('http://www.w3.org/2000/svg', '')
  .replaceAll('http://www.w3.org/1999/xlink', '');
const forbidden = /@import|fonts\.googleapis|registry\.npmjs\.org|https?:\/\//i;
if (forbidden.test(svg)) {
  console.error(`SVG contains forbidden remote reference: ${path}`);
  process.exit(1);
}
NODE
}

assert_text_file() {
  local path="$1"
  assert_file "$path"
  "${NODE_BIN:?NODE_BIN missing}" -e 'const fs=require("fs"); const p=process.argv[1]; const s=fs.readFileSync(p,"utf8"); if (!s.trim()) { console.error("texto vazio: "+p); process.exit(1); }' "$path"
}

assert_no_ansi() {
  local path="$1"
  assert_text_file "$path"
  "${NODE_BIN:?NODE_BIN missing}" -e 'const fs=require("fs"); const p=process.argv[1]; const s=fs.readFileSync(p,"utf8"); if (/\x1b\[[0-?]*[ -/]*[@-~]/.test(s)) { console.error("text contains ANSI escape: "+p); process.exit(1); }' "$path"
}

assert_plain_ascii() {
  local path="$1"
  assert_text_file "$path"
  "${NODE_BIN:?NODE_BIN missing}" -e 'const fs=require("fs"); const p=process.argv[1]; const s=fs.readFileSync(p,"utf8"); for (const ch of s) { const c=ch.charCodeAt(0); if (c > 127) { console.error("non-ASCII in "+p+": U+"+c.toString(16)); process.exit(1); } }' "$path"
}

assert_manifest_summary() {
  local path="$1"
  local total="$2"
  local ok="$3"
  local failed="$4"
  "${NODE_BIN:?NODE_BIN missing}" - "$path" "$total" "$ok" "$failed" <<'NODE'
const fs=require('fs');
const [manifestPath,total,ok,failed]=process.argv.slice(2);
const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const expected={total:Number(total),ok:Number(ok),failed:Number(failed)};
for (const key of Object.keys(expected)) {
  if (m.summary[key] !== expected[key]) throw new Error(`manifest ${key}: expected ${expected[key]}, got ${m.summary[key]}`);
}
NODE
}

assert_manifest_output_basename() {
  local path="$1"
  local basename_expected="$2"
  "${NODE_BIN:?NODE_BIN missing}" - "$path" "$basename_expected" <<'NODE'
const fs=require('fs');
const path=require('path');
const [manifestPath, basenameExpected]=process.argv.slice(2);
const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const outputs=m.files.flatMap(f => Object.values(f.outputs || {})).filter(Boolean).map(p => path.basename(p));
if (!outputs.includes(basenameExpected)) throw new Error(`manifest does not reference ${basenameExpected}; outputs=${outputs.join(',')}`);
NODE
}

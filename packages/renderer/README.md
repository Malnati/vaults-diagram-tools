# Mermaid renderer

Renderer package for `vaults-diagram-tools`.

Canonical public CLI:

```bash
vaults-mermaid-render diagram.mmd --output-dir out --png --ascii --manifest out/manifest.json
```

Direct checkout usage:

```bash
node packages/renderer/render-mermaid-assets.mjs diagram.mmd
packages/renderer/render-mermaid-assets.sh diagram.mmd
```

For each `.mmd` / `.mermaid`, the renderer writes `.svg` + `.jpg`; `--png` and `--ascii` add optional sidecars.

## Runtime modes

- Development: normal `npm install` dependencies from root `node_modules`.
- Offline release/container: `npm run vendor:refresh`, then run with `MMDC_VENDOR_ONLY=1` and `MMDC_VENDOR_NODE_ROOT=packages/renderer/vendor/node`.
- Default CLI/wrapper path: Node/JS/WASM vendor renderer, with no Chromium/Puppeteer dependency.
- Legacy compatibility: set `MMDC_RENDER_ENGINE=mmdc` explicitly to use an external Mermaid CLI/Puppeteer installation.

## Features

- Offline Iconify icons: `fa`, `logos`, `lucide`.
- Global Mermaid theme tokens: `global-mermaid-theme.json`.
- Sequence diagram CSS: `sequence-diagram.css`.
- Optional ASCII/Unicode sidecar: `--ascii --ascii-mode unicode|ascii`.
- Manifest output: `--manifest render-manifest.json`.

## Markdown policy

Use `.mmd`, `.svg`, `.jpg` as links and display source in a fenced `mermaid` block.

## Tests

```bash
npm run test:renderer
npm run vendor:refresh
npm run test:vendor:offline
```

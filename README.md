# vaults-diagram-tools

[![CI](https://github.com/malnati/vaults-diagram-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/malnati/vaults-diagram-tools/actions/workflows/ci.yml)
[![Release](https://github.com/malnati/vaults-diagram-tools/actions/workflows/release.yml/badge.svg)](https://github.com/malnati/vaults-diagram-tools/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/github/license/malnati/vaults-diagram-tools)](LICENSE)
[![Node.js >=20.11](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen)](package.json)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://malnati.github.io/vaults-diagram-tools/)
[![Container](https://img.shields.io/badge/container-ghcr.io%2Fmalnati%2Fvaults--diagram--tools-blue)](https://github.com/malnati/vaults-diagram-tools/pkgs/container/vaults-diagram-tools)

Portable Mermaid and source-code diagram toolkit for SVG/JPEG rendering, offline assets, and MCP workflows.

## What is included

- Mermaid renderer extracted from the Vaults toolchain.
- Source-code to Mermaid diagram generator.
- MCP stdio server with three explicit tools.
- Offline-capable release assets for zip and container distribution.
- Packaging templates for Homebrew, deb/rpm, VS Code, CDN, Docker, and Podman.

Not included: OCR/document conversion, Claro vault audits, CPQ import, clippings, or Casa Conectada PDF tooling.

## Install

### npm package from GitHub

```bash
npm install github:malnati/vaults-diagram-tools
```

### Local checkout

```bash
git clone https://github.com/malnati/vaults-diagram-tools.git
cd vaults-diagram-tools
npm ci
npm test
```

### Container

```bash
docker build -f containers/Containerfile -t vaults-diagram-tools:local .
podman build -f containers/Containerfile -t vaults-diagram-tools:local .
```

Release images are published to GitHub Container Registry as `ghcr.io/malnati/vaults-diagram-tools`.

## Command line usage

```bash
vaults-mermaid-render path/to/diagram.mmd --output-dir out --png --ascii --manifest out/manifest.json
vaults-source-diagrams --source-dir src --output-dir diagrams --langs auto --diagrams dependency,class
vaults-diagram-mcp
```

Local checkout equivalents:

```bash
node packages/renderer/render-mermaid-assets.mjs examples/simple/flowchart.mmd --output-dir /tmp/vaults-diagram-tools
node packages/source-diagrams/source-diagrams.mjs --source-dir packages/source-diagrams/tests/fixtures/js-project --output-dir /tmp/source-diagrams
node packages/mcp/server.mjs
```

Supported public CLIs are the three commands above. Additional package binaries are compatibility entrypoints for older Vaults paths and may be deprecated in a future major release.

## MCP tools

`vaults-diagram-mcp` exposes exactly three tools:

- `render_mermaid_text`
- `render_mermaid_file`
- `generate_source_diagrams`

## Markdown diagram policy

Generated Markdown should link artifacts and show source in a `mermaid` fenced block:

````markdown
#### Diagram title
- Links: [Mermaid source](assets/diagram.mmd) / [SVG](assets/diagram.svg) / [JPEG](assets/diagram.jpg)

```mermaid
flowchart TD
  A --> B
```
````

SVG and JPEG files are delivery artifacts. Markdown should link them instead of embedding them as images by default.

## Offline vendor runtime

The source tree does not commit `node_modules`. Build and release jobs create offline vendor assets with:

```bash
npm run vendor:refresh
npm run test:vendor:offline
```

The renderer can run from normal npm dependencies during development, or from `packages/renderer/vendor/node` when `MMDC_VENDOR_ONLY=1`.

## Distribution status

Working in v1:

- npm package metadata and GitHub install flow
- Docker/Podman image
- MCP server
- zip release
- GitHub Actions CI, release, CodeQL, and Pages workflows

Templates in v1:

- Homebrew formula
- deb/rpm through nfpm
- VS Code extension shell
- CDN facade through npm/jsDelivr/unpkg once npm publication is enabled

## Documentation

- [GitHub Pages documentation](https://malnati.github.io/vaults-diagram-tools/)
- [Vaults compatibility notes](docs/vaults-compatibility.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

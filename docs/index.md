# vaults-diagram-tools

Portable Mermaid and source-code diagram toolkit for SVG/JPEG rendering, offline assets, and MCP workflows.

## Quick start

```bash
npm install github:malnati/vaults-diagram-tools
vaults-mermaid-render diagram.mmd --output-dir out --png --manifest out/manifest.json
vaults-source-diagrams --source-dir src --output-dir diagrams
vaults-diagram-mcp
```

## Core commands

| Command | Purpose |
| --- | --- |
| `vaults-mermaid-render` | Render `.mmd` or `.mermaid` files to SVG/JPEG and optional text sidecars. |
| `vaults-source-diagrams` | Generate Mermaid diagrams from source-code structure. |
| `vaults-diagram-mcp` | Run the MCP stdio server with three explicit tools. |

## Artifact policy

Keep Mermaid source as `.mmd`, render `.svg` and `.jpg`, and link all three artifacts from Markdown. Use a fenced `mermaid` block when showing source inline.

## Distribution

- GitHub releases include npm tarballs and zip archives.
- GitHub Container Registry publishes release images.
- Packaging templates live under `packaging/`.

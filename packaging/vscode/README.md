# Vaults Diagram Tools for VS Code

Desktop VS Code extension for `vaults-diagram-tools`.

## Features

- Render the active `.mmd` or `.mermaid` file to `.svg` and `.jpg` assets.
- Generate Mermaid source diagrams from a selected source directory.
- Validate the Vaults Markdown diagram policy for the active Markdown file.
- Register the resolved `vaults-diagram-tools` MCP stdio server for VS Code Agent Mode.
- Update, inspect, or force the bundled fallback runtime from the Command Palette.

## Runtime

Default runtime mode is `hybrid`:

1. Use a valid managed cache from VS Code global extension storage.
2. Check `vaults-diagram-tools@latest` at most once per day and refresh that cache when npm is reachable.
3. Fall back to the bundled offline runtime when the managed cache is missing, stale, or update fails.

Managed updates use local `npm install --ignore-scripts --omit=dev` against the configured npm dist-tag or version. No `npx` is used. The bundled runtime stays available for offline work and does not need to match the VS Code extension version.

## Commands

- `Vaults Diagram Tools: Render Current Mermaid File`
- `Vaults Diagram Tools: Generate Source Diagrams`
- `Vaults Diagram Tools: Validate Markdown Diagram Policy`
- `Vaults Diagram Tools: Update Runtime Now`
- `Vaults Diagram Tools: Show Runtime Status`
- `Vaults Diagram Tools: Use Bundled Runtime`

## MCP

The extension contributes one MCP server definition provider: `vaultsDiagramTools`. The server runs `vaults-diagram-tools` over stdio and exposes the package's explicit three-tool surface:

- `render_mermaid_text`
- `render_mermaid_file`
- `generate_source_diagrams`

## Manual publication

GitHub Actions validates and packages release artifacts only. Publish external registries from an authenticated local terminal through the root Makefile:

```bash
make auth
make publish-all
```

The Makefile publishes in sequence: GitHub Release assets, npm, VS Code Marketplace, Open VSX, GHCR, Quay.io, and MCP Registry. It is guard-only: it fails when the current version/tag/npm package already exists instead of bumping versions.

## Requirements

- VS Code `1.118.0` or newer.
- Desktop/workspace extension host. This v1 does not target `vscode.dev`.

## Links

- Repository: https://github.com/malnati/vaults-diagram-tools
- Documentation: https://malnati.github.io/vaults-diagram-tools/
- npm: https://www.npmjs.com/package/vaults-diagram-tools

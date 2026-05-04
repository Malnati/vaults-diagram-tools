# Vaults Diagram Tools for VS Code

Desktop VS Code extension for `vaults-diagram-tools`.

## Features

- Render the active `.mmd` or `.mermaid` file to `.svg` and `.jpg` assets.
- Generate Mermaid source diagrams from a selected source directory.
- Validate the Vaults Markdown diagram policy for the active Markdown file.
- Register the bundled `vaults-diagram-tools` MCP stdio server for VS Code Agent Mode.

## Runtime

The extension bundles the npm package `vaults-diagram-tools` at the same version as the extension. Commands run the bundled Node entrypoints through the current VS Code extension host runtime. No `npx` or network download is used at command runtime.

## Commands

- `Vaults Diagram Tools: Render Current Mermaid File`
- `Vaults Diagram Tools: Generate Source Diagrams`
- `Vaults Diagram Tools: Validate Markdown Diagram Policy`

## MCP

The extension contributes one MCP server definition provider: `vaultsDiagramTools`. The server runs `vaults-diagram-tools` over stdio and exposes the package's explicit three-tool surface:

- `render_mermaid_text`
- `render_mermaid_file`
- `generate_source_diagrams`

## Requirements

- VS Code `1.118.0` or newer.
- Desktop/workspace extension host. This v1 does not target `vscode.dev`.

## Links

- Repository: https://github.com/malnati/vaults-diagram-tools
- Documentation: https://malnati.github.io/vaults-diagram-tools/
- npm: https://www.npmjs.com/package/vaults-diagram-tools

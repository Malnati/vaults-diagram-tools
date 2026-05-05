# Changelog

## Unreleased

- Added hybrid runtime auto-update with bundled fallback, managed cache, daily latest checks, and runtime status/update/bundled commands.
- Decoupled the extension package version from the bundled fallback `vaults-diagram-tools` package version.
- External registry publication is manual from a local terminal; GitHub Actions only validates and packages artifacts.

## 0.1.4

- Publishable VS Code extension package for `malnati.vaults-diagram-tools`.
- Added bundled runtime commands for Mermaid rendering, source diagrams, and Markdown policy validation.
- Added native VS Code MCP server definition provider for the bundled stdio server.

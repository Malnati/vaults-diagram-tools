# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added hybrid VS Code runtime resolution with a managed `vaults-diagram-tools@latest` cache, bundled offline fallback, runtime status, manual update, and force-bundled commands.
- Added tests covering managed-cache preference, offline fallback, forced runtime update, npm metadata integrity rejection, and secretless release workflow behavior.

### Changed

- Changed GitHub Actions release behavior to validate and package artifacts without publishing npm, VS Code Marketplace, Open VSX, container registries, or MCP Registry.
- Decoupled VS Code extension packaging from the root package version; the bundled fallback runtime can lag while the managed runtime follows the configured npm channel.

## [0.1.4] - 2026-05-04

### Added

- Added the publishable VS Code extension package `malnati.vaults-diagram-tools` with bundled runtime commands for Mermaid rendering, source diagram generation, Markdown policy validation, and native MCP stdio server registration.
- Added VS Code Marketplace and Open VSX packaging/publishing scripts and release workflow steps.

## [0.1.3] - 2026-05-04

### Fixed

- Updated MCP Registry name casing to `io.github.Malnati/vaults-diagram-tools` to match GitHub publisher authorization.

## [0.1.2] - 2026-05-04

### Added

- Added MCP Registry metadata through `server.json` for `io.github.malnati/vaults-diagram-tools`.
- Added npm package ownership verification with `mcpName`.

### Changed

- Automated MCP Registry publication in the release workflow after npm package publication.
- Aligned package, lockfile, MCP server, and VS Code packaging metadata to version `0.1.2`.

## [0.1.1] - 2026-05-04

### Added

- Published the public `vaults-diagram-tools` GitHub App entrypoint for read-only GitHub App installations.
- Documented the GitHub App scope, install URL, and explicit limitations: no webhook backend, no repository writes, and no Marketplace listing in this release.

### Changed

- Updated the README release status and install links for the `v0.1.1` release.
- Aligned package, lockfile, MCP server, and VS Code packaging metadata to version `0.1.1`.

### Security

- Kept GitHub App permissions at read-only repository contents access, with metadata access provided by GitHub and no private key, client secret, or webhook secret stored in the repository.

## [0.1.0] - 2026-05-04

### Added

- Initial standalone release of the Vaults diagram toolchain.
- Mermaid renderer CLI with SVG/JPEG output, optional ASCII/Unicode sidecars, offline icons, themes, and manifests.
- Source-code diagram generator CLI.
- MCP stdio server with three explicit tools.
- Docker/Podman, zip release, GitHub Actions, and packaging templates.

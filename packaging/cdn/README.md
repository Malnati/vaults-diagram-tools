# CDN facade

This package is CLI-first. CDN distribution exposes metadata and browser-safe helpers only.

- jsDelivr: `https://cdn.jsdelivr.net/npm/vaults-diagram-tools/packaging/cdn/vaults-diagram-tools.mjs`
- unpkg: `https://unpkg.com/vaults-diagram-tools/packaging/cdn/vaults-diagram-tools.mjs`

Server-side rendering still uses the Node CLI or container because SVG/JPEG rendering depends on Node/WASM/font assets.

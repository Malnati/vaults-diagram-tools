# Source diagrams tools

Headless source-code to Mermaid generator for `vaults-diagram-tools`.

## Usage

```bash
vaults-source-diagrams \
  --source-dir sample-project/src \
  --output-dir tmp/source-diagrams \
  --langs auto \
  --diagrams dependency,class
```

Direct checkout usage:

```bash
node packages/source-diagrams/source-diagrams.mjs \
  --source-dir sample-project/src \
  --output-dir tmp/source-diagrams
```

## Main flags

```text
--langs auto|python,javascript,typescript,java,cpp
--diagrams dependency,class,package,call,sequence
--files browser.ts,index.ts
--files-from config/source-files.txt
--max-nodes 120
--adapter-mode auto|external|heuristic
--render-mode canonical|placeholder
--no-render
```

## Render

`--render-mode canonical` delegates to `vaults-mermaid-render` via `packages/renderer/render-mermaid-assets.mjs`.
Set `VAULTS_MERMAID_RENDERER` to override the renderer path. Canonical render does not fall back to the legacy shell wrapper or `mmdc`.

`--render-mode placeholder` writes simple SVG/JPEG placeholders for fast logic tests only.

## Focused file mode

For `dependency` and `sequence`, `--files` / `--files-from` keeps requested files visible and collapses omitted connector files into edge/message labels. `manifest.selection` records requested files, visible diagram files, omitted connectors, collapsed edges, and pruned isolated files.

## Validation

```bash
npm run test:source
```

# Vaults compatibility

`vaults-diagram-tools` was extracted from `/Users/mal/Documents/Vaults/tools-repo` into the standalone GitHub repository `malnati/vaults-diagram-tools`.

Legacy Vaults paths remain as compatibility shims only:

- `tools/mermaid/render-mermaid-assets.sh`
- `tools/mermaid/render-mermaid-assets.mjs`
- `tools/mermaid/render-mermaid-ascii.mjs`
- `tools/mermaid/render-mermaid-bm.mjs`
- `tools/mermaid/check-markdown-diagram-policy.py`
- `tools/source-diagrams/source-diagrams.mjs`

The shims first look for installed commands on `PATH`. If no command is installed, they use `npm exec --yes --package github:malnati/vaults-diagram-tools -- <command>`.

There is no Git submodule under Vaults for this package.

Markdown diagram policy remains unchanged: keep `.mmd`, `.svg`, and `.jpg` artifacts as links and show Mermaid source in a fenced `mermaid` block.

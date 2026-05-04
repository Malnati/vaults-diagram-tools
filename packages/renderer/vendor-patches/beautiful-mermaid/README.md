# beautiful-mermaid patched runtime

This patched ESM bundle preserves the sequence-diagram layout behavior already validated in the Vaults renderer before extraction:

- message label backgrounds;
- near-white note fill;
- wider self-message and single-actor note spacing.

It is loaded before the npm package bundle so source checkouts and vendor-only release artifacts keep the same renderer behavior without committing `node_modules`.

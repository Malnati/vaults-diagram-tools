# Contributing

Thanks for helping improve `vaults-diagram-tools`.

## Development setup

```bash
npm ci
npm test
```

## Local validation

Run the same checks used by CI before opening a pull request:

```bash
npm test
npm run vendor:refresh
npm run test:vendor:offline
npm run audit:vendor:offline-runtime
npm pack --dry-run
npm run package:zip
```

Use Docker or Podman when changing container behavior:

```bash
docker build -f containers/Containerfile -t vaults-diagram-tools:local .
podman build -f containers/Containerfile -t vaults-diagram-tools:local .
```

## Commit style

Use Conventional Commits:

```text
feat: add new renderer capability
fix: correct source diagram selection
chore: update packaging metadata
```

## Pull requests

- Keep changes focused.
- Include validation output in the PR body.
- Update documentation when public behavior changes.
- Do not commit generated `node_modules`, `dist`, `tmp`, or local test output.

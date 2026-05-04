# Source diagrams

Generated at 2026-05-04T04:05:25.412Z.

#### JavaScript — dependency
- Adapter: `javascript-heuristic-dependency`; confidence: `heuristic`.
- Links: [Mermaid source](javascript/dependency.mmd) / [SVG](javascript/dependency.svg) / [JPEG](javascript/dependency.jpg)

```mermaid
flowchart LR
  N1["server.mjs"]
  N2["tests/mcp-tools.test.mjs"]
  N3["tools.mjs"]
  N1 --> N3
  N2 --> N3
```

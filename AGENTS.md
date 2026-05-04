# AGENTS.md

## Escopo operacional

Este repositório é o pacote standalone `vaults-diagram-tools`, extraído para concentrar ferramentas portáveis de diagramas Mermaid, diagramas derivados de código-fonte e MCP.

Use este repositório para:

- Renderizar fontes Mermaid para artefatos `.svg` e `.jpg`.
- Gerar diagramas Mermaid a partir de árvores de código-fonte.
- Expor as ferramentas de diagramação por MCP stdio.
- Validar a política Markdown de diagramas.

Mantenha este repositório limitado ao tooling portável de diagramas; fluxos de conteúdo externo ficam fora do escopo operacional deste pacote.

## Artefatos de agentes identificados no projeto

### Codex

- `AGENTS.md`: orientação operacional do projeto para agentes.

### Cursor

- `.cursor/rules/mermaid-renderer-tooling.mdc`
- `.cursor/rules/source-diagrams-tooling.mdc`
- `.cursor/skills/mermaid-renderer-tooling.md`
- `.cursor/skills/source-diagrams-tooling.md`
- `.cursor/hooks.json`: superfície explícita sem hooks configurados.

### Tooling real do repositório

- `vaults-mermaid-render`: CLI pública para renderização Mermaid.
- `vaults-source-diagrams`: CLI pública para geração de diagramas a partir de código-fonte.
- `vaults-diagram-mcp`: servidor MCP stdio do pacote.
- `vaults-markdown-diagram-policy`: checker da política Markdown de diagramas.
- `packages/renderer/render-mermaid-assets.mjs`: implementação principal do renderer.
- `packages/renderer/render-mermaid-assets.sh`: wrapper de compatibilidade do renderer.
- `packages/renderer/check-markdown-diagram-policy.py`: implementação do checker Markdown.
- `packages/source-diagrams/source-diagrams.mjs`: implementação principal do gerador source-diagrams.
- `packages/mcp/server.mjs`: servidor MCP.
- `packages/mcp/tools.mjs`: adaptação MCP para os CLIs reais.

## Regras obrigatórias

1. Ao renderizar Mermaid, cada fonte `.mmd` ou `.mermaid` deve gerar `.svg` e `.jpg` no mesmo ciclo.
2. Em Markdown, exibir o código Mermaid em bloco cercado com linguagem `mermaid`; não usar `mmd` como linguagem do bloco.
3. Em Markdown, manter `.mmd`, `.svg` e `.jpg` como links relativos; não embutir SVG/JPEG com sintaxe de imagem por padrão.
4. Usar `vaults-mermaid-render` ou `packages/renderer/render-mermaid-assets.mjs` para renderização canônica.
5. Usar `vaults-source-diagrams` ou `packages/source-diagrams/source-diagrams.mjs` para diagramas derivados de código-fonte.
6. Para fluxos MCP, manter a superfície explícita de três tools: `render_mermaid_text`, `render_mermaid_file`, `generate_source_diagrams`.
7. Para lógica e testes rápidos de source-diagrams, usar `--render-mode placeholder` quando a fidelidade visual não estiver em escopo.
8. Para entrega real de assets, usar renderização canônica e validar presença de `.mmd`, `.svg`, `.jpg` e manifest quando aplicável.

## Fluxos canônicos

### Renderização Mermaid

1. Criar ou localizar fonte `.mmd` / `.mermaid`.
2. Executar `vaults-mermaid-render <fonte> --output-dir <destino>` ou o equivalente local com `node packages/renderer/render-mermaid-assets.mjs`.
3. Confirmar geração de `.svg` e `.jpg`.
4. Se houver Markdown de entrega, linkar fonte, SVG e JPEG e exibir o conteúdo em bloco `mermaid`.
5. Rodar `vaults-markdown-diagram-policy <arquivo.md>` quando o Markdown fizer parte da entrega.

### Diagramas de código-fonte

1. Identificar `--source-dir` e `--output-dir`.
2. Definir `--langs` e `--diagrams` somente quando o padrão automático não for suficiente.
3. Para diagramas focados, usar `--files` ou `--files-from`.
4. Validar `manifest.selection` quando houver seleção focada: arquivos pedidos, nós visíveis, conectores omitidos e arquivos isolados podados.
5. Confirmar que o `.mmd` representa os imports/relacionamentos reais do código-fonte, não apenas que os arquivos foram gerados.

### MCP

1. Iniciar `vaults-diagram-mcp` ou `node packages/mcp/server.mjs`.
2. Usar somente as três tools explícitas expostas pelo servidor.
3. Não adicionar tools MCP genéricas sem necessidade comprovada e testes correspondentes.

## Restrições de mudança

- Manter edições mínimas e fundamentadas no uso real deste repositório.
- Não inventar subagents, commands, hooks, tools ou runtimes inexistentes no checkout.
- Respeitar worktrees sujas: antes de alterar arquivo existente, verificar se a mudança atual é do usuário ou de outro agente.
- Não criar novas superfícies `.codex/`, `.claude/`, `.agents/`, `opencode.json` ou instruções de outras plataformas sem pedido explícito.
- Não converter este pacote em repositório de conteúdo; manter foco em tooling portável de diagramas.

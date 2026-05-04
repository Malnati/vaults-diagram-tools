#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { generateSourceDiagrams, renderMermaidFile, renderMermaidText } from "./tools.mjs";

const server = new McpServer({
  name: "vaults-diagram-tools",
  version: "0.1.0",
});

function resultContent(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: !result.ok,
  };
}

server.registerTool(
  "render_mermaid_text",
  {
    title: "Render Mermaid text",
    description: "Render Mermaid source text to SVG/JPEG and optional PNG/ASCII artifacts.",
    inputSchema: {
      source: z.string().min(1),
      fileName: z.string().optional(),
      outputDir: z.string().optional(),
      theme: z.string().optional(),
      background: z.string().optional(),
      png: z.boolean().optional(),
      ascii: z.boolean().optional(),
      asciiMode: z.enum(["unicode", "ascii"]).optional(),
    },
  },
  async (input) => resultContent(await renderMermaidText(input)),
);

server.registerTool(
  "render_mermaid_file",
  {
    title: "Render Mermaid file",
    description: "Render a .mmd/.mermaid file or tree to SVG/JPEG and optional PNG/ASCII artifacts.",
    inputSchema: {
      source: z.string().min(1),
      outputDir: z.string().optional(),
      inputRoot: z.string().optional(),
      manifest: z.string().optional(),
      theme: z.string().optional(),
      background: z.string().optional(),
      quality: z.number().optional(),
      rasterScale: z.number().optional(),
      png: z.boolean().optional(),
      ascii: z.boolean().optional(),
      asciiMode: z.enum(["unicode", "ascii"]).optional(),
      vendorOnly: z.boolean().optional(),
    },
  },
  async (input) => resultContent(await renderMermaidFile(input)),
);

server.registerTool(
  "generate_source_diagrams",
  {
    title: "Generate source diagrams",
    description: "Generate Mermaid diagrams from source code and render SVG/JPEG assets.",
    inputSchema: {
      sourceDir: z.string().min(1),
      outputDir: z.string().optional(),
      manifest: z.string().optional(),
      langs: z.union([z.string(), z.array(z.string())]).optional(),
      diagrams: z.union([z.string(), z.array(z.string())]).optional(),
      files: z.union([z.string(), z.array(z.string())]).optional(),
      filesFrom: z.union([z.string(), z.array(z.string())]).optional(),
      maxNodes: z.number().optional(),
      exclude: z.union([z.string(), z.array(z.string())]).optional(),
      adapterMode: z.enum(["auto", "external", "heuristic"]).optional(),
      renderMode: z.enum(["canonical", "placeholder"]).optional(),
      noRender: z.boolean().optional(),
      noIndex: z.boolean().optional(),
      vendorOnly: z.boolean().optional(),
    },
  },
  async (input) => resultContent(await generateSourceDiagrams(input)),
);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("vaults-diagram-mcp: MCP stdio server exposing render_mermaid_text, render_mermaid_file, generate_source_diagrams");
  process.exit(0);
}

await server.connect(new StdioServerTransport());

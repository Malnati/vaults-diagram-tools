const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_ROOT, "package.json"), "utf8"));

function makeFakeVscode() {
  const registeredCommands = new Map();
  const providers = new Map();
  class McpStdioServerDefinition {
    constructor(definition) {
      Object.assign(this, definition);
    }
  }
  return {
    registeredCommands,
    providers,
    ProgressLocation: { Notification: 15 },
    Uri: { file: (filePath) => ({ fsPath: filePath, scheme: "file" }) },
    EventEmitter: class {
      constructor() {
        this.event = () => undefined;
      }
      fire() {}
      dispose() {}
    },
    McpStdioServerDefinition,
    commands: {
      registerCommand(command, callback) {
        registeredCommands.set(command, callback);
        return { dispose() {} };
      },
    },
    lm: {
      registerMcpServerDefinitionProvider(id, provider) {
        providers.set(id, provider);
        return { dispose() {} };
      },
    },
    window: {
      activeTextEditor: undefined,
      createOutputChannel() {
        return { appendLine() {}, show() {}, dispose() {} };
      },
      withProgress(_options, task) {
        return task({ report() {} });
      },
      showInformationMessage() {},
      showErrorMessage() {},
      showOpenDialog() {
        return undefined;
      },
    },
    workspace: {
      getConfiguration() {
        return { get(_key, defaultValue) { return defaultValue; } };
      },
      workspaceFolders: [],
    },
  };
}

function makeFakeRuntimeManager(runtime) {
  const resolved = runtime || require("../extension.cjs").resolveRuntimePaths(EXTENSION_ROOT);
  return {
    didUpdate: false,
    didUseBundled: false,
    async resolveRuntime() {
      return resolved;
    },
    async updateManagedRuntime() {
      this.didUpdate = true;
      return { ...resolved, source: "managed", version: "9.9.9" };
    },
    async useBundledRuntime() {
      this.didUseBundled = true;
      return { ...resolved, source: "bundled" };
    },
    async status() {
      return {
        mode: "hybrid",
        channel: "latest",
        bundled: { ...resolved, source: "bundled", version: manifest.dependencies["vaults-diagram-tools"] },
        managed: { ...resolved, source: "managed", version: "9.9.9" },
        active: { ...resolved, source: "managed", version: "9.9.9" },
      };
    },
  };
}

test("extension manifest is a publishable desktop VS Code extension", () => {
  assert.equal(manifest.name, "vaults-diagram-tools");
  assert.equal(manifest.publisher, "malnati");
  assert.equal(manifest.main, "./extension.cjs");
  assert.deepEqual(manifest.extensionKind, ["workspace"]);
  assert.equal(manifest.engines.vscode, "^1.118.0");
  assert.match(manifest.repository.url, /malnati\/vaults-diagram-tools/);
  assert.equal(manifest.license, "MIT");

  const commands = manifest.contributes.commands.map((command) => command.command).sort();
  assert.deepEqual(commands, [
    "vaultsDiagramTools.generateSourceDiagrams",
    "vaultsDiagramTools.renderCurrentMermaid",
    "vaultsDiagramTools.showRuntimeStatus",
    "vaultsDiagramTools.updateRuntimeNow",
    "vaultsDiagramTools.useBundledRuntime",
    "vaultsDiagramTools.validateMarkdownDiagramPolicy",
  ]);

  assert.deepEqual(manifest.contributes.mcpServerDefinitionProviders, [
    {
      id: "vaultsDiagramTools",
      label: "Vaults Diagram Tools MCP",
    },
  ]);

  assert.equal(typeof manifest.dependencies["vaults-diagram-tools"], "string");
  assert.equal(manifest.contributes.configuration.properties["vaultsDiagramTools.runtime.mode"].default, "hybrid");
  assert.equal(manifest.contributes.configuration.properties["vaultsDiagramTools.runtime.channel"].default, "latest");
});

test("runtime paths resolve to the bundled npm package", () => {
  const extension = require("../extension.cjs");
  const runtime = extension.resolveRuntimePaths(EXTENSION_ROOT);

  assert.equal(runtime.packageRoot, path.join(EXTENSION_ROOT, "node_modules", "vaults-diagram-tools"));
  assert.equal(runtime.renderer, path.join(runtime.packageRoot, "packages", "renderer", "render-mermaid-assets.mjs"));
  assert.equal(runtime.sourceDiagrams, path.join(runtime.packageRoot, "packages", "source-diagrams", "source-diagrams.mjs"));
  assert.equal(runtime.mcpServer, path.join(runtime.packageRoot, "packages", "mcp", "server.mjs"));
});

test("CLI invocations use the current Node runtime and force Electron into node mode", () => {
  const extension = require("../extension.cjs");
  const invocation = extension.createNodeCliInvocation("/tmp/tool.mjs", ["--flag"], { cwd: "/tmp/project" });

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, ["/tmp/tool.mjs", "--flag"]);
  assert.equal(invocation.options.cwd, "/tmp/project");
  assert.equal(invocation.options.env.ELECTRON_RUN_AS_NODE, "1");
});

test("activation registers commands and a bundled MCP stdio server provider", async () => {
  const extension = require("../extension.cjs");
  const fakeVscode = makeFakeVscode();
  const context = { extensionPath: EXTENSION_ROOT, subscriptions: [] };

  extension.activate(context, fakeVscode, {
    runtimeManager: makeFakeRuntimeManager(),
    spawnRunner: async () => ({ stdout: "", stderr: "" }),
  });

  assert.deepEqual([...fakeVscode.registeredCommands.keys()].sort(), [
    "vaultsDiagramTools.generateSourceDiagrams",
    "vaultsDiagramTools.renderCurrentMermaid",
    "vaultsDiagramTools.showRuntimeStatus",
    "vaultsDiagramTools.updateRuntimeNow",
    "vaultsDiagramTools.useBundledRuntime",
    "vaultsDiagramTools.validateMarkdownDiagramPolicy",
  ]);
  assert.equal(fakeVscode.providers.size, 1);

  const provider = fakeVscode.providers.get("vaultsDiagramTools");
  const servers = await provider.provideMcpServerDefinitions();

  assert.equal(servers.length, 1);
  assert.equal(servers[0].label, "vaults-diagram-tools");
  assert.equal(servers[0].command, process.execPath);
  assert.deepEqual(servers[0].args, [path.join(EXTENSION_ROOT, "node_modules", "vaults-diagram-tools", "packages", "mcp", "server.mjs")]);
  assert.equal(servers[0].cwd, path.join(EXTENSION_ROOT, "node_modules", "vaults-diagram-tools"));
  assert.equal(servers[0].env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(servers[0].version, manifest.version);
});

test("render command targets the active Mermaid file and expects SVG/JPEG assets", async () => {
  const extension = require("../extension.cjs");
  const fakeVscode = makeFakeVscode();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-vscode-render-"));
  const sourceFile = path.join(tempDir, "diagram.mmd");
  fs.writeFileSync(sourceFile, "flowchart TB\n  A --> B\n");
  fakeVscode.window.activeTextEditor = {
    document: {
      uri: { scheme: "file", fsPath: sourceFile },
      fileName: sourceFile,
      isDirty: false,
      save: async () => true,
    },
  };
  const spawned = [];
  const context = { extensionPath: EXTENSION_ROOT, subscriptions: [] };
  extension.activate(context, fakeVscode, {
    runtimeManager: makeFakeRuntimeManager(),
    spawnRunner: async (invocation) => {
      spawned.push(invocation);
      fs.writeFileSync(path.join(tempDir, "diagram.svg"), "<svg></svg>");
      fs.writeFileSync(path.join(tempDir, "diagram.jpg"), "jpg");
      return { stdout: "ok", stderr: "" };
    },
  });

  const result = await fakeVscode.registeredCommands.get("vaultsDiagramTools.renderCurrentMermaid")();

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].args[1], sourceFile);
  assert.deepEqual(spawned[0].args.slice(2), ["--output-dir", tempDir]);
  assert.deepEqual(result.assets.map((asset) => path.basename(asset)).sort(), ["diagram.jpg", "diagram.svg"]);
});

test("source diagram command prompts for source/output folders and runs bundled generator", async () => {
  const extension = require("../extension.cjs");
  const fakeVscode = makeFakeVscode();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-vscode-source-"));
  const sourceDir = path.join(tempDir, "src");
  const outputDir = path.join(tempDir, "diagrams");
  fs.mkdirSync(sourceDir);
  const selections = [
    [{ fsPath: sourceDir }],
    [{ fsPath: outputDir }],
  ];
  fakeVscode.window.showOpenDialog = async () => selections.shift();
  fakeVscode.workspace.getConfiguration = () => ({
    get(key, defaultValue) {
      if (key === "sourceDiagramsRenderMode") return "placeholder";
      return defaultValue;
    },
  });
  const spawned = [];
  const context = { extensionPath: EXTENSION_ROOT, subscriptions: [] };
  extension.activate(context, fakeVscode, {
    runtimeManager: makeFakeRuntimeManager(),
    spawnRunner: async (invocation) => {
      spawned.push(invocation);
      return { stdout: "ok", stderr: "" };
    },
  });

  const result = await fakeVscode.registeredCommands.get("vaultsDiagramTools.generateSourceDiagrams")();

  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0].args.slice(1), [
    "--source-dir",
    sourceDir,
    "--output-dir",
    outputDir,
    "--render-mode",
    "placeholder",
  ]);
  assert.equal(fs.existsSync(outputDir), true);
  assert.deepEqual(result, { sourceDir, outputDir });
});

test("runtime commands update, report, and switch to bundled runtime", async () => {
  const extension = require("../extension.cjs");
  const fakeVscode = makeFakeVscode();
  const runtimeManager = makeFakeRuntimeManager();
  const infoMessages = [];
  fakeVscode.window.showInformationMessage = (message) => infoMessages.push(message);
  const context = { extensionPath: EXTENSION_ROOT, subscriptions: [] };

  extension.activate(context, fakeVscode, {
    runtimeManager,
    spawnRunner: async () => ({ stdout: "", stderr: "" }),
  });

  await fakeVscode.registeredCommands.get("vaultsDiagramTools.updateRuntimeNow")();
  await fakeVscode.registeredCommands.get("vaultsDiagramTools.showRuntimeStatus")();
  await fakeVscode.registeredCommands.get("vaultsDiagramTools.useBundledRuntime")();

  assert.equal(runtimeManager.didUpdate, true);
  assert.equal(runtimeManager.didUseBundled, true);
  assert.equal(infoMessages.some((message) => /managed runtime 9\.9\.9/i.test(message)), true);
  assert.equal(infoMessages.some((message) => /active runtime: managed 9\.9\.9/i.test(message)), true);
  assert.equal(infoMessages.some((message) => /bundled runtime/i.test(message)), true);
});

test("runtime manager prefers a valid managed cache over bundled runtime", async () => {
  const extension = require("../extension.cjs");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-runtime-cache-"));
  const context = {
    extensionPath: EXTENSION_ROOT,
    globalStorageUri: { fsPath: tempDir },
    globalState: {
      state: new Map([
        ["vaultsDiagramTools.runtime.lastCheck.latest", 2_000],
        ["vaultsDiagramTools.runtime.managedVersion.latest", "9.9.9"],
      ]),
      get(key, defaultValue) { return this.state.has(key) ? this.state.get(key) : defaultValue; },
      async update(key, value) { this.state.set(key, value); },
    },
  };
  const prefix = path.join(tempDir, "runtimes", "vaults-diagram-tools", "latest", "9.9.9");
  const packageRoot = path.join(prefix, "node_modules", "vaults-diagram-tools");
  fs.mkdirSync(path.join(packageRoot, "packages", "renderer"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "packages", "source-diagrams"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "packages", "mcp"), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ name: "vaults-diagram-tools", version: "9.9.9" }));
  fs.writeFileSync(path.join(packageRoot, "packages", "renderer", "render-mermaid-assets.mjs"), "");
  fs.writeFileSync(path.join(packageRoot, "packages", "source-diagrams", "source-diagrams.mjs"), "");
  fs.writeFileSync(path.join(packageRoot, "packages", "mcp", "server.mjs"), "");

  const manager = extension.createRuntimeManager(context, makeFakeVscode(), {
    now: () => 2_000 + 60_000,
    fetchPackageMetadata: async () => {
      throw new Error("network should not be called during fresh daily window");
    },
  });

  const runtime = await manager.resolveRuntime();

  assert.equal(runtime.source, "managed");
  assert.equal(runtime.version, "9.9.9");
  assert.equal(runtime.packageRoot, packageRoot);
});

test("runtime manager falls back to bundled when latest check fails", async () => {
  const extension = require("../extension.cjs");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-runtime-fallback-"));
  const state = new Map([["vaultsDiagramTools.runtime.lastCheck.latest", 0]]);
  const context = {
    extensionPath: EXTENSION_ROOT,
    globalStorageUri: { fsPath: tempDir },
    globalState: {
      get(key, defaultValue) { return state.has(key) ? state.get(key) : defaultValue; },
      async update(key, value) { state.set(key, value); },
    },
  };
  const manager = extension.createRuntimeManager(context, makeFakeVscode(), {
    now: () => 86_400_001,
    fetchPackageMetadata: async () => {
      throw new Error("offline");
    },
  });

  const runtime = await manager.resolveRuntime();

  assert.equal(runtime.source, "bundled");
  assert.equal(state.get("vaultsDiagramTools.runtime.lastCheck.latest"), 86_400_001);
});

test("runtime manager installs latest into managed cache when forced", async () => {
  const extension = require("../extension.cjs");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-runtime-install-"));
  const state = new Map();
  const context = {
    extensionPath: EXTENSION_ROOT,
    globalStorageUri: { fsPath: tempDir },
    globalState: {
      get(key, defaultValue) { return state.has(key) ? state.get(key) : defaultValue; },
      async update(key, value) { state.set(key, value); },
    },
  };
  const manager = extension.createRuntimeManager(context, makeFakeVscode(), {
    now: () => 5_000,
    fetchPackageMetadata: async () => ({ version: "9.9.9", dist: { integrity: "sha512-test" } }),
    installPackage: async ({ installPrefix, version }) => {
      const packageRoot = path.join(installPrefix, "node_modules", "vaults-diagram-tools");
      fs.mkdirSync(path.join(packageRoot, "packages", "renderer"), { recursive: true });
      fs.mkdirSync(path.join(packageRoot, "packages", "source-diagrams"), { recursive: true });
      fs.mkdirSync(path.join(packageRoot, "packages", "mcp"), { recursive: true });
      fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ name: "vaults-diagram-tools", version }));
      fs.writeFileSync(path.join(packageRoot, "packages", "renderer", "render-mermaid-assets.mjs"), "");
      fs.writeFileSync(path.join(packageRoot, "packages", "source-diagrams", "source-diagrams.mjs"), "");
      fs.writeFileSync(path.join(packageRoot, "packages", "mcp", "server.mjs"), "");
    },
  });

  const runtime = await manager.updateManagedRuntime({ force: true });

  assert.equal(runtime.source, "managed");
  assert.equal(runtime.version, "9.9.9");
  assert.equal(state.get("vaultsDiagramTools.runtime.managedVersion.latest"), "9.9.9");
});

test("runtime manager rejects metadata without npm integrity", async () => {
  const extension = require("../extension.cjs");
  const manager = extension.createRuntimeManager({
    extensionPath: EXTENSION_ROOT,
    globalStorageUri: { fsPath: fs.mkdtempSync(path.join(os.tmpdir(), "vaults-runtime-integrity-")) },
    globalState: { get(_key, defaultValue) { return defaultValue; }, async update() {} },
  }, makeFakeVscode(), {
    fetchPackageMetadata: async () => ({ version: "9.9.9", dist: {} }),
  });

  await assert.rejects(
    () => manager.updateManagedRuntime({ force: true }),
    /integrity/i,
  );
});

test("Markdown policy helper detects mmd fences and generated SVG embeds", () => {
  const extension = require("../extension.cjs");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaults-vscode-policy-"));
  fs.writeFileSync(path.join(tempDir, "example.mmd"), "flowchart TB\n  A --> B\n");
  const issues = extension.checkMarkdownPolicyText(
    [
      "# Example",
      "",
      "![Generated](example.svg)",
      "",
      "```mmd",
      "flowchart TB",
      "  A --> B",
      "```",
      "",
    ].join("\n"),
    tempDir,
  );

  assert.equal(issues.length, 2);
  assert.match(issues[0], /```mmd/);
  assert.match(issues[1], /embedded Mermaid diagram SVG/);
});

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

let vscode;
try {
  vscode = require("vscode");
} catch (_error) {
  vscode = undefined;
}

const EXTENSION_PACKAGE = require("./package.json");
const MCP_PROVIDER_ID = "vaultsDiagramTools";
const MCP_LABEL = "vaults-diagram-tools";
const MERMAID_EXTENSIONS = new Set([".mmd", ".mermaid"]);
const MMD_FENCE_BLOCK = /```mmd\s*\n/i;

function resolveRuntimePaths(extensionPath) {
  const packageRoot = path.join(extensionPath, "node_modules", "vaults-diagram-tools");
  return {
    packageRoot,
    renderer: path.join(packageRoot, "packages", "renderer", "render-mermaid-assets.mjs"),
    sourceDiagrams: path.join(packageRoot, "packages", "source-diagrams", "source-diagrams.mjs"),
    mcpServer: path.join(packageRoot, "packages", "mcp", "server.mjs"),
  };
}

function createNodeCliInvocation(scriptPath, args = [], options = {}) {
  return {
    command: process.execPath,
    args: [scriptPath, ...args],
    options: {
      cwd: options.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        ...(options.env || {}),
      },
    },
  };
}

function formatSpawnFailure(invocation, code, signal, stdout, stderr) {
  const rendered = [invocation.command, ...invocation.args].join(" ");
  const status = signal ? `signal ${signal}` : `exit ${code}`;
  const detail = stderr || stdout || "no output";
  return `Command failed (${status}): ${rendered}\n${detail}`;
}

function runInvocation(invocation, outputChannel) {
  outputChannel?.appendLine?.(`$ ${[invocation.command, ...invocation.args].join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, invocation.options);
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      outputChannel?.appendLine?.(text.trimEnd());
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      outputChannel?.appendLine?.(text.trimEnd());
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(formatSpawnFailure(invocation, code, signal, stdout, stderr)));
    });
  });
}

function requireVscodeApi(vscodeApi) {
  if (!vscodeApi) {
    throw new Error("VS Code API is unavailable. This module must be activated by VS Code.");
  }
  return vscodeApi;
}

function activeFileEditor(vscodeApi) {
  const editor = vscodeApi.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") {
    throw new Error("Open a file-backed editor before running this command.");
  }
  return editor;
}

async function saveIfDirty(document) {
  if (document.isDirty) {
    const saved = await document.save();
    if (!saved) {
      throw new Error(`Could not save ${document.fileName}.`);
    }
  }
}

function outputAssetsForMermaid(sourceFile) {
  const dir = path.dirname(sourceFile);
  const basename = path.basename(sourceFile, path.extname(sourceFile));
  return [path.join(dir, `${basename}.svg`), path.join(dir, `${basename}.jpg`)];
}

function markdownImageTargets(text) {
  const targets = [];
  for (const line of text.split(/\r?\n/)) {
    let start = 0;
    while (start < line.length) {
      const imageStart = line.indexOf("![", start);
      if (imageStart === -1) break;

      const altEnd = line.indexOf("]", imageStart + 2);
      if (altEnd === -1) break;

      const targetStart = altEnd + 1;
      if (line[targetStart] !== "(") {
        start = altEnd + 1;
        continue;
      }

      const targetEnd = line.indexOf(")", targetStart + 1);
      if (targetEnd === -1) break;

      const target = line.slice(targetStart + 1, targetEnd).trim();
      if (target) targets.push(target);
      start = targetEnd + 1;
    }
  }
  return targets;
}

function isSvgTarget(target) {
  const clean = target.split("#", 1)[0].split("?", 1)[0];
  return clean.toLowerCase().endsWith(".svg");
}

function checkMarkdownPolicyText(text, markdownDir) {
  const issues = [];
  if (MMD_FENCE_BLOCK.test(text)) {
    issues.push("uses a ```mmd block; the correct repository default is a ```mermaid block.");
  }

  for (const raw of markdownImageTargets(text)) {
    if (!isSvgTarget(raw)) continue;
    if (/^https?:\/\//i.test(raw)) continue;
    const clean = raw.split("#", 1)[0].split("?", 1)[0];
    const svgPath = path.resolve(markdownDir, clean);
    if (fs.existsSync(svgPath.replace(/\.svg$/i, ".mmd"))) {
      issues.push(`embedded Mermaid diagram SVG found: ${raw}; use .mmd/.svg/.jpg links and a mermaid block.`);
    }
  }
  return issues;
}

async function commandWithProgress(vscodeApi, title, callback) {
  return vscodeApi.window.withProgress(
    { location: vscodeApi.ProgressLocation.Notification, title, cancellable: false },
    async (progress) => {
      progress.report({ message: "running" });
      return callback();
    },
  );
}

function createCommands(context, vscodeApi, options) {
  const outputChannel = vscodeApi.window.createOutputChannel("Vaults Diagram Tools");
  const runtime = resolveRuntimePaths(context.extensionPath);
  const spawnRunner = options.spawnRunner || ((invocation) => runInvocation(invocation, outputChannel));

  async function renderCurrentMermaid() {
    return commandWithProgress(vscodeApi, "Rendering Mermaid assets", async () => {
      const editor = activeFileEditor(vscodeApi);
      const sourceFile = editor.document.uri.fsPath;
      const ext = path.extname(sourceFile).toLowerCase();
      if (!MERMAID_EXTENSIONS.has(ext)) {
        throw new Error("Active file must use .mmd or .mermaid extension.");
      }
      await saveIfDirty(editor.document);
      const outDir = path.dirname(sourceFile);
      const invocation = createNodeCliInvocation(runtime.renderer, [sourceFile, "--output-dir", outDir], {
        cwd: runtime.packageRoot,
      });
      await spawnRunner(invocation);
      const assets = outputAssetsForMermaid(sourceFile);
      for (const asset of assets) {
        if (!fs.existsSync(asset)) {
          throw new Error(`Expected generated asset was not found: ${asset}`);
        }
      }
      vscodeApi.window.showInformationMessage(`Rendered ${path.basename(assets[0])} and ${path.basename(assets[1])}.`);
      return { source: sourceFile, assets };
    });
  }

  async function generateSourceDiagrams() {
    return commandWithProgress(vscodeApi, "Generating source diagrams", async () => {
      const workspaceFolder = vscodeApi.workspace.workspaceFolders?.[0]?.uri;
      const sourceSelection = await vscodeApi.window.showOpenDialog({
        title: "Select source directory",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: workspaceFolder,
      });
      if (!sourceSelection?.[0]) return undefined;
      const config = vscodeApi.workspace.getConfiguration("vaultsDiagramTools");
      const outputDirectoryName = config.get("outputDirectoryName", "diagrams");
      const sourceDir = sourceSelection[0].fsPath;
      const outputSelection = await vscodeApi.window.showOpenDialog({
        title: "Select output directory",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscodeApi.Uri.file(path.join(path.dirname(sourceDir), outputDirectoryName)),
      });
      if (!outputSelection?.[0]) return undefined;
      const outputDir = outputSelection[0].fsPath;
      await fsp.mkdir(outputDir, { recursive: true });
      const renderMode = config.get("sourceDiagramsRenderMode", "canonical");
      const invocation = createNodeCliInvocation(
        runtime.sourceDiagrams,
        ["--source-dir", sourceDir, "--output-dir", outputDir, "--render-mode", renderMode],
        { cwd: runtime.packageRoot },
      );
      await spawnRunner(invocation);
      vscodeApi.window.showInformationMessage(`Generated source diagrams in ${outputDir}.`);
      return { sourceDir, outputDir };
    });
  }

  async function validateMarkdownDiagramPolicy() {
    return commandWithProgress(vscodeApi, "Validating Markdown diagram policy", async () => {
      const editor = activeFileEditor(vscodeApi);
      const markdownFile = editor.document.uri.fsPath;
      if (path.extname(markdownFile).toLowerCase() !== ".md") {
        throw new Error("Active file must be a Markdown (.md) file.");
      }
      await saveIfDirty(editor.document);
      const text = typeof editor.document.getText === "function"
        ? editor.document.getText()
        : await fsp.readFile(markdownFile, "utf8");
      const issues = checkMarkdownPolicyText(text, path.dirname(markdownFile));
      if (issues.length === 0) {
        vscodeApi.window.showInformationMessage("Markdown follows the Vaults Mermaid diagram policy.");
      } else {
        outputChannel.show();
        for (const issue of issues) outputChannel.appendLine(`${markdownFile}: ${issue}`);
        vscodeApi.window.showErrorMessage(`Markdown diagram policy found ${issues.length} issue(s).`);
      }
      return { file: markdownFile, issues };
    });
  }

  return {
    outputChannel,
    runtime,
    renderCurrentMermaid,
    generateSourceDiagrams,
    validateMarkdownDiagramPolicy,
  };
}

function registerMcpProvider(context, vscodeApi, runtime) {
  if (!vscodeApi.lm?.registerMcpServerDefinitionProvider || !vscodeApi.McpStdioServerDefinition) {
    return undefined;
  }

  const didChangeEmitter = new vscodeApi.EventEmitter();
  const provider = {
    onDidChangeMcpServerDefinitions: didChangeEmitter.event,
    async provideMcpServerDefinitions() {
      return [
        new vscodeApi.McpStdioServerDefinition({
          label: MCP_LABEL,
          command: process.execPath,
          args: [runtime.mcpServer],
          cwd: runtime.packageRoot,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
          },
          version: EXTENSION_PACKAGE.version,
        }),
      ];
    },
    async resolveMcpServerDefinition(server) {
      return server;
    },
  };
  context.subscriptions.push(didChangeEmitter);
  const disposable = vscodeApi.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, provider);
  context.subscriptions.push(disposable);
  return disposable;
}

function activate(context, injectedVscode, options = {}) {
  const vscodeApi = requireVscodeApi(injectedVscode || vscode);
  const commands = createCommands(context, vscodeApi, options);
  context.subscriptions.push(commands.outputChannel);
  context.subscriptions.push(vscodeApi.commands.registerCommand("vaultsDiagramTools.renderCurrentMermaid", commands.renderCurrentMermaid));
  context.subscriptions.push(vscodeApi.commands.registerCommand("vaultsDiagramTools.generateSourceDiagrams", commands.generateSourceDiagrams));
  context.subscriptions.push(vscodeApi.commands.registerCommand("vaultsDiagramTools.validateMarkdownDiagramPolicy", commands.validateMarkdownDiagramPolicy));
  registerMcpProvider(context, vscodeApi, commands.runtime);
  return commands;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  resolveRuntimePaths,
  createNodeCliInvocation,
  checkMarkdownPolicyText,
};

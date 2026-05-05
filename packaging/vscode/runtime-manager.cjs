const fs = require("node:fs");
const fsp = require("node:fs/promises");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PACKAGE_NAME = "vaults-diagram-tools";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MODES = new Set(["hybrid", "bundled", "managed"]);

function resolveRuntimePaths(extensionPath, source = "bundled", version) {
  const packageRoot = path.join(extensionPath, "node_modules", PACKAGE_NAME);
  return pathsForPackageRoot(packageRoot, source, version);
}

function pathsForPackageRoot(packageRoot, source = "managed", version) {
  return {
    source,
    version: version || readPackageVersion(packageRoot),
    packageRoot,
    renderer: path.join(packageRoot, "packages", "renderer", "render-mermaid-assets.mjs"),
    sourceDiagrams: path.join(packageRoot, "packages", "source-diagrams", "source-diagrams.mjs"),
    mcpServer: path.join(packageRoot, "packages", "mcp", "server.mjs"),
  };
}

function readPackageVersion(packageRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    return pkg.version;
  } catch (_error) {
    return undefined;
  }
}

function normalizeMode(mode) {
  return MODES.has(mode) ? mode : "hybrid";
}

function safeSegment(value) {
  return String(value || "latest").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function stateGet(context, key, defaultValue) {
  return context.globalState?.get?.(key, defaultValue) ?? defaultValue;
}

async function stateUpdate(context, key, value) {
  if (context.globalState?.update) {
    await context.globalState.update(key, value);
  }
}

function storagePathFor(context, options = {}) {
  if (options.storagePath) return options.storagePath;
  if (context.globalStorageUri?.fsPath) return context.globalStorageUri.fsPath;
  return path.join(os.tmpdir(), "vaults-diagram-tools-vscode", "globalStorage");
}

function cacheRoot(storagePath, channel) {
  return path.join(storagePath, "runtimes", PACKAGE_NAME, safeSegment(channel));
}

function cachePrefix(storagePath, channel, version) {
  return path.join(cacheRoot(storagePath, channel), safeSegment(version));
}

function isManagedRuntimeValid(prefix, expectedVersion) {
  const packageRoot = path.join(prefix, "node_modules", PACKAGE_NAME);
  const runtime = pathsForPackageRoot(packageRoot, "managed");
  if (!fs.existsSync(path.join(packageRoot, "package.json"))) return undefined;
  if (expectedVersion && runtime.version !== expectedVersion) return undefined;
  for (const required of [runtime.renderer, runtime.sourceDiagrams, runtime.mcpServer]) {
    if (!fs.existsSync(required)) return undefined;
  }
  return runtime;
}

async function findManagedRuntime(context, storagePath, channel) {
  const managedVersionKey = `vaultsDiagramTools.runtime.managedVersion.${channel}`;
  const pinned = stateGet(context, managedVersionKey, undefined);
  if (pinned) {
    const runtime = isManagedRuntimeValid(cachePrefix(storagePath, channel, pinned), pinned);
    if (runtime) return runtime;
  }

  const root = cacheRoot(storagePath, channel);
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (_error) {
    return undefined;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
  for (const version of candidates) {
    const runtime = isManagedRuntimeValid(cachePrefix(storagePath, channel, version), version);
    if (runtime) return runtime;
  }
  return undefined;
}

function validatePackageMetadata(metadata) {
  if (!metadata || typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("npm metadata did not include a package version.");
  }
  const integrity = metadata.dist?.integrity;
  const shasum = metadata.dist?.shasum;
  if (!(typeof integrity === "string" && integrity.startsWith("sha512-")) && !(typeof shasum === "string" && /^[a-f0-9]{40}$/i.test(shasum))) {
    throw new Error(`npm metadata for ${PACKAGE_NAME}@${metadata.version} did not include a valid integrity hash.`);
  }
  return metadata;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "Accept": "application/vnd.npm.install-v1+json, application/json",
        "User-Agent": "vaults-diagram-tools-vscode",
      },
    }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        fetchJson(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`npm registry responded with HTTP ${response.statusCode}`));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(15_000, () => request.destroy(new Error("npm registry request timed out")));
    request.on("error", reject);
  });
}

async function fetchPackageMetadata(channel = "latest") {
  return validatePackageMetadata(await fetchJson(`https://registry.npmjs.org/${PACKAGE_NAME}/${encodeURIComponent(channel)}`));
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const status = signal ? `signal ${signal}` : `exit ${code}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${status}\n${stderr || stdout}`));
    });
  });
}

async function installPackageWithNpm({ installPrefix, version }) {
  await fsp.mkdir(installPrefix, { recursive: true });
  await runProcess("npm", [
    "install",
    "--prefix",
    installPrefix,
    "--no-save",
    "--package-lock=false",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--omit=dev",
    `${PACKAGE_NAME}@${version}`,
  ], {
    env: {
      npm_config_ignore_scripts: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
}

function getConfiguration(vscodeApi) {
  const config = vscodeApi.workspace.getConfiguration("vaultsDiagramTools");
  return {
    mode: normalizeMode(config.get("runtime.mode", "hybrid")),
    channel: config.get("runtime.channel", "latest") || "latest",
  };
}

function createRuntimeManager(context, vscodeApi, options = {}) {
  const storagePath = storagePathFor(context, options);
  const fetcher = options.fetchPackageMetadata || fetchPackageMetadata;
  const installer = options.installPackage || installPackageWithNpm;
  const now = options.now || (() => Date.now());
  const bundled = () => resolveRuntimePaths(context.extensionPath, "bundled");

  async function updateManagedRuntime({ force = false, channel } = {}) {
    const configured = getConfiguration(vscodeApi);
    const selectedChannel = channel || configured.channel;
    const metadata = validatePackageMetadata(await fetcher(selectedChannel));
    const version = metadata.version;
    const finalPrefix = cachePrefix(storagePath, selectedChannel, version);
    const existing = isManagedRuntimeValid(finalPrefix, version);
    if (existing) {
      await stateUpdate(context, `vaultsDiagramTools.runtime.managedVersion.${selectedChannel}`, version);
      await stateUpdate(context, `vaultsDiagramTools.runtime.managedIntegrity.${selectedChannel}`, metadata.dist?.integrity || metadata.dist?.shasum);
      return existing;
    }

    const staging = `${finalPrefix}.staging-${process.pid}-${now()}`;
    await fsp.rm(staging, { recursive: true, force: true });
    await fsp.mkdir(path.dirname(finalPrefix), { recursive: true });
    try {
      await installer({ installPrefix: staging, version, metadata, packageName: PACKAGE_NAME, force });
      const runtime = isManagedRuntimeValid(staging, version);
      if (!runtime) {
        throw new Error(`installed ${PACKAGE_NAME}@${version} did not contain the expected runtime files.`);
      }
      await fsp.rm(finalPrefix, { recursive: true, force: true });
      await fsp.rename(staging, finalPrefix);
      await stateUpdate(context, `vaultsDiagramTools.runtime.managedVersion.${selectedChannel}`, version);
      await stateUpdate(context, `vaultsDiagramTools.runtime.managedIntegrity.${selectedChannel}`, metadata.dist?.integrity || metadata.dist?.shasum);
      return isManagedRuntimeValid(finalPrefix, version);
    } finally {
      await fsp.rm(staging, { recursive: true, force: true });
    }
  }

  async function maybeRefreshManagedRuntime(channel, force = false) {
    const lastCheckKey = `vaultsDiagramTools.runtime.lastCheck.${channel}`;
    const lastCheck = Number(stateGet(context, lastCheckKey, 0) || 0);
    if (!force && now() - lastCheck < CHECK_INTERVAL_MS) return undefined;
    await stateUpdate(context, lastCheckKey, now());
    return updateManagedRuntime({ force, channel });
  }

  async function resolveRuntime({ forceUpdate = false, allowUpdate = true } = {}) {
    const config = getConfiguration(vscodeApi);
    if (config.mode === "bundled") return bundled();

    if (allowUpdate || forceUpdate) {
      try {
        await maybeRefreshManagedRuntime(config.channel, forceUpdate);
      } catch (error) {
        if (config.mode === "managed") {
          const cached = await findManagedRuntime(context, storagePath, config.channel);
          if (cached) return cached;
          throw error;
        }
      }
    }

    const managed = await findManagedRuntime(context, storagePath, config.channel);
    if (managed) return managed;
    if (config.mode === "managed") {
      throw new Error(`Managed ${PACKAGE_NAME} runtime is unavailable. Run the update command or switch to bundled runtime.`);
    }
    return bundled();
  }

  async function useBundledRuntime() {
    await vscodeApi.workspace.getConfiguration("vaultsDiagramTools").update("runtime.mode", "bundled", true);
    return bundled();
  }

  async function status() {
    const config = getConfiguration(vscodeApi);
    const managed = await findManagedRuntime(context, storagePath, config.channel);
    const active = await resolveRuntime({ allowUpdate: false });
    return {
      mode: config.mode,
      channel: config.channel,
      storagePath,
      bundled: bundled(),
      managed,
      active,
    };
  }

  return {
    resolveRuntime,
    updateManagedRuntime,
    useBundledRuntime,
    status,
    storagePath,
  };
}

module.exports = {
  CHECK_INTERVAL_MS,
  PACKAGE_NAME,
  cachePrefix,
  createRuntimeManager,
  fetchPackageMetadata,
  installPackageWithNpm,
  isManagedRuntimeValid,
  pathsForPackageRoot,
  resolveRuntimePaths,
  validatePackageMetadata,
};

import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const blockedCommands = new Set(
  (process.env.MERMAID_OFFLINE_FORBIDDEN_COMMANDS || "npm,npx,curl,wget,mmdc,python3,magick,convert,sips")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

function offlineError(kind, detail = "") {
  return new Error(`OFFLINE_RUNTIME_BLOCKED ${kind}${detail ? `: ${detail}` : ""}`);
}

function block(kind) {
  return (...args) => {
    throw offlineError(kind, String(args[0] ?? ""));
  };
}

function commandName(command) {
  if (Array.isArray(command)) return commandName(command[0]);
  const text = String(command ?? "").trim();
  if (!text) return "";
  return path.basename(text.split(/\s+/)[0]);
}

function commandLineHasForbidden(command) {
  const text = String(command ?? "");
  for (const forbidden of blockedCommands) {
    const pattern = new RegExp(`(^|[\\s"';&|()])${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s"';&|()])`);
    if (pattern.test(text) || commandName(text) === forbidden) return forbidden;
  }
  return "";
}

function assertAllowedCommand(command) {
  if (isAllowedPythonChecker(command, [])) return;
  const name = commandName(command);
  const forbidden = blockedCommands.has(name) ? name : commandLineHasForbidden(command);
  if (forbidden) throw offlineError("child_process", String(command));
}

function isAllowedPythonChecker(command, args) {
  const checker = process.env.MERMAID_OFFLINE_ALLOWED_PYTHON_CHECKER;
  if (!checker) return false;
  if (commandName(command) !== "python3") return false;

  const firstArg = Array.isArray(args?.[0]) ? args[0][0] : args?.[0];
  if (!firstArg) return false;
  return path.resolve(String(firstArg)) === path.resolve(checker);
}

function patchMethod(object, name, replacement) {
  if (!object || typeof object[name] !== "function") return;
  try {
    object[name] = replacement;
  } catch {
    // Built-ins can be read-only in some runtimes; best effort plus sync below.
  }
}

function patchNetworkBuiltins() {
  const http = require("node:http");
  const https = require("node:https");
  const http2 = require("node:http2");
  const net = require("node:net");
  const tls = require("node:tls");
  const dns = require("node:dns");
  const dgram = require("node:dgram");

  patchMethod(http, "request", block("http.request"));
  patchMethod(http, "get", block("http.get"));
  patchMethod(https, "request", block("https.request"));
  patchMethod(https, "get", block("https.get"));
  patchMethod(http2, "connect", block("http2.connect"));
  patchMethod(net, "connect", block("net.connect"));
  patchMethod(net, "createConnection", block("net.createConnection"));
  patchMethod(net.Socket?.prototype, "connect", block("net.Socket.connect"));
  patchMethod(tls, "connect", block("tls.connect"));
  patchMethod(dgram, "createSocket", block("dgram.createSocket"));

  for (const name of [
    "lookup",
    "lookupService",
    "resolve",
    "resolve4",
    "resolve6",
    "resolveAny",
    "resolveCaa",
    "resolveCname",
    "resolveMx",
    "resolveNaptr",
    "resolveNs",
    "resolvePtr",
    "resolveSoa",
    "resolveSrv",
    "resolveTxt",
    "reverse",
  ]) {
    patchMethod(dns, name, block(`dns.${name}`));
    patchMethod(dns.promises, name, block(`dns.promises.${name}`));
  }
}

function patchChildProcess() {
  const childProcess = require("node:child_process");
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "fork"]) {
    const original = childProcess[name];
    patchMethod(childProcess, name, function guardedCommand(command, ...args) {
      if (isAllowedPythonChecker(command, args)) {
        return original.call(this, command, ...args);
      }
      assertAllowedCommand(command);
      return original.call(this, command, ...args);
    });
  }

  for (const name of ["exec", "execSync"]) {
    const original = childProcess[name];
    patchMethod(childProcess, name, function guardedShell(command, ...args) {
      assertAllowedCommand(command);
      return original.call(this, command, ...args);
    });
  }
}

globalThis.fetch = block("fetch");
globalThis.WebSocket = class OfflineRuntimeBlockedWebSocket {
  constructor(url) {
    throw offlineError("WebSocket", String(url ?? ""));
  }
};

patchNetworkBuiltins();
patchChildProcess();
syncBuiltinESMExports();

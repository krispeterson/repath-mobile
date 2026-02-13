#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function existsExecutable(candidate) {
  if (!candidate) return false;
  if (candidate.includes(path.sep) || candidate.startsWith(".")) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

function resolvePython() {
  const envPython = process.env.PYTHON;
  if (envPython && existsExecutable(envPython)) {
    return { cmd: envPython, prefixArgs: [] };
  }

  const localVenv = path.join(process.cwd(), ".venv", "bin", "python");
  if (existsExecutable(localVenv)) {
    return { cmd: localVenv, prefixArgs: [] };
  }

  if (existsExecutable("python3")) {
    return { cmd: "python3", prefixArgs: [] };
  }

  if (existsExecutable("python")) {
    return { cmd: "python", prefixArgs: [] };
  }

  const pyProbe = spawnSync("py", ["-3", "--version"], { stdio: "ignore" });
  if (pyProbe.status === 0) {
    return { cmd: "py", prefixArgs: ["-3"] };
  }

  return null;
}

function main() {
  const scriptAndArgs = process.argv.slice(2);
  if (!scriptAndArgs.length) {
    console.error("Usage: node scripts/run-python.js <script.py> [args...]");
    process.exit(1);
  }

  const resolved = resolvePython();
  if (!resolved) {
    console.error(
      "No Python 3 executable found. Install Python 3 or set PYTHON=/path/to/python."
    );
    process.exit(1);
  }

  const args = [...resolved.prefixArgs, ...scriptAndArgs];
  const child = spawnSync(resolved.cmd, args, { stdio: "inherit" });
  if (child.error) {
    console.error(child.error.message);
    process.exit(1);
  }
  process.exit(child.status == null ? 1 : child.status);
}

main();

#!/usr/bin/env node
// Runs a command with .env.local loaded, so signing credentials stay in a file
// git ignores rather than in package.json or your shell history.
//
//   node scripts/with-env.mjs electron-builder --mac
//
// Lines are KEY=value. Blank lines and # comments are skipped, surrounding
// quotes are dropped, and anything already set in the environment wins.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // No .env.local: the build falls back to ad-hoc signing and says so.
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: node scripts/with-env.mjs <command> [args…]");
  process.exit(1);
}

// npx resolves a bin from node_modules without needing a shell.
const child = spawn("npx", ["--no-install", cmd, ...args], { cwd: ROOT, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));

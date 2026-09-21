#!/usr/bin/env node
// `npx usage-pill` — starts the menu bar app with the Electron that npm
// installed next to this package. `--detach` returns to the shell at once.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let electron;
try {
  electron = require("electron"); // the binary's path when required from Node
} catch {
  console.error("Electron isn't installed next to usage-pill. Run: npm install -g usage-pill electron");
  process.exit(1);
}

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const detach = args.includes("--detach");
const child = spawn(electron, [appDir, ...args.filter((a) => a !== "--detach")], {
  stdio: detach ? "ignore" : "inherit",
  detached: detach,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
});
if (detach) {
  child.unref();
  console.log("Usage Pill is running in the menu bar.");
} else {
  child.on("exit", (code) => process.exit(code ?? 0));
}

#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  accountLabel,
  createHub,
  fileSettings,
  filePersist,
  forgetClaudeAccount,
  listClaudeAccounts,
  pillText,
  providers,
  trayTitle,
  updatedLabel,
  watchResets,
} from "../src/core/index.mjs";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

if (has("--help") || has("-h")) {
  console.log(`usage-pill-cli — your AI plan usage as one line

  usage-pill-cli                 print the pill  (claude … · ollama …)
  usage-pill-cli --json          the same as JSON
  usage-pill-cli --tray          the short menu bar form  (25% 44% 70%)
  usage-pill-cli --refresh       skip the cache
  usage-pill-cli --watch [sec]   reprint every N seconds (default 60) and send a
                                 notification when a used limit resets
  usage-pill-cli --provider id   only this provider (claude, ollama, chatgpt)
  usage-pill-cli --set ollama.apiKey=…   save a provider setting
  usage-pill-cli --enable id | --disable id
  usage-pill-cli --accounts      Claude accounts known on this machine
  usage-pill-cli --forget <uuid> drop a saved Claude account
  usage-pill-cli --config        print the settings file path

This command ships inside the usage-pill package. Run it once with
  npx -p usage-pill usage-pill-cli
or install it so it is on your PATH:
  npm install -g usage-pill

Claude needs no key: it reads the Claude Code login on this machine, and keeps
a copy of each account you sign Claude Code into so they all stay visible.
Settings live in ~/.config/usage-pill/settings.json (also used by the app).
Works as a Claude Code statusLine command: it ignores stdin and prints one line.`);
  process.exit(0);
}

const settings = fileSettings();
if (has("--config")) {
  console.log(settings.file);
  process.exit(0);
}

if (has("--accounts")) {
  const rows = await listClaudeAccounts();
  if (!rows.length) console.log("No Claude account: sign in to Claude Code (run `claude`).");
  for (const a of rows) {
    const state = a.current ? "signed in to Claude Code" : a.expired ? "copy expired — sign Claude Code into it once" : "saved copy";
    console.log(`${a.id.padEnd(16)} ${accountLabel(a).padEnd(20)} ${a.uuid}  (${state})`);
  }
  process.exit(0);
}
if (value("--forget")) {
  await forgetClaudeAccount(value("--forget"));
  console.log("Forgotten.");
  process.exit(0);
}

for (const spec of args.flatMap((a, i) => (a === "--set" ? [args[i + 1]] : []))) {
  const m = spec?.match(/^([\w:-]+)\.([\w-]+)=(.*)$/);
  if (!m) fail(`--set expects provider.key=value, got "${spec}"`);
  settings.set(m[1], { [m[2]]: coerce(m[3]) });
}
if (value("--enable")) settings.set(value("--enable"), { enabled: true });
if (value("--disable")) settings.set(value("--disable"), { enabled: false });

const only = value("--provider");
const list = only ? (await providers()).filter((p) => p.id === only || p.id.startsWith(`${only}:`)) : providers;
if (only && !list.length) fail(`Unknown provider "${only}". Known: ${(await providers()).map((p) => p.id).join(", ")}`);

const hub = createHub({ providers: list, settings, persist: filePersist() });

async function print() {
  const entries = await hub.getAll({ refresh: has("--refresh") });
  if (has("--json")) console.log(JSON.stringify(entries, null, 2));
  else if (has("--tray")) console.log(trayTitle(entries));
  else console.log(pillText(entries));
  return entries;
}

if (has("--watch")) {
  const every = Math.max(10, Number(value("--watch")) || 60) * 1000;
  const watcher = watchResets({ hub, notify });
  const tick = async () => {
    try {
      const entries = await print();
      watcher.update(entries);
      if (!has("--json")) console.log(`  ${entries.map((e) => updatedLabel(e.snapshot.fetchedAt)).filter(Boolean)[0] ?? ""}`);
    } catch (err) {
      console.error(err.message);
    }
  };
  await tick();
  setInterval(tick, every);
} else {
  await print();
}

function notify(title, message) {
  if (process.platform === "darwin") {
    const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    execFile("osascript", ["-e", `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`], () => {});
  } else {
    console.log(`${title}: ${message}`);
  }
}

function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

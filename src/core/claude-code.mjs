import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const settingsFile = () => path.join(os.homedir(), ".claude", "settings.json");

/** The model Claude Code is set to: `model` in ~/.claude/settings.json, a
 *  shorthand ("opus", "opus[1m]", "opusplan") or a full id. Null when Claude
 *  Code follows the account default. */
export function claudeModel() {
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), "utf-8")).model;
    if (typeof raw !== "string" || !raw.trim()) return null;
    const id = raw.trim();
    const longContext = /\[1m\]$/i.test(id);
    const base = id.replace(/\[1m\]$/i, "");
    const family = base.match(/opusplan|opus|sonnet|haiku|fable/i)?.[0].toLowerCase();
    const label = { opusplan: "Opus plan", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", fable: "Fable" }[family] || base;
    return { id, label, longContext, short: `${label}${longContext ? " 1M" : ""}` };
  } catch {
    return null;
  }
}

/** The models Claude Code offers: its own shorthands plus anything extra this
 *  login has been given, from ~/.claude.json. */
export function claudeModelOptions() {
  const list = [
    { value: null, label: "Account default", note: "Whatever your Claude account picks" },
    { value: "opus", label: "Opus" },
    { value: "opus[1m]", label: "Opus · 1M context" },
    { value: "sonnet", label: "Sonnet" },
    { value: "sonnet[1m]", label: "Sonnet · 1M context" },
    { value: "haiku", label: "Haiku" },
    { value: "opusplan", label: "Opus plan", note: "Opus while planning, Sonnet for the rest" },
  ];
  try {
    const extra = JSON.parse(readFileSync(path.join(os.homedir(), ".claude.json"), "utf-8")).additionalModelOptionsCache || [];
    for (const o of extra) {
      if (typeof o?.value !== "string" || list.some((x) => x.value === o.value)) continue;
      list.push({ value: o.value, label: o.label || o.value, note: o.description });
    }
  } catch {
    // No extra models for this login.
  }
  return list;
}

/** Writes `model` into ~/.claude/settings.json, leaving every other key alone.
 *  null clears it. Applies to Claude Code sessions started afterwards. */
export function setClaudeModel(value) {
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(settingsFile(), "utf-8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  if (value === null || value === "") delete settings.model;
  else settings.model = value;
  writeFileSync(settingsFile(), JSON.stringify(settings, null, 2) + "\n");
  return claudeModel();
}

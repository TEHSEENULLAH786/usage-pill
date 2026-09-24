import { readFileSync } from "node:fs";
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

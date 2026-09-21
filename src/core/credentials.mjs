import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * The Claude Code login on this machine. macOS keeps it in the Keychain
 * ("Claude Code-credentials"); Linux and Windows keep it in
 * ~/.claude/.credentials.json. The token never leaves the process that reads it.
 */
export async function readClaudeCredentials() {
  if (process.platform === "darwin") {
    const raw = await new Promise((resolve) => {
      execFile("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], (err, stdout) =>
        resolve(err ? null : String(stdout).trim()),
      );
    });
    const creds = parse(raw);
    if (creds) return creds;
  }
  try {
    return parse(await readFile(path.join(os.homedir(), ".claude", ".credentials.json"), "utf-8"));
  } catch {
    return null;
  }
}

function parse(raw) {
  if (!raw) return null;
  try {
    const oauth = JSON.parse(raw).claudeAiOauth;
    return oauth?.accessToken ? { token: oauth.accessToken, expiresAt: oauth.expiresAt ?? null } : null;
  } catch {
    return null;
  }
}

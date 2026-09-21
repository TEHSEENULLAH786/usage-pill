import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readClaudeCredentials } from "./credentials.mjs";

/**
 * More than one Claude account on one machine.
 *
 * Claude Code holds exactly one login at a time. Each time this runs we take a
 * copy of that login — the token into the Keychain, the name and email into
 * accounts.json — so an account stays visible after you sign Claude Code into
 * a different one. Nothing here signs anybody in: every token was made by
 * Claude Code itself.
 *
 * A copied token expires (Anthropic decides when). The account then reports
 * `expired` and the only cure is to sign Claude Code back into it once.
 */

const SERVICE = "usage-pill-claude";

function accountsFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "usage-pill", "accounts.json");
}

function readStore() {
  try {
    const data = JSON.parse(readFileSync(accountsFile(), "utf-8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeStore(data) {
  mkdirSync(path.dirname(accountsFile()), { recursive: true });
  writeFileSync(accountsFile(), JSON.stringify(data, null, 2) + "\n");
}

/** Who Claude Code is signed in as, from ~/.claude.json. */
export function currentClaudeAccount() {
  try {
    const a = JSON.parse(readFileSync(path.join(os.homedir(), ".claude.json"), "utf-8")).oauthAccount;
    if (!a?.accountUuid) return null;
    return {
      uuid: a.accountUuid,
      email: a.emailAddress ?? null,
      name: a.displayName ?? a.fullName ?? null,
      org: a.organizationName ?? null,
      plan: a.organizationType?.replace(/^claude_/, "") ?? null,
    };
  } catch {
    return null;
  }
}

const keychain = (args) =>
  new Promise((resolve) => {
    execFile("security", args, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });

const tokenOf = (uuid) => keychain(["find-generic-password", "-s", SERVICE, "-a", uuid, "-w"]);

async function saveToken(uuid, token) {
  // -U updates the item when it already exists.
  await keychain(["add-generic-password", "-s", SERVICE, "-a", uuid, "-w", token, "-U", "-T", ""]);
}

/**
 * Copies the login Claude Code holds right now, if it belongs to an account we
 * haven't stored or the stored token has changed. Returns the account.
 */
export async function rememberCurrentClaudeAccount() {
  const account = currentClaudeAccount();
  const creds = await readClaudeCredentials();
  if (!account || !creds) return null;
  const store = readStore();
  const known = store[account.uuid];
  if (!known || known.tokenTail !== creds.token.slice(-12) || known.email !== account.email) {
    await saveToken(account.uuid, creds.token);
    store[account.uuid] = {
      ...account,
      tokenTail: creds.token.slice(-12),
      expiresAt: creds.expiresAt ?? null,
      savedAt: Date.now(),
    };
    writeStore(store);
  }
  return account;
}

/**
 * Every account we can show, current one first. `current` is the one Claude
 * Code is signed in as: its token comes live from Claude Code, so it never
 * goes stale. The rest carry the copy taken when they were last current.
 */
export async function listClaudeAccounts() {
  await rememberCurrentClaudeAccount().catch(() => {});
  const store = readStore();
  const current = currentClaudeAccount();
  const live = current ? await readClaudeCredentials() : null;
  const rows = [];

  if (current) {
    rows.push({
      ...current,
      id: "claude",
      current: true,
      token: live?.token ?? null,
      expiresAt: live?.expiresAt ?? null,
      expired: !!(live?.expiresAt && live.expiresAt < Date.now()),
    });
  }
  for (const [uuid, saved] of Object.entries(store)) {
    if (current && uuid === current.uuid) continue;
    rows.push({
      uuid,
      email: saved.email ?? null,
      name: saved.name ?? null,
      org: saved.org ?? null,
      plan: saved.plan ?? null,
      id: `claude:${uuid.slice(0, 8)}`,
      current: false,
      token: null, // read on demand, so tokens aren't held in memory needlessly
      expiresAt: saved.expiresAt ?? null,
      expired: !!(saved.expiresAt && saved.expiresAt < Date.now()),
      savedAt: saved.savedAt ?? null,
    });
  }
  return rows;
}

/** The token for one account: live from Claude Code, else the saved copy. */
export async function claudeAccountToken(account) {
  if (account.current) return (await readClaudeCredentials())?.token ?? null;
  return tokenOf(account.uuid);
}

/** Drops a saved account: its Keychain item and its row in accounts.json. */
export async function forgetClaudeAccount(uuid) {
  const store = readStore();
  delete store[uuid];
  writeStore(store);
  await keychain(["delete-generic-password", "-s", SERVICE, "-a", uuid]);
  return true;
}

/** "tehseenwork786@gmail.com" -> "tehseenwork786", for a chip that must be short. */
export function accountLabel(account) {
  return account.email?.split("@")[0] ?? account.name ?? account.uuid.slice(0, 8);
}

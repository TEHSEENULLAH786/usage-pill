#!/usr/bin/env node
// Publishes the built installers to GitHub Releases.
//
// Run after `npm run dist`, from the repo root. Re-running for the same
// version updates that release rather than failing: assets with the same name
// are replaced. The admin console's Deploy page runs this as a task.
//
// The token comes from the git credential helper (the same login `git push`
// uses), or GITHUB_TOKEN if it is set. Nothing is written to disk.
//
// --dry-run checks everything and prints what it would publish, without
// touching GitHub.

import { execFile } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const run = (cmd, args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd: ROOT }, (err, stdout) => (err ? reject(err) : resolve(String(stdout).trim())));
    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** "TEHSEENULLAH786/usage-pill" from the origin remote. */
async function repoSlug() {
  const url = await run("git", ["remote", "get-url", "origin"]).catch(() => null);
  const m = url?.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!m) fail(`Can't tell which GitHub repo this is. "git remote get-url origin" gave: ${url ?? "nothing"}`);
  return m[1];
}

/** The login git already uses, so publishing needs no extra setup. */
async function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const out = await run("git", ["credential", "fill"], "protocol=https\nhost=github.com\n\n").catch(() => "");
  const found = out.match(/^password=(.+)$/m)?.[1];
  if (!found) {
    fail(
      "No GitHub login found.\n" +
        "Push once from a terminal so the credential is stored (git push), or set GITHUB_TOKEN\n" +
        "to a personal access token with repo access.",
    );
  }
  return found;
}

async function api(slug, method, pathname, auth, body) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: { Authorization: `token ${auth}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // A non-JSON body only matters when the status is bad, handled below.
  }
  return { ok: res.ok, status: res.status, data, text };
}

const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).version;
const tag = `v${version}`;

const installers = (() => {
  let names = [];
  try {
    names = readdirSync(DIST).filter((f) => f.endsWith(".dmg"));
  } catch {
    fail(`No ${path.relative(ROOT, DIST)} folder. Run "npm run dist" first.`);
  }
  const matching = names.filter((f) => f.includes(version));
  if (!matching.length) {
    fail(`No .dmg for ${version} in ${path.relative(ROOT, DIST)}.\nFound: ${names.join(", ") || "nothing"}\nRun "npm run dist" first.`);
  }
  return matching.sort();
})();

const slug = await repoSlug();
const auth = await token();

console.log(`${DRY_RUN ? "Would publish" : "Publishing"} ${tag} to ${slug}`);
for (const f of installers) console.log(`  ${f}  (${(statSync(path.join(DIST, f)).size / 1e6).toFixed(0)} MB)`);

// The tag has to exist on GitHub, which means the commits must be pushed.
const ahead = await run("git", ["rev-list", "--count", "@{upstream}..HEAD"]).catch(() => "0");
if (Number(ahead) > 0) fail(`${ahead} commit(s) are not pushed. Push first, or the release would point at code nobody else has.`);

if (DRY_RUN) {
  console.log(`\nGitHub login: found. Nothing published (--dry-run).`);
  process.exit(0);
}

const body = [
  `Usage Pill ${version} for macOS.`,
  "",
  "**Install**",
  "",
  "1. Download the `.dmg` for your Mac: `arm64` for Apple Silicon (M1 and later), `x64` for Intel.",
  "2. Open it and drag Usage Pill to Applications.",
  "3. The app isn't notarized yet, so the first time, right-click it and choose Open.",
  "4. Choose Always Allow when macOS asks about the Keychain. That's how it reads your Claude Code login.",
  "",
  "Claude works with no setup if you're signed in to Claude Code on that Mac. Ollama needs an API key in Settings.",
  "",
  "**Without downloading**",
  "",
  "```sh",
  "npx usage-pill        # the same app, through npm",
  "npx usage-pill-cli    # the numbers as one line in a terminal",
  "```",
  "",
  "Everything runs on your machine. Nothing is sent anywhere except to the services whose usage it shows.",
].join("\n");

// Reuse the release when this version has been published before, so a re-run
// replaces the installers instead of failing.
let release = (await api(slug, "GET", `/repos/${slug}/releases/tags/${tag}`, auth)).data;
if (release?.id) {
  console.log(`Release ${tag} already exists; updating it.`);
  const updated = await api(slug, "PATCH", `/repos/${slug}/releases/${release.id}`, auth, { name: `Usage Pill ${version}`, body });
  if (!updated.ok) fail(`Couldn't update the release: HTTP ${updated.status} ${updated.text.slice(0, 300)}`);
  release = updated.data;
} else {
  const created = await api(slug, "POST", `/repos/${slug}/releases`, auth, {
    tag_name: tag,
    target_commitish: "main",
    name: `Usage Pill ${version}`,
    body,
    draft: false,
    prerelease: false,
  });
  if (!created.ok) fail(`Couldn't create the release: HTTP ${created.status} ${created.text.slice(0, 300)}`);
  release = created.data;
}

for (const file of installers) {
  // GitHub turns spaces into dots in asset names; do it here so the name we
  // upload is the name that ends up on the release.
  const name = file.replaceAll(" ", ".");
  const existing = (release.assets ?? []).find((a) => a.name === name);
  if (existing) {
    console.log(`Replacing ${name}`);
    await api(slug, "DELETE", `/repos/${slug}/releases/assets/${existing.id}`, auth);
  }
  const bytes = readFileSync(path.join(DIST, file));
  process.stdout.write(`Uploading ${name} … `);
  const res = await fetch(`https://uploads.github.com/repos/${slug}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { Authorization: `token ${auth}`, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) },
    body: bytes,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) fail(`\nUpload failed: HTTP ${res.status} ${data?.message ?? ""}`);
  console.log(`done (${(data.size / 1e6).toFixed(0)} MB)`);
}

console.log(`\nPublished ${tag}`);
// The console watches for this line and links the task's result to it.
console.log(`Service URL: ${release.html_url}`);

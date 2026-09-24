import { accountLabel, claudeAccountToken, listClaudeAccounts } from "../claude-accounts.mjs";
import { claudeModel } from "../claude-code.mjs";
import { RateLimited } from "../hub.mjs";

/**
 * Claude plan usage: the session and weekly limits shown at
 * claude.ai → Settings → Usage, read with a Claude Code login on this machine.
 * Needs no configuration.
 *
 * One provider per account (see claude-accounts.mjs). The account Claude Code
 * is signed in as is always `claude`; copies of other accounts are
 * `claude:<short uuid>`. With a single account this is exactly one provider,
 * indistinguishable from the single-account version.
 */
export function claudeProvider(account, { alone }) {
  const current = account.current;
  return {
    id: account.id,
    label: alone ? "Claude" : `Claude · ${accountLabel(account)}`,
    // The pill has no room for an email on every chip; with one account it
    // stays the bare "claude" it has always been.
    short: alone ? "claude" : `claude:${accountLabel(account)}`,
    homepage: "https://claude.ai/settings/usage",
    ttlMs: 3 * 60_000,
    account: { uuid: account.uuid, email: account.email, name: account.name, current, expired: account.expired },
    settings: [],
    // The model Claude Code runs is reported here (the badge) but not set from
    // here: it is a machine-wide setting, and Claude Code itself owns it.
    options: [],

    async fetch() {
      const token = await claudeAccountToken(account);
      if (!token) {
        return unavailable(
          current
            ? "Sign in to Claude Code on this machine (run `claude`) to see usage."
            : `The saved login for ${accountLabel(account)} is gone. Sign Claude Code into it once to restore it.`,
        );
      }
      if (account.expired) {
        return unavailable(
          current
            ? "The Claude Code login has expired. Open Claude Code once to refresh it."
            : `The copied login for ${accountLabel(account)} has expired. Sign Claude Code into it once to refresh it.`,
        );
      }
      const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
        headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
      });
      if (res.status === 401 || res.status === 403) {
        return unavailable(
          current
            ? "Anthropic rejected the Claude Code login. Open Claude Code once to refresh it."
            : `Anthropic rejected the copied login for ${accountLabel(account)}. Sign Claude Code into it once to refresh it.`,
        );
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        throw new RateLimited("Anthropic is rate-limiting usage checks", Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5 * 60_000);
      }
      if (!res.ok) throw new Error(`Usage request failed (HTTP ${res.status}).`);
      const data = await res.json();
      const limits = data.limits || [];
      const weekly = limits.filter((l) => l.group === "weekly");
      const headlineWeekly = weekly.find((l) => l.kind === "weekly_all") ?? weekly[0];

      return {
        available: true,
        fetchedAt: Date.now(),
        badge: current ? claudeModel()?.short ?? null : null,
        account: account.email ?? null,
        meters: limits.map((l) => {
          const session = l.kind === "session";
          const model = l.scope?.model?.display_name ?? null;
          const percent = Number(l.percent) || 0;
          return {
            id: session ? "session" : `${l.kind}:${model ?? "all"}`,
            label: session ? "Current session" : model || (l.kind === "weekly_all" ? "All models" : l.kind),
            short: session ? "session" : model ? model.toLowerCase() : "week",
            percent,
            severity: l.severity ?? null,
            resetsAt: l.resets_at ?? null,
            headline: session || l === headlineWeekly,
            // A per-model weekly limit that's actually been used (Fable, Opus)
            // rides along in the menu bar, where there's room for it.
            tray: !session && l !== headlineWeekly && !!model && percent > 0,
            group: session ? null : "Weekly limits",
          };
        }),
        notes: current ? [] : ["Copied login: the numbers stop updating when it expires."],
      };
    },
  };
}

/** One provider per Claude account known to this machine. */
export async function claudeProviders() {
  const accounts = await listClaudeAccounts();
  if (!accounts.length) return [claudeProvider({ id: "claude", uuid: "none", current: true, email: null, name: null, expired: false }, { alone: true })];
  return accounts.map((a) => claudeProvider(a, { alone: accounts.length === 1 }));
}

const unavailable = (reason) => ({ available: false, reason });

import { readClaudeCredentials } from "../credentials.mjs";
import { claudeModel, claudeModelOptions, setClaudeModel } from "../claude-code.mjs";
import { RateLimited } from "../hub.mjs";

/**
 * Claude plan usage: the session and weekly limits shown at
 * claude.ai → Settings → Usage, read with this machine's Claude Code login.
 * Needs no configuration.
 */
export const claude = {
  id: "claude",
  label: "Claude",
  homepage: "https://claude.ai/settings/usage",
  ttlMs: 3 * 60_000,
  settings: [],
  options: [
    {
      key: "model",
      label: "Claude Code model",
      help: "Applies to Claude Code sessions started after the change.",
      values: () => claudeModelOptions(),
      current: () => claudeModel()?.id ?? null,
      set: (value) => setClaudeModel(value),
    },
  ],

  async fetch() {
    const creds = await readClaudeCredentials();
    if (!creds) return unavailable("Sign in to Claude Code on this machine (run `claude`) to see usage.");
    if (creds.expiresAt && creds.expiresAt < Date.now()) {
      return unavailable("The Claude Code login has expired. Open Claude Code once to refresh it.");
    }
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: `Bearer ${creds.token}`, "anthropic-beta": "oauth-2025-04-20" },
    });
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
      badge: claudeModel()?.short ?? null,
      meters: limits.map((l) => {
        const session = l.kind === "session";
        return {
          id: session ? "session" : `${l.group}:${l.kind}:${l.scope?.model?.id ?? ""}`,
          label: session ? "Current session" : l.scope?.model?.display_name || (l.kind === "weekly_all" ? "All models" : l.kind),
          short: session ? "session" : "week",
          percent: Number(l.percent) || 0,
          severity: l.severity ?? null,
          resetsAt: l.resets_at ?? null,
          headline: session || l === headlineWeekly,
          group: session ? null : "Weekly limits",
        };
      }),
      notes: [],
    };
  },
};

const unavailable = (reason) => ({ available: false, reason });

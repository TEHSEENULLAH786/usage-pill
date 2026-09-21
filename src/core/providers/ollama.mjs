/**
 * Ollama Cloud usage: the monthly included usage and requests per model, as on
 * ollama.com → Settings → Usage. Needs an API key from ollama.com → Settings →
 * Keys (setting `apiKey`, or the OLLAMA_API_KEY environment variable).
 *
 * The API is thinner than that page. `/api/usage` returns one number — the
 * share of the monthly included usage, rounded to two decimals — plus the
 * request count per model. It gives neither the dollars nor the reset date
 * the page shows, and no other endpoint on ollama.com serves them to an API
 * key. So both are worked out here:
 *
 *  - Dollars: the share times the plan's included usage (Pro includes $60,
 *    observed). Rounded from a rounded percentage, so it can sit a few cents
 *    from the page. Set `allowance` for a plan we don't know.
 *  - Reset day: the day of the month the account was created, which is when
 *    the billing month turns. Set `resetDay` to override it.
 */

// Monthly included usage by plan name, in USD, as shown on ollama.com.
const PLAN_ALLOWANCE = { pro: 60 };

export const ollama = {
  id: "ollama",
  label: "Ollama",
  homepage: "https://ollama.com/settings",
  ttlMs: 5 * 60_000,
  // Off until there is a key to use: most people don't have an Ollama Cloud
  // account, and an unconfigured chip is just noise. Anyone who has entered a
  // key keeps it on without having to tick anything.
  enabledByDefault: (settings) => !!(settings.apiKey || process.env.OLLAMA_API_KEY),
  settings: [
    { key: "apiKey", label: "API key", type: "password", placeholder: "OLLAMA_API_KEY", help: "From ollama.com → Settings → Keys. Stays on this machine." },
    {
      key: "allowance",
      label: "Monthly included usage (USD)",
      type: "number",
      min: 1,
      placeholder: "60 on Pro",
      help: "Only needed if your plan includes a different amount. Leave empty and the chip shows a percentage instead of dollars.",
    },
    {
      key: "resetDay",
      label: "Usage resets on day",
      type: "number",
      min: 1,
      max: 28,
      placeholder: "your signup day",
      help: "Only needed if the countdown looks wrong. Ollama's API doesn't report the reset date, so it's taken from the day of the month you signed up.",
    },
  ],

  async fetch({ settings }) {
    const key = (settings.apiKey || process.env.OLLAMA_API_KEY || "").trim();
    if (!key) return { available: false, reason: "Add an Ollama API key in Settings (or set OLLAMA_API_KEY)." };
    const headers = { Authorization: `Bearer ${key}` };
    const [usageRes, meRes] = await Promise.all([
      fetch("https://ollama.com/api/usage", { headers }),
      fetch("https://ollama.com/api/me", { method: "POST", headers }).catch(() => null),
    ]);
    if (!usageRes.ok) return { available: false, reason: `ollama.com returned HTTP ${usageRes.status} for the API key.` };
    const usage = await usageRes.json();
    const me = meRes?.ok ? await meRes.json().catch(() => null) : null;
    const monthly = usage?.limits?.monthly || {};

    const plan = (me?.Plan ?? me?.plan ?? null)?.toLowerCase?.() ?? null;
    const share = Number(monthly.usage) || 0; // 0..1, two decimals
    const percent = Math.round(share * 1000) / 10;
    const allowance = Number(settings.allowance) || PLAN_ALLOWANCE[plan] || 0;
    const spend = allowance > 0 ? Math.round(share * allowance * 100) / 100 : null;
    const reset = nextReset(settings.resetDay, me);

    const notes = [];
    if (spend != null) notes.push("Dollars are worked out from the percentage Ollama's API returns, so they can differ by a few cents from ollama.com.");
    notes.push(
      reset.source === "setting"
        ? `Counting down to day ${reset.day} of the month, as set in Settings.`
        : reset.source === "signup"
          ? `Ollama's API doesn't report the reset date, so this counts down to day ${reset.day}, the day of the month you signed up.`
          : "Ollama's API doesn't report the reset date, so this counts down to the 1st. Set the day in Settings if that's wrong.",
    );
    notes.push("The exact figures are on ollama.com/settings.");

    return {
      available: true,
      fetchedAt: Date.now(),
      badge: plan ?? null,
      account: me ? [me.Name ?? me.name, me.Email ?? me.email].filter(Boolean).join(" · ") || null : null,
      meters: [
        {
          id: "month",
          label: "Monthly usage",
          short: "month",
          percent,
          // Dollars when we know the allowance, the percentage when we don't.
          display: spend != null ? money(spend) : null,
          total: allowance > 0 ? money(allowance, { whole: true }) : null,
          resetsAt: reset.at,
          headline: true,
        },
      ],
      rows: (monthly.models || [])
        .map((m) => ({ name: m.name, requests: Number(m.request_count) || 0 }))
        .sort((a, b) => b.requests - a.requests)
        .map((m) => ({ label: m.name, value: `${m.requests.toLocaleString()} request${m.requests === 1 ? "" : "s"}` })),
      rowsTitle: "Models used this month",
      rowsEmpty: "No cloud requests this month.",
      notes,
    };
  },
};

/** When the included usage next turns over: the saved day if there is one,
 *  else the day of the month the account was created, else the 1st. */
function nextReset(savedDay, me) {
  const saved = Number(savedDay);
  let day = 1;
  let source = "default";
  if (Number.isInteger(saved) && saved >= 1 && saved <= 28) {
    day = saved;
    source = "setting";
  } else {
    const created = me?.CreatedAt ?? me?.createdAt ?? null;
    const d = created ? new Date(created).getUTCDate() : NaN;
    if (Number.isInteger(d) && d >= 1 && d <= 28) {
      day = d;
      source = "signup";
    }
  }
  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), day);
  if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return { day, source, at: next.toISOString() };
}

/** "$4.20"; with `whole`, a round figure loses its cents: "$60". */
function money(n, { whole = false } = {}) {
  const v = Number(n) || 0;
  return `$${whole && Number.isInteger(v) ? v : v.toFixed(2)}`;
}

/**
 * Ollama Cloud usage: the monthly included usage and requests per model, as on
 * ollama.com → Settings → Usage. Needs an API key from ollama.com → Settings →
 * Keys (setting `apiKey`, or the OLLAMA_API_KEY environment variable).
 */
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
    { key: "resetDay", label: "Usage resets on day", type: "number", min: 1, max: 28, placeholder: "1", help: "ollama.com doesn't report the reset date; check it on ollama.com/settings." },
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
    const percent = Math.round((Number(monthly.usage) || 0) * 1000) / 10;
    const models = (monthly.models || [])
      .map((m) => ({ name: m.name, requests: Number(m.request_count) || 0 }))
      .sort((a, b) => b.requests - a.requests);
    return {
      available: true,
      fetchedAt: Date.now(),
      badge: me?.Plan ?? me?.plan ?? null,
      account: me ? [me.Name ?? me.name, me.Email ?? me.email].filter(Boolean).join(" · ") || null : null,
      meters: [{ id: "month", label: "Monthly usage", short: "month", percent, resetsAt: nextReset(settings.resetDay), headline: true }],
      rows: models.map((m) => ({ label: m.name, value: `${m.requests.toLocaleString()} request${m.requests === 1 ? "" : "s"}` })),
      rowsTitle: "Models used this month",
      rowsEmpty: "No cloud requests this month.",
      notes: ["Dollar amounts and the exact reset date are on ollama.com/settings."],
    };
  },
};

function nextReset(resetDay) {
  const saved = Number(resetDay);
  const day = Number.isInteger(saved) && saved >= 1 && saved <= 28 ? saved : 1;
  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), day);
  if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return next.toISOString();
}

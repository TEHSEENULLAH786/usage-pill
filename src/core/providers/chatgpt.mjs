/**
 * OpenAI spend this month, against a budget you set.
 *
 * Read this before expecting it to mirror the Claude chip: OpenAI publishes no
 * endpoint for a ChatGPT *plan* (Plus, Pro, Team message allowances). Nothing
 * can show those without scraping a logged-in browser session, which this app
 * does not do. What OpenAI does publish is organization spend on the API, so
 * that is what this reports: dollars used this calendar month, shown against
 * the monthly budget you enter.
 *
 * Needs an admin key (platform.openai.com → Settings → API keys → admin key,
 * `sk-admin-…`). A normal `sk-proj-…` key cannot read the costs endpoint.
 */
export const chatgpt = {
  id: "chatgpt",
  label: "OpenAI",
  homepage: "https://platform.openai.com/usage",
  ttlMs: 10 * 60_000, // spend moves slowly and the endpoint is rate-limited
  enabledByDefault: (settings) => !!(settings.adminKey || process.env.OPENAI_ADMIN_KEY),
  settings: [
    {
      key: "adminKey",
      label: "Admin key",
      type: "password",
      placeholder: "sk-admin-…",
      help: "platform.openai.com → Settings → API keys → admin key. A project key (sk-proj-…) will not work. Stays on this machine.",
    },
    {
      key: "budget",
      label: "Monthly budget (USD)",
      type: "number",
      min: 1,
      placeholder: "50",
      help: "What the bar is measured against. Leave empty to show the dollar amount only.",
    },
  ],

  async fetch({ settings }) {
    const key = (settings.adminKey || process.env.OPENAI_ADMIN_KEY || "").trim();
    if (!key) return { available: false, reason: "Add an OpenAI admin key in Settings (platform.openai.com → Settings → API keys)." };

    const now = new Date();
    const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
    const url = `https://api.openai.com/v1/organization/costs?start_time=${monthStart}&bucket_width=1d&limit=31`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) return { available: false, reason: "OpenAI rejected the key. It must be an admin key (sk-admin-…), not a project key." };
    if (!res.ok) return { available: false, reason: `OpenAI returned HTTP ${res.status} for the costs endpoint.` };
    const data = await res.json();

    // buckets -> results -> { amount: { value, currency }, line_item }
    const buckets = data?.data ?? [];
    let total = 0;
    const byLine = new Map();
    for (const bucket of buckets) {
      for (const r of bucket.results ?? []) {
        const value = Number(r?.amount?.value) || 0;
        total += value;
        const name = r.line_item ?? r.project_id ?? "Usage";
        byLine.set(name, (byLine.get(name) ?? 0) + value);
      }
    }

    const budget = Number(settings.budget) || 0;
    const spend = Math.round(total * 100) / 100;
    const percent = budget > 0 ? Math.round((spend / budget) * 1000) / 10 : 0;

    return {
      available: true,
      fetchedAt: Date.now(),
      badge: null,
      meters: [
        {
          id: "month",
          label: "Spend this month",
          short: "month",
          percent,
          // With no budget there is no percentage to honestly show, so the
          // chip carries the dollars instead and the bar stays empty.
          display: budget > 0 ? null : money(spend),
          resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
          headline: true,
        },
      ],
      rows: [...byLine.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value: money(value) })),
      rowsTitle: "By line item",
      rowsEmpty: "No API spend this month.",
      notes: [
        budget > 0 ? `${money(spend)} of ${money(budget)} budget.` : "Set a monthly budget in Settings to see this as a percentage.",
        "API spend only. OpenAI publishes no endpoint for ChatGPT plan usage.",
      ],
    };
  },
};

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

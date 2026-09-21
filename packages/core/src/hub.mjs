/** Thrown by a provider when the service asks it to slow down. */
export class RateLimited extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = "RateLimited";
    this.retryAfterMs = retryAfterMs;
  }
}

const MAX_BACKOFF = 30 * 60_000;

/**
 * One place that asks every enabled provider for its numbers, with a per-
 * provider cache, rate-limit back-off and "last good values while stale".
 *
 * `settings` is a store like the one from `fileSettings()`: `get(providerId)`
 * returns that provider's saved values (`enabled` among them).
 * `persist` (optional) is `{ load(), save(state) }` so a short-lived process
 * such as the CLI keeps the cache between runs.
 */
export function createHub({ providers, settings, persist = null, now = Date.now }) {
  const state = new Map(); // id -> { cache: {at, body} | null, lastGood, retryAt }
  for (const [id, saved] of Object.entries(persist?.load?.() ?? {})) state.set(id, saved);

  const byId = (id) => providers.find((p) => p.id === id) ?? (() => { throw new Error(`Unknown provider "${id}"`); })();
  const st = (id) => state.get(id) ?? state.set(id, { cache: null, lastGood: null, retryAt: 0 }).get(id);
  const enabled = () => providers.filter((p) => settings.get(p.id)?.enabled !== false);
  const save = () => persist?.save?.(Object.fromEntries(state));

  const meta = (p) => ({
    id: p.id,
    label: p.label,
    homepage: p.homepage ?? null,
    enabled: settings.get(p.id)?.enabled !== false,
    settings: p.settings ?? [],
    options: (p.options ?? []).map((o) => ({ key: o.key, label: o.label, help: o.help ?? null })),
  });

  async function get(id, { refresh = false } = {}) {
    const p = byId(id);
    const s = st(id);
    if (!refresh && s.cache && now() - s.cache.at < (p.ttlMs ?? 3 * 60_000)) return s.cache.body;
    if (now() < s.retryAt) return failure(s, `${p.label} is rate-limiting usage checks; trying again in ${minutes(s.retryAt - now())} min.`);
    let body;
    try {
      body = await p.fetch({ settings: settings.get(id) ?? {}, previous: s.lastGood });
    } catch (err) {
      const wait = Math.min(err instanceof RateLimited ? err.retryAfterMs : 60_000, MAX_BACKOFF);
      s.retryAt = now() + wait;
      save();
      return failure(s, err instanceof RateLimited ? `${err.message}; trying again in ${minutes(wait)} min.` : err?.message || String(err));
    }
    body = { ...body, fetchedAt: body.fetchedAt ?? now() };
    s.cache = { at: now(), body };
    if (body.available) s.lastGood = body;
    s.retryAt = 0;
    save();
    return body;
  }

  /** Every enabled provider, in configured order: `[{ provider, snapshot }]`. */
  async function getAll(opts) {
    return Promise.all(enabled().map(async (p) => ({ provider: meta(p), snapshot: await get(p.id, opts) })));
  }

  async function option(id, key) {
    const o = findOption(byId(id), key);
    return { key: o.key, label: o.label, help: o.help ?? null, values: await o.values(), current: await o.current() };
  }

  async function setOption(id, key, value) {
    const result = await findOption(byId(id), key).set(value);
    st(id).cache = null; // the badge may have changed
    return result;
  }

  return { providers: () => providers.map(meta), enabled: () => enabled().map(meta), get, getAll, option, setOption };
}

const findOption = (p, key) => (p.options ?? []).find((o) => o.key === key) ?? (() => { throw new Error(`Unknown option "${key}"`); })();
const minutes = (ms) => Math.max(1, Math.ceil(ms / 60_000));
const failure = (s, reason) => (s.lastGood ? { ...s.lastGood, stale: true, staleReason: reason } : { available: false, reason });

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
 * `providers` is either a fixed array or a function returning one (possibly a
 * promise), for providers that come and go — a Claude account per login, say.
 * The list is resolved on every `getAll` and remembered so the synchronous
 * `providers()` can answer a menu without waiting.
 *
 * `settings` is a store like the one from `fileSettings()`: `get(providerId)`
 * returns that provider's saved values (`enabled` among them).
 * `persist` (optional) is `{ load(), save(state) }` so a short-lived process
 * such as the CLI keeps the cache between runs.
 */
export function createHub({ providers, settings, persist = null, now = Date.now }) {
  const state = new Map(); // id -> { cache: {at, body} | null, lastGood, retryAt }
  for (const [id, saved] of Object.entries(persist?.load?.() ?? {})) state.set(id, saved);

  let resolved = Array.isArray(providers) ? providers : [];

  async function list() {
    if (!Array.isArray(providers)) resolved = (await providers()) ?? [];
    return resolved;
  }

  const byId = (id) => resolved.find((p) => p.id === id) ?? (() => { throw new Error(`Unknown provider "${id}"`); })();
  const st = (id) => state.get(id) ?? state.set(id, { cache: null, lastGood: null, retryAt: 0 }).get(id);
  const save = () => persist?.save?.(Object.fromEntries(state));

  /** A provider is on unless turned off; a provider that needs configuring
   *  (an API key) stays off until it has it. */
  function isEnabled(p) {
    const saved = settings.get(p.id) ?? {};
    if (typeof saved.enabled === "boolean") return saved.enabled;
    const fallback = p.enabledByDefault;
    if (typeof fallback === "function") return !!fallback(saved);
    return fallback !== false;
  }

  const meta = (p) => ({
    id: p.id,
    label: p.label,
    short: p.short ?? p.id,
    homepage: p.homepage ?? null,
    enabled: isEnabled(p),
    account: p.account ?? null,
    settings: p.settings ?? [],
    options: (p.options ?? []).map((o) => ({ key: o.key, label: o.label, help: o.help ?? null })),
  });

  async function get(id, { refresh = false } = {}) {
    if (!resolved.length) await list();
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
    const all = await list();
    return Promise.all(all.filter(isEnabled).map(async (p) => ({ provider: meta(p), snapshot: await get(p.id, opts) })));
  }

  async function option(id, key) {
    if (!resolved.length) await list();
    const o = findOption(byId(id), key);
    return { key: o.key, label: o.label, help: o.help ?? null, values: await o.values(), current: await o.current() };
  }

  async function setOption(id, key, value) {
    const result = await findOption(byId(id), key).set(value);
    st(id).cache = null; // the badge may have changed
    return result;
  }

  /** Forgets every cached snapshot, so the next read goes to the services. */
  function invalidate() {
    for (const s of state.values()) {
      s.cache = null;
      s.retryAt = 0;
    }
    save();
  }

  return {
    providers: () => resolved.map(meta),
    reload: async () => (await list()).map(meta),
    enabled: () => resolved.filter(isEnabled).map(meta),
    get,
    getAll,
    option,
    setOption,
    invalidate,
  };
}

const findOption = (p, key) => (p.options ?? []).find((o) => o.key === key) ?? (() => { throw new Error(`Unknown option "${key}"`); })();
const minutes = (ms) => Math.max(1, Math.ceil(ms / 60_000));
const failure = (s, reason) => (s.lastGood ? { ...s.lastGood, stale: true, staleReason: reason } : { available: false, reason });

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHub, RateLimited, pillText, trayTitle, shortReset } from "../src/index.mjs";

const memSettings = (data = {}) => ({ get: (id) => data[id] ?? {}, set: (id, patch) => (data[id] = { ...(data[id] ?? {}), ...patch }) });

const fake = (fetch, extra = {}) => ({ id: "fake", label: "Fake", ttlMs: 1000, fetch, ...extra });

test("caches within ttl and refreshes on demand", async () => {
  let calls = 0;
  let t = 0;
  const hub = createHub({
    providers: [fake(async () => ({ available: true, meters: [{ id: "a", label: "A", short: "a", percent: ++calls, headline: true }] }))],
    settings: memSettings(),
    now: () => t,
  });
  assert.equal((await hub.get("fake")).meters[0].percent, 1);
  assert.equal((await hub.get("fake")).meters[0].percent, 1);
  t = 2000;
  assert.equal((await hub.get("fake")).meters[0].percent, 2);
  assert.equal((await hub.get("fake", { refresh: true })).meters[0].percent, 3);
});

test("rate limit keeps last good values and backs off", async () => {
  let t = 0;
  let fail = false;
  const hub = createHub({
    providers: [
      fake(async () => {
        if (fail) throw new RateLimited("slow down", 5 * 60_000);
        return { available: true, meters: [{ id: "a", label: "A", short: "a", percent: 40, headline: true }] };
      }),
    ],
    settings: memSettings(),
    now: () => t,
  });
  await hub.get("fake");
  fail = true;
  const stale = await hub.get("fake", { refresh: true });
  assert.equal(stale.stale, true);
  assert.equal(stale.meters[0].percent, 40);
  assert.match(stale.staleReason, /5 min/);
  fail = false;
  t = 60_000;
  assert.equal((await hub.get("fake", { refresh: true })).stale, true, "still backing off");
  t = 6 * 60_000;
  assert.equal((await hub.get("fake", { refresh: true })).stale, undefined);
});

test("disabled providers are left out of getAll", async () => {
  const hub = createHub({
    providers: [fake(async () => ({ available: true, meters: [] })), fake(async () => ({ available: true, meters: [] }), { id: "other", label: "Other" })],
    settings: memSettings({ other: { enabled: false } }),
  });
  assert.deepEqual((await hub.getAll()).map((e) => e.provider.id), ["fake"]);
});

test("pill and tray text", () => {
  const now = Date.parse("2026-09-21T10:00:00Z");
  const entries = [
    {
      provider: { id: "claude", label: "Claude" },
      snapshot: {
        available: true,
        badge: "Fable 1M",
        meters: [
          { id: "session", label: "Current session", short: "session", percent: 25, headline: true, resetsAt: "2026-09-21T13:18:30Z" },
          { id: "w", label: "All models", short: "week", percent: 39, headline: true },
          { id: "x", label: "Opus", short: "week", percent: 5 },
        ],
      },
    },
    { provider: { id: "ollama", label: "Ollama" }, snapshot: { available: true, meters: [{ id: "m", label: "Monthly usage", short: "month", percent: 6.2, headline: true, resetsAt: "2026-10-01T00:00:00Z" }] } },
    { provider: { id: "gpt", label: "ChatGPT" }, snapshot: { available: false, reason: "no key" } },
  ];
  assert.equal(pillText(entries, now), "claude  Fable 1M  session 25%  week 39%  ↻ 3h 18m  ·  ollama  month 6.2%  ↻ 10d  ·  gpt  unavailable");
  assert.equal(trayTitle(entries), "25% 39% · 6.2% · –");
  assert.equal(shortReset("2026-09-21T10:42:00Z", now), "42m");
});

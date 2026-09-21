/**
 * Announces when a headline limit that had been used resets to 0%. Call
 * `update(entries)` after each fetch; timers are re-armed from the latest
 * reset times. `notify(title, message)` is yours: Electron's Notification,
 * osascript, a Slack hook.
 */
export function watchResets({ hub, notify, now = Date.now }) {
  const timers = new Map(); // `${provider}:${meter}` -> timeout
  const announced = new Set(); // `${provider}:${meter}@${resetsAt}`

  function update(entries) {
    for (const { provider, snapshot } of entries) {
      for (const meter of snapshot.meters ?? []) {
        if (!meter.headline || !meter.resetsAt) continue;
        const id = `${provider.id}:${meter.id}`;
        const key = `${id}@${meter.resetsAt}`;
        const due = Date.parse(meter.resetsAt) - now();
        clearTimeout(timers.get(id));
        timers.delete(id);
        if (meter.percent <= 0 || announced.has(key) || due < -60_000 || due > 8 * 24 * 3600_000) continue;
        timers.set(
          id,
          setTimeout(() => {
            announced.add(key);
            timers.delete(id);
            notify(`${provider.label} ${meter.label.toLowerCase()} reset`, `${meter.label} is back to 0% (was ${meter.percent}%).`);
            hub.get(provider.id, { refresh: true }).catch(() => {});
          }, Math.max(0, due) + 15_000),
        );
      }
    }
  }

  function stop() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  }

  return { update, stop };
}

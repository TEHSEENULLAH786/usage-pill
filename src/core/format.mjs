const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** "3h 18m" within a day, "42m" within an hour, else "9d". */
export function shortReset(iso, now = Date.now()) {
  if (!iso) return "";
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "now";
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / 60_000);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  return `${Math.ceil(ms / DAY)}d`;
}

/** "Resets in 4 hr 2 min" within a day, otherwise "Resets Fri 4:00 AM" or "Resets Oct 1". */
export function resetLabel(iso, now = Date.now()) {
  if (!iso) return "";
  const at = new Date(iso);
  const ms = at.getTime() - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Resetting now";
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / 60_000);
    return `Resets in ${h ? `${h} hr ` : ""}${m} min`;
  }
  if (ms < 7 * DAY) {
    return `Resets ${at.toLocaleDateString(undefined, { weekday: "short" })} ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return `Resets ${at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function formatPercent(n) {
  const v = Number(n) || 0;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

/** What a meter reads as: its own `display` when it has one, else the percentage. */
export function meterText(meter) {
  return meter?.display ?? formatPercent(meter?.percent);
}

/** "ok" | "warn" | "danger", from the percentage and the provider's own severity. */
export function level(meter) {
  if (meter.percent >= 90 || meter.severity === "critical") return "danger";
  if (meter.percent >= 70 || meter.severity === "warning") return "warn";
  return "ok";
}

/** The meters a provider wants in one line (at most two). */
export function headline(snapshot) {
  const meters = snapshot?.meters ?? [];
  const picked = meters.filter((m) => m.headline);
  return (picked.length ? picked : meters).slice(0, 2);
}

/** Headline meters plus any the provider flagged for the menu bar, where a
 *  per-model limit like Fable has room to appear. */
export function trayMeters(snapshot) {
  const top = headline(snapshot);
  const extra = (snapshot?.meters ?? []).filter((m) => m.tray && !top.includes(m));
  return [...top, ...extra];
}

/** "Just now" / "3 min ago" for a fetchedAt. */
export function updatedLabel(fetchedAt, now = Date.now()) {
  if (!fetchedAt) return "";
  const min = Math.floor((now - fetchedAt) / 60_000);
  return min < 1 ? "Last updated: just now" : `Last updated: ${min} min ago`;
}

/** One provider as a line of text: "claude Fable 1M  session 25%  week 39%  ↻ 3h 18m". */
export function pillLine({ provider, snapshot }, now = Date.now()) {
  const parts = [provider.short ?? provider.id];
  if (snapshot.badge) parts.push(snapshot.badge);
  if (!snapshot.available) return `${parts.join("  ")}  unavailable`;
  const meters = headline(snapshot);
  for (const m of meters) parts.push(`${m.short} ${meterText(m)}`);
  const reset = meters.find((m) => m.resetsAt)?.resetsAt;
  if (reset) parts.push(`↻ ${shortReset(reset, now)}`);
  return parts.join("  ");
}

/** Every provider on one line, separated by " · ". */
export function pillText(entries, now = Date.now()) {
  return entries.map((e) => pillLine(e, now)).join("  ·  ");
}

/** Short enough for a menu bar: "25% 39% 70% · 6.2%". Per-model limits that
 *  have been used (Fable, Opus) are included; unavailable providers show "–". */
export function trayTitle(entries) {
  return entries
    .map(({ snapshot }) => (snapshot.available ? trayMeters(snapshot).map(meterText).join(" ") : "–"))
    .join(" · ");
}

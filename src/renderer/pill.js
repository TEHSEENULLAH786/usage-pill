// The pill strip. Every chip is one provider; the strings arrive formatted
// from the main process, so this file only lays them out, resizes the window
// to fit, and turns mouse gestures into "drag" or "open the panel".

const root = document.getElementById("pill");
let style = "text";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** A donut for one meter: track, coloured arc, percentage in the middle. */
function ring(meter) {
  const box = el("div", "ring");
  const r = 11;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "28");
  svg.setAttribute("height", "28");
  svg.setAttribute("viewBox", "0 0 28 28");
  for (const kind of ["track", "value"]) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "14");
    circle.setAttribute("cy", "14");
    circle.setAttribute("r", String(r));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke-width", "3");
    circle.setAttribute("stroke-linecap", "round");
    circle.setAttribute("class", kind === "value" ? `value ${meter.level}` : kind);
    if (kind === "value") {
      circle.setAttribute("stroke-dasharray", String(c));
      circle.setAttribute("stroke-dashoffset", String(c * (1 - Math.min(100, meter.width) / 100)));
    }
    svg.append(circle);
  }
  box.append(svg);
  // A ring is read at a glance, so the number inside drops the % sign.
  box.append(el("span", "pct", String(meter.value).replace(/%$/, "")));
  box.append(el("span", "cap", meter.short));
  box.title = meter.title;
  return box;
}

/** A meter as a full-width rectangle: label, percentage and reset above the
 *  bar. The card style has the width for it; the strip styles do not. */
function bar(meter) {
  const box = el("div", "card-meter");
  const head = el("div", "card-meter-head");
  head.append(el("span", "mlabel", meter.label ?? meter.short));
  const v = el("span", `v ${meter.level}`, meter.value);
  head.append(v);
  if (meter.reset) head.append(el("span", "mreset", `↻ ${meter.reset}`));
  box.append(head);
  const track = el("div", "bar-track");
  const fill = el("span", `bar ${meter.level}`);
  fill.style.width = `${meter.width}%`;
  track.append(fill);
  box.append(track);
  box.title = meter.title;
  return box;
}

/** The card: the provider named in full, then one rectangle per headline
 *  meter. Everything the pill knows, laid out to be read rather than glanced. */
function card(p, withClose) {
  const chip = el("div", "chip panel card");
  // A column of cards is a widget, so the quit control belongs in its top
  // corner rather than standing off on its own above it.
  if (withClose) {
    const x = el("button", "card-x", "×");
    x.type = "button";
    x.title = "Quit Usage Pill (closes the pill and the menu bar item)";
    x.dataset.action = "quit";
    chip.append(x);
    chip.classList.add("has-close");
  }
  const head = el("div", "card-head");
  head.append(el("span", "label", p.label ?? p.short ?? p.id));
  if (p.available && p.badge) head.append(el("span", "badge", p.badge));
  if (p.stale) {
    const s = el("span", "stale", "·");
    s.title = p.staleReason;
    head.append(s);
  }
  chip.append(head);
  if (!p.available) chip.append(el("div", "card-note", p.reason || "unavailable"));
  else if (!p.headline.length) chip.append(el("div", "card-note", "no limits reported"));
  else for (const m of p.headline) chip.append(bar(m));
  return chip;
}

/** The same card condensed: the short name and the percentages, nothing else. */
function mini(p) {
  const chip = el("div", "chip panel mini");
  const head = el("div", "mini-head");
  head.append(el("span", "id", p.short ?? p.id));
  if (p.available && p.badge) head.append(el("span", "badge", p.badge));
  if (p.stale) {
    const s = el("span", "stale", "·");
    s.title = p.staleReason;
    head.append(s);
  }
  chip.append(head);
  const vals = el("div", "mini-vals");
  if (!p.available) vals.append(el("span", "k", "unavailable"));
  else
    for (const m of p.headline) {
      const v = el("span", `v ${m.level}`, m.value);
      v.title = m.title;
      vals.append(v);
    }
  chip.append(vals);
  return chip;
}

function render({ view, prefs }) {
  style = prefs?.pillStyle ?? "text";
  document.documentElement.dataset.theme = prefs?.theme === "system" ? "" : prefs?.theme ?? "";
  root.dataset.style = style; // the card styles lay the strip out differently

  root.replaceChildren();
  if (!view.length) {
    root.append(el("div", "chip panel empty", "No providers enabled. Right-click the menu bar item to add one."));
  }

  // The card column carries quit in the top card's corner; every other layout
  // is a row, where a chip of its own is the only place it can go.
  const inlineClose = style === "card" && view.length > 0;

  for (const [i, p] of view.entries()) {
    if (style === "card" || style === "mini") {
      root.append(style === "card" ? card(p, inlineClose && i === 0) : mini(p));
      continue;
    }
    const rings = style === "ring" && p.available && p.headline.length;
    const chip = el("div", `chip panel${rings ? " rings" : ""}`);
    chip.title = p.available ? `${p.label} usage` : p.reason || "";
    chip.append(el("span", "id", p.short ?? p.id));

    if (rings) {
      for (const m of p.headline) chip.append(ring(m));
    } else if (p.available) {
      if (p.badge) chip.append(el("span", "badge", p.badge));
      for (const m of p.headline) {
        chip.append(el("span", "k", m.short));
        const v = el("span", `v ${m.level}`, m.value);
        v.title = m.title;
        chip.append(v);
      }
      if (p.reset) {
        chip.append(el("span", "k", "↻"));
        chip.append(el("span", "v", p.reset));
      }
    } else {
      chip.append(el("span", "k", "unavailable"));
    }
    if (p.stale) {
      const s = el("span", "stale", "·");
      s.title = p.staleReason;
      chip.append(s);
    }
    root.append(chip);
  }

  if (!inlineClose) {
    const close = el("div", "chip panel close", "×");
    close.title = "Quit Usage Pill (closes the pill and the menu bar item)";
    close.dataset.action = "quit";
    root.append(close);
  }

  requestAnimationFrame(() => {
    const r = root.getBoundingClientRect();
    window.pill.size(r.width, r.height);
  });
}

// Drag to move, click to open the panel. Draggable regions in Electron swallow
// clicks, so the gesture is done by hand with screen coordinates.
let drag = null;
root.addEventListener("mousedown", async (e) => {
  if (e.button !== 0) return;
  const quit = e.target.closest('[data-action="quit"]');
  const b = await window.pill.bounds();
  if (!b) return;
  drag = { offX: e.screenX - b.x, offY: e.screenY - b.y, startX: e.screenX, startY: e.screenY, moved: false, quit: !!quit };
});
window.addEventListener("mousemove", (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.screenX - drag.startX, e.screenY - drag.startY) < 4) return;
  drag.moved = true;
  window.pill.move(e.screenX - drag.offX, e.screenY - drag.offY);
});
window.addEventListener("mouseup", () => {
  if (!drag) return;
  const { moved, quit } = drag;
  drag = null;
  if (moved) return window.pill.moved();
  if (quit) return window.pill.quit();
  window.pill.toggleDetail();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.pill.closeDetail();
});

window.pill.onUsage(render);
window.pill.get().then(render);

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

function render({ view, prefs }) {
  style = prefs?.pillStyle ?? "text";
  document.documentElement.dataset.theme = prefs?.theme === "system" ? "" : prefs?.theme ?? "";

  root.replaceChildren();
  if (!view.length) {
    root.append(el("div", "chip panel empty", "No providers enabled. Right-click the menu bar item to add one."));
  }

  for (const p of view) {
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

  const close = el("div", "chip panel close", "×");
  close.title = "Quit Usage Pill (closes the pill and the menu bar item)";
  close.dataset.action = "quit";
  root.append(close);

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

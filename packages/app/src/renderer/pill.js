// The pill strip. Every chip is one provider; the strings arrive formatted
// from the main process, so this file only lays them out, resizes the window
// to fit, and turns mouse gestures into "drag" or "open the panel".

const root = document.getElementById("pill");

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function render(view) {
  root.replaceChildren();
  if (!view.length) {
    const chip = el("div", "chip panel empty", "No providers enabled. Right-click the menu bar item to add one.");
    root.append(chip);
  }
  for (const p of view) {
    const chip = el("div", "chip panel");
    chip.title = p.available ? `${p.label} usage` : p.reason || "";
    chip.append(el("span", "id", p.id));
    if (p.badge) chip.append(el("span", "badge", p.badge));
    if (p.available) {
      for (const m of p.headline) {
        chip.append(el("span", "k", m.short));
        const v = el("span", `v ${m.level}`, m.percent);
        v.title = m.title;
        chip.append(v);
      }
      if (p.reset) {
        chip.append(el("span", "k", "↻"));
        chip.append(el("span", "v", p.reset));
      }
      if (p.stale) {
        const s = el("span", "stale", "·");
        s.title = p.staleReason;
        chip.append(s);
      }
    } else {
      chip.append(el("span", "k", "unavailable"));
    }
    root.append(chip);
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
  const b = await window.pill.bounds();
  if (!b) return;
  drag = { offX: e.screenX - b.x, offY: e.screenY - b.y, startX: e.screenX, startY: e.screenY, moved: false };
});
window.addEventListener("mousemove", (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.screenX - drag.startX, e.screenY - drag.startY) < 4) return;
  drag.moved = true;
  window.pill.move(e.screenX - drag.offX, e.screenY - drag.offY);
});
window.addEventListener("mouseup", () => {
  if (!drag) return;
  const { moved } = drag;
  drag = null;
  if (moved) window.pill.moved();
  else window.pill.toggleDetail();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.pill.closeDetail();
});

window.pill.onUsage(render);
window.pill.get().then(render);

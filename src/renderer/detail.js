// The panel under the pill: one section per provider with its bars, rows and
// provider options (the Claude Code model picker), an appearance picker, and
// Refresh / Settings / Quit.

let busy = false;
let renderSeq = 0; // renders are async; only the latest one gets to paint
let picker = null; // which dropdown is open, so a re-render can keep it open
let prefs = { theme: "system", pillStyle: "text" };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Inline SVG: the sanitizer strips markup strings, so build the nodes. */
function icon(name, size = 14) {
  const paths = {
    sun: ["M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4", "M12 8a4 4 0 100 8 4 4 0 000-8z"],
    moon: ["M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z"],
    display: ["M3 5h18v11H3z", "M8 20h8M12 16v4"],
    numbers: ["M4 7h6M4 12h10M4 17h7", "M17 7h3M17 12h3M17 17h3"],
    circle: ["M12 3a9 9 0 109 9", "M12 7a5 5 0 105 5"],
    card: ["M3 4h18v16H3z", "M6 9h12M6 13h8M6 17h5"],
    mini: ["M4 8h16v8H4z", "M7 12h4"],
    check: ["M4 12.5 9 17.5 20 6.5"],
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths[name] ?? []) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

const THEMES = [
  { value: "system", label: "Match system", icon: "display" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];
// `short` is what fits in a quarter of the panel's width; `label` is the name
// the menu bar and Settings use for the same thing.
const STYLES = [
  { value: "text", label: "Numbers", short: "Numbers", icon: "numbers" },
  { value: "ring", label: "Circles", short: "Circles", icon: "circle" },
  { value: "card", label: "Card", short: "Card", icon: "card" },
  { value: "mini", label: "Small card", short: "Small", icon: "mini" },
];

/** The layouts laid out flat: switching is one click, not a click to open a
 *  menu and another to choose. The theme, changed far less often, keeps the
 *  dropdown. */
function layoutBar() {
  const bar = el("div", "seg");
  for (const s of STYLES) {
    const btn = el("button", "seg-btn");
    btn.type = "button";
    btn.setAttribute("aria-checked", String(s.value === prefs.pillStyle));
    btn.title = `Pill layout: ${s.label}`;
    btn.append(icon(s.icon, 13), el("span", null, s.short));
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      picker = null;
      prefs = await window.pill.setPrefs({ pillStyle: s.value });
      applyTheme();
      paint();
    });
    bar.append(btn);
  }
  return bar;
}

function appearancePicker() {
  const box = el("div", "picker");
  const theme = THEMES.find((t) => t.value === prefs.theme) ?? THEMES[0];

  const btn = el("button", "picker-btn");
  btn.type = "button";
  btn.append(icon(theme.icon), el("span", null, theme.label));
  btn.append(el("span", "caret", "▾"));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    picker = picker === "appearance" ? null : "appearance";
    paint();
  });
  box.append(btn);

  if (picker === "appearance") {
    const menu = el("div", "menu");
    const add = (group, items, current, key) => {
      if (group) menu.append(el("div", "group", group));
      for (const it of items) {
        const item = el("button", "menu-item");
        item.type = "button";
        item.setAttribute("aria-checked", String(it.value === current));
        item.append(icon(it.icon), el("span", null, it.label));
        const tick = el("span", "check");
        tick.append(icon("check", 13));
        item.append(tick);
        item.addEventListener("click", async (e) => {
          e.stopPropagation();
          picker = null;
          prefs = await window.pill.setPrefs({ [key]: it.value });
          applyTheme();
          paint();
        });
        menu.append(item);
      }
    };
    // Only the theme is behind the button now; the layouts are the row below.
    add(null, THEMES, prefs.theme, "theme");
    box.append(menu);
  }
  return box;
}

function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme === "system" ? "" : prefs.theme;
}

let lastView = [];

async function render(payload) {
  if (payload) {
    lastView = payload.view ?? lastView;
    prefs = payload.prefs ?? prefs;
    applyTheme();
  }
  await paint();
}

async function paint() {
  const seq = ++renderSeq;
  const frag = document.createDocumentFragment();
  const view = lastView;
  if (!view.length) frag.append(el("p", "note", "No providers enabled. Open Settings to turn one on."));

  for (const p of view) {
    const s = el("div", "section");
    const head = el("div", "row");
    head.style.marginBottom = "10px";
    head.append(el("span", "title", p.label));
    if (p.badge) head.append(el("span", "mono muted", p.badge));
    s.append(head);
    if (p.account) {
      const a = el("p", "note", p.account);
      a.style.margin = "-6px 0 10px";
      s.append(a);
    }

    for (const o of p.options) s.append(await optionField(p.id, o));

    if (p.available) {
      for (const g of p.groups) {
        if (g.title) {
          const h = el("p", "eyebrow", g.title);
          h.style.margin = "12px 0 8px";
          s.append(h);
        }
        for (const m of g.meters) {
          const box = el("div", "meter");
          const r = el("div", "row");
          r.append(el("span", null, m.label), el("span", "num secondary", `${m.value}${m.total ? ` of ${m.total}` : ""} used`));
          const track = el("div", "bar-track");
          const bar = el("span", `bar ${m.level}`);
          bar.style.width = `${m.width}%`;
          track.append(bar);
          box.append(r, track);
          if (m.resetLabel) box.append(el("p", "sub", m.resetLabel));
          s.append(box);
        }
      }
      if (p.rowsTitle) {
        const h = el("p", "eyebrow", p.rowsTitle);
        h.style.margin = "12px 0 8px";
        s.append(h);
        if (!p.rows.length && p.rowsEmpty) s.append(el("p", "note", p.rowsEmpty));
        for (const r of p.rows) {
          const line = el("div", "row");
          line.style.marginBottom = "5px";
          line.append(el("span", null, r.label), el("span", "num muted", r.value));
          s.append(line);
        }
      }
      for (const n of p.notes) s.append(el("p", "note", n));
    } else {
      s.append(el("p", "note secondary", p.reason || "Unavailable."));
    }
    if (p.stale) s.append(el("p", "note warn-text", `Not current: ${p.staleReason}`));
    if (p.homepage) {
      const a = el("a", "note", "Open on the web");
      a.href = "#";
      a.style.display = "inline-block";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.pill.openExternal(p.homepage);
      });
      s.append(a);
    }
    frag.append(s);
  }

  const appearance = el("div", "section");
  const h = el("p", "eyebrow", "Appearance");
  h.style.margin = "0 0 6px";
  appearance.append(h, appearancePicker(), layoutBar());
  frag.append(appearance);

  // Every figure here is read from somewhere else, and some are worked out
  // rather than reported. Say so once, where it can't be missed.
  if (view.length) {
    const disclaimer = el(
      "p",
      "note disclaimer",
      "These figures are read from each service, and some are worked out from what its API gives. They can lag or be rounded. Open the service's own page above for the exact number.",
    );
    frag.append(disclaimer);
  }

  const footer = el("div", "footer");
  footer.append(el("span", "note", view.find((p) => p.updated)?.updated ?? ""));
  const actions = el("div");
  actions.style.display = "flex";
  actions.style.gap = "6px";

  const quitBtn = el("button", "btn", "Quit");
  quitBtn.title = "Quit Usage Pill (also on the pill's × and in the menu bar)";
  quitBtn.addEventListener("click", () => window.pill.quit());
  const settingsBtn = el("button", "btn", "Settings");
  settingsBtn.addEventListener("click", () => window.pill.openSettings());
  const refreshBtn = el("button", "btn", busy ? "Refreshing…" : "Refresh");
  refreshBtn.disabled = busy;
  refreshBtn.addEventListener("click", async () => {
    busy = true;
    refreshBtn.textContent = "Refreshing…";
    refreshBtn.disabled = true;
    try {
      await window.pill.get(true);
    } finally {
      busy = false;
    }
  });
  actions.append(quitBtn, settingsBtn, refreshBtn);
  footer.append(actions);
  frag.append(footer);

  if (seq !== renderSeq) return; // a newer render finished first
  const root = document.getElementById("detail");
  root.replaceChildren(frag);
  // 12px of margin plus 2px of border sit outside the panel's own box.
  requestAnimationFrame(() => window.pill.detailSize(root.scrollHeight + 14));
}

async function optionField(providerId, o) {
  const box = el("div", "field");
  box.style.margin = "0 0 12px";
  const label = el("p", "eyebrow", o.label);
  label.style.margin = "0 0 6px";
  box.append(label);
  const select = el("select");
  const opt = await window.pill.option(providerId, o.key).catch(() => null);
  if (!opt) {
    box.append(el("p", "note", "Unavailable."));
    return box;
  }
  for (const v of opt.values) {
    const option = el("option", null, v.note ? `${v.label} — ${v.note}` : v.label);
    option.value = v.value ?? "";
    option.selected = (v.value ?? null) === (opt.current ?? null);
    select.append(option);
  }
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      await window.pill.setOption(providerId, o.key, select.value || null);
    } catch (err) {
      box.append(el("p", "note warn-text", err?.message || String(err)));
    } finally {
      select.disabled = false;
    }
  });
  box.append(select);
  if (o.help) box.append(el("p", "help note", o.help));
  return box;
}

document.addEventListener("click", () => {
  if (picker) {
    picker = null;
    paint();
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (picker) {
    picker = null;
    return paint();
  }
  window.pill.closeDetail();
});

window.pill.onUsage(render);
window.pill.get().then(render);

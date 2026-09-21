// The panel under the pill: one section per provider with its bars, rows and
// provider options (the Claude Code model picker), plus Refresh and Settings.

const root = document.getElementById("detail");
let busy = false;
let renderSeq = 0; // renders are async; only the latest one gets to paint

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function render(view) {
  const seq = ++renderSeq;
  const root = document.createDocumentFragment();
  if (!view.length) root.append(el("p", "note", "No providers enabled. Open Settings to turn one on."));

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
          r.append(el("span", null, m.label), el("span", "num secondary", `${m.percent} used`));
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
    root.append(s);
  }

  const footer = el("div", "footer");
  footer.append(el("span", "note", view.find((p) => p.updated)?.updated ?? ""));
  const actions = el("div");
  actions.style.display = "flex";
  actions.style.gap = "6px";
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
  const quitBtn = el("button", "btn", "Quit");
  quitBtn.title = "Quit Usage Pill (also in the menu bar item's menu)";
  quitBtn.addEventListener("click", () => window.pill.quit());
  actions.append(quitBtn, settingsBtn, refreshBtn);
  footer.append(actions);
  root.append(footer);

  if (seq !== renderSeq) return; // a newer render finished first
  document.getElementById("detail").replaceChildren(root);
  requestAnimationFrame(() => window.pill.detailSize(document.body.scrollHeight));
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

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.pill.closeDetail();
});

window.pill.onUsage(render);
window.pill.get().then(render);

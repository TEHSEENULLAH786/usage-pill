// Settings: built from each provider's declared fields, so a new provider
// gets its form for free. Claude accounts and app preferences below that.

const form = document.getElementById("settings");

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function field(label, input, help) {
  const box = el("div", "field");
  box.append(el("label", null, label), input);
  if (help) box.append(el("p", "help", help));
  return box;
}

function check(label, checked, name) {
  const wrap = el("label", "check");
  const input = el("input");
  input.type = "checkbox";
  input.checked = !!checked;
  input.name = name;
  wrap.append(input, el("span", null, label));
  return wrap;
}

async function render() {
  const { providers, values, app } = await window.pill.settings();
  document.documentElement.dataset.theme = app.theme === "system" ? "" : app.theme ?? "";
  form.replaceChildren();

  const heading = el("p", "eyebrow", "Providers");
  heading.style.margin = "0 0 12px";
  form.append(heading);

  for (const p of providers) {
    const box = el("div", "provider panel");
    box.style.padding = "12px 14px";
    const head = el("div", "head");
    head.append(el("span", "title", p.label), check("Show", p.enabled, `${p.id}.enabled`));
    box.append(head);
    if (!p.settings.length) {
      box.append(el("p", "help", p.id.startsWith("claude") ? "Uses the Claude Code login on this machine." : "Nothing to configure."));
    }
    for (const f of p.settings) {
      const input = el("input");
      input.type = f.type ?? "text";
      input.name = `${p.id}.${f.key}`;
      input.placeholder = f.placeholder ?? "";
      if (f.min != null) input.min = f.min;
      if (f.max != null) input.max = f.max;
      input.value = values[p.id]?.[f.key] ?? "";
      input.autocomplete = "off";
      input.spellcheck = false;
      box.append(field(f.label, input, f.help));
    }
    form.append(box);
  }

  // Claude accounts: one chip per account, kept by copying whatever login
  // Claude Code holds. Nothing here can sign anybody in.
  const accounts = await window.pill.accounts().catch(() => []);
  if (accounts.length) {
    const h = el("p", "eyebrow", "Claude accounts");
    h.style.margin = "6px 0 12px";
    form.append(h);
    const box = el("div", "panel");
    box.style.padding = "8px 14px";
    for (const a of accounts) {
      const row = el("div", "account");
      const left = el("div");
      left.append(el("div", null, a.email ?? a.name ?? a.uuid.slice(0, 8)));
      left.append(el("div", "tag", a.current ? "signed in to Claude Code" : a.expired ? "copy expired" : "saved copy"));
      row.append(left);
      if (!a.current) {
        const forget = el("button", "btn", "Forget");
        forget.type = "button";
        forget.addEventListener("click", async () => {
          forget.disabled = true;
          await window.pill.forgetAccount(a.uuid);
          render();
        });
        row.append(forget);
      }
      box.append(row);
    }
    form.append(box);
    form.append(
      el(
        "p",
        "help",
        "Sign Claude Code into another account and it appears here on the next refresh. A saved copy stops updating when its login expires; sign Claude Code into it once to refresh it.",
      ),
    );
  }

  const appHeading = el("p", "eyebrow", "App");
  appHeading.style.margin = "14px 0 12px";
  form.append(appHeading);
  const appBox = el("div", "panel");
  appBox.style.padding = "12px 14px";
  appBox.append(check("Show the floating pill", app.pillVisible !== false, "app.pillVisible"));
  const login = check("Launch at login", app.launchAtLogin, "app.launchAtLogin");
  login.style.marginTop = "8px";
  appBox.append(login);
  appBox.append(el("p", "help", "Theme and pill style are in the panel under the pill: click the pill, then Appearance."));
  form.append(appBox);

  const actions = el("div", "actions");
  const cancel = el("button", "btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => window.pill.closeSettings());
  const save = el("button", "btn btn-ink", "Save");
  save.type = "submit";
  actions.append(cancel, save);
  form.append(actions);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = { providers: {}, app: {} };
  for (const input of form.querySelectorAll("input[name]")) {
    const [scope, key] = input.name.split(".");
    const value = input.type === "checkbox" ? input.checked : input.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
    if (scope === "app") data.app[key] = value;
    else (data.providers[scope] ??= {})[key] = value;
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Saving…";
  try {
    await window.pill.saveSettings(data);
    window.pill.closeSettings();
  } catch (err) {
    submit.disabled = false;
    submit.textContent = "Save";
    form.append(el("p", "note warn-text", err?.message || String(err)));
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.pill.closeSettings();
});

render();

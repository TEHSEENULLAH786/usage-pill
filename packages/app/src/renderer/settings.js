// Settings: built from each provider's declared fields, so a new provider
// gets its form for free. App preferences at the bottom.

const form = document.getElementById("settings");

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function field(label, input, help) {
  const box = el("div", "field");
  const l = el("label", null, label);
  box.append(l, input);
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
    if (!p.settings.length) box.append(el("p", "help", "Nothing to configure."));
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

  const appHeading = el("p", "eyebrow", "App");
  appHeading.style.margin = "6px 0 12px";
  form.append(appHeading);
  const appBox = el("div", "panel");
  appBox.style.padding = "12px 14px";
  appBox.append(check("Show the floating pill", app.pillVisible !== false, "app.pillVisible"));
  const login = check("Launch at login", app.launchAtLogin, "app.launchAtLogin");
  login.style.marginTop = "8px";
  appBox.append(login);
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

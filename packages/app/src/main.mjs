import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHub,
  filePersist,
  fileSettings,
  formatPercent,
  headline,
  level,
  pillLine,
  providers,
  resetLabel,
  shortReset,
  trayTitle,
  updatedLabel,
  watchResets,
} from "usage-pill-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const renderer = (file) => path.join(here, "renderer", file);
const PRELOAD = path.join(here, "preload.cjs");
const DETAIL_WIDTH = 360;

const settings = fileSettings();
const hub = createHub({ providers, settings, persist: filePersist() });
const resets = watchResets({
  hub,
  notify: (title, body) => Notification.isSupported() && new Notification({ title, body }).show(),
});

let pill = null;
let detail = null;
let prefs = null;
let tray = null;
let entries = [];
let refreshTimer = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showPill());
if (process.platform === "darwin") app.dock?.hide();

app.whenReady().then(async () => {
  createTray();
  if (settings.app().pillVisible !== false) createPill();
  registerIpc();
  await refresh();
  refreshTimer = setInterval(() => refresh(), 60_000);
  setInterval(() => broadcast(), 30_000); // countdowns ("3h 6m") tick without a fetch
});

app.on("window-all-closed", () => {
  // A menu bar app stays alive with no windows.
});

// ---------------------------------------------------------------------------
// Data

async function refresh(force = false) {
  entries = await hub.getAll({ refresh: force });
  resets.update(entries);
  broadcast();
  return entries;
}

function broadcast() {
  const view = viewModel(entries);
  for (const w of [pill, detail]) if (w && !w.isDestroyed()) w.webContents.send("usage", view);
  tray?.setTitle(entries.length ? trayTitle(entries) : "", { fontType: "monospacedDigit" });
  tray?.setContextMenu(buildMenu());
}

/** Everything the windows render, already formatted: they hold no logic. */
function viewModel(list, now = Date.now()) {
  return list.map(({ provider, snapshot }) => {
    const top = headline(snapshot);
    const groups = [];
    for (const m of snapshot.meters ?? []) {
      const title = m.group ?? null;
      let g = groups.find((x) => x.title === title);
      if (!g) groups.push((g = { title, meters: [] }));
      g.meters.push({ label: m.label, percent: formatPercent(m.percent), width: Math.min(100, Math.max(0, m.percent)), level: level(m), resetLabel: resetLabel(m.resetsAt, now) });
    }
    return {
      id: provider.id,
      label: provider.label,
      homepage: provider.homepage,
      options: provider.options,
      available: snapshot.available,
      reason: snapshot.reason ?? null,
      stale: !!snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
      updated: updatedLabel(snapshot.fetchedAt, now),
      badge: snapshot.badge ?? null,
      account: snapshot.account ?? null,
      line: pillLine({ provider, snapshot }, now),
      headline: top.map((m) => ({ short: m.short, percent: formatPercent(m.percent), width: Math.min(100, Math.max(0, m.percent)), level: level(m), title: `${m.label} · ${resetLabel(m.resetsAt, now)}` })),
      reset: shortReset(top.find((m) => m.resetsAt)?.resetsAt, now),
      groups,
      rows: snapshot.rows ?? [],
      rowsTitle: snapshot.rowsTitle ?? null,
      rowsEmpty: snapshot.rowsEmpty ?? null,
      notes: snapshot.notes ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// The pill: a frameless, transparent, always-on-top strip you drag anywhere.

function createPill() {
  if (pill && !pill.isDestroyed()) return pill;
  const saved = settings.app().pill ?? {};
  pill = new BrowserWindow({
    width: saved.width ?? 520,
    height: saved.height ?? 44,
    ...startPosition(saved),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  pill.setAlwaysOnTop(true, "floating");
  pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pill.loadFile(renderer("pill.html"));
  pill.once("ready-to-show", () => {
    pill.show();
    broadcast();
  });
  pill.on("moved", savePillBounds);
  pill.on("closed", () => {
    pill = null;
    hideDetail();
  });
  return pill;
}

/** The saved spot if it's still on a screen, else the top-right corner. */
function startPosition(saved) {
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return saved.x >= a.x - 20 && saved.x < a.x + a.width - 40 && saved.y >= a.y - 5 && saved.y < a.y + a.height - 20;
    });
    if (onScreen) return { x: saved.x, y: saved.y };
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - (saved.width ?? 520) - 16, y: a.y + 12 };
}

function savePillBounds() {
  if (!pill || pill.isDestroyed()) return;
  const b = pill.getBounds();
  settings.setApp({ pill: { x: b.x, y: b.y, width: b.width, height: b.height } });
  positionDetail();
}

function showPill() {
  createPill();
  if (!pill.isVisible()) pill.show();
  settings.setApp({ pillVisible: true });
  tray?.setContextMenu(buildMenu());
}

function hidePill() {
  hideDetail();
  pill?.hide();
  settings.setApp({ pillVisible: false });
  tray?.setContextMenu(buildMenu());
}

// ---------------------------------------------------------------------------
// The detail panel under the pill: bars, model picker, rows. Hides on blur.

function createDetail() {
  if (detail && !detail.isDestroyed()) return detail;
  detail = new BrowserWindow({
    width: DETAIL_WIDTH,
    height: 420,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  detail.setAlwaysOnTop(true, "floating");
  detail.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  detail.loadFile(renderer("detail.html"));
  detail.on("blur", () => detail?.hide());
  detail.on("closed", () => (detail = null));
  return detail;
}

function toggleDetail() {
  if (detail && !detail.isDestroyed() && detail.isVisible()) return hideDetail();
  createDetail();
  const show = () => {
    positionDetail();
    detail.show();
    detail.focus();
    broadcast();
  };
  if (detail.webContents.isLoading()) detail.webContents.once("did-finish-load", show);
  else show();
}

function hideDetail() {
  if (detail && !detail.isDestroyed()) detail.hide();
}

/** Right-aligned under the pill, kept inside the pill's display. */
function positionDetail() {
  if (!detail || detail.isDestroyed() || !pill || pill.isDestroyed()) return;
  const p = pill.getBounds();
  const d = detail.getBounds();
  const a = screen.getDisplayMatching(p).workArea;
  let x = p.x + p.width - d.width;
  let y = p.y + p.height + 6;
  if (y + d.height > a.y + a.height) y = Math.max(a.y, p.y - d.height - 6);
  x = Math.min(Math.max(x, a.x), a.x + a.width - d.width);
  detail.setPosition(Math.round(x), Math.round(y));
}

// ---------------------------------------------------------------------------
// Settings window: which providers are on, their keys, app preferences.

function openPrefs() {
  if (prefs && !prefs.isDestroyed()) return prefs.focus();
  prefs = new BrowserWindow({
    width: 440,
    height: 560,
    title: "Usage Pill Settings",
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  prefs.setMenuBarVisibility(false);
  prefs.loadFile(renderer("settings.html"));
  prefs.once("ready-to-show", () => prefs.show());
  prefs.on("closed", () => (prefs = null));
}

// ---------------------------------------------------------------------------
// Menu bar item

function createTray() {
  const icon = nativeImage.createFromPath(path.join(here, "..", "assets", "trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Usage Pill");
  tray.setContextMenu(buildMenu());
}

function buildMenu() {
  const pillShown = !!pill && !pill.isDestroyed() && pill.isVisible();
  const all = hub.providers();
  return Menu.buildFromTemplate([
    ...entries.map((e) => ({ label: pillLine(e), enabled: false })),
    ...(entries.length ? [{ type: "separator" }] : []),
    { label: pillShown ? "Hide pill" : "Show pill", click: () => (pillShown ? hidePill() : showPill()) },
    { label: "Refresh now", click: () => refresh(true) },
    { type: "separator" },
    {
      label: "Providers",
      submenu: all.map((p) => ({
        label: p.label,
        type: "checkbox",
        checked: p.enabled,
        click: (item) => {
          settings.set(p.id, { enabled: item.checked });
          refresh();
        },
      })),
    },
    ...all
      .filter((p) => p.enabled && p.options.length)
      .flatMap((p) => p.options.map((o) => ({ label: `${p.label}: ${o.label}`, submenu: optionSubmenu(p.id, o.key) }))),
    { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => openPrefs() },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: "separator" },
    { label: "Quit Usage Pill", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
  ]);
}

/** Built from the cached option values so the menu opens instantly; the
 *  values themselves are refreshed each time the menu is rebuilt. */
const optionCache = new Map();
function optionSubmenu(id, key) {
  const cacheKey = `${id}:${key}`;
  hub.option(id, key).then((o) => optionCache.set(cacheKey, o)).catch(() => {});
  const o = optionCache.get(cacheKey);
  if (!o) return [{ label: "Loading…", enabled: false }];
  return o.values.map((v) => ({
    label: v.note ? `${v.label} — ${v.note}` : v.label,
    type: "radio",
    checked: (v.value ?? null) === (o.current ?? null),
    click: async () => {
      await hub.setOption(id, key, v.value);
      optionCache.delete(cacheKey);
      refresh();
    },
  }));
}

// ---------------------------------------------------------------------------
// IPC from the windows

function registerIpc() {
  ipcMain.handle("usage:get", async (_e, { refresh: force } = {}) => (force || !entries.length ? viewModel(await refresh(force)) : viewModel(entries)));
  ipcMain.on("pill:size", (_e, { width, height }) => {
    if (!pill || pill.isDestroyed()) return;
    const w = Math.max(80, Math.ceil(width));
    const h = Math.max(24, Math.ceil(height));
    const b = pill.getBounds();
    if (b.width === w && b.height === h) return;
    pill.setBounds({ x: b.x + b.width - w, y: b.y, width: w, height: h }); // grow leftwards, keep the right edge
    savePillBounds();
  });
  ipcMain.handle("pill:bounds", () => (pill && !pill.isDestroyed() ? pill.getBounds() : null));
  ipcMain.on("pill:move", (_e, { x, y }) => {
    if (!pill || pill.isDestroyed()) return;
    pill.setPosition(Math.round(x), Math.round(y));
    positionDetail();
  });
  ipcMain.on("pill:moved", () => savePillBounds());
  ipcMain.on("pill:toggle-detail", () => toggleDetail());
  ipcMain.on("detail:size", (_e, { height }) => {
    if (!detail || detail.isDestroyed()) return;
    const a = screen.getDisplayMatching(detail.getBounds()).workArea;
    detail.setSize(DETAIL_WIDTH, Math.min(Math.ceil(height), a.height - 24));
    positionDetail();
  });
  ipcMain.on("detail:close", () => hideDetail());
  ipcMain.handle("option:get", (_e, { id, key }) => hub.option(id, key));
  ipcMain.handle("option:set", async (_e, { id, key, value }) => {
    await hub.setOption(id, key, value);
    optionCache.delete(`${id}:${key}`);
    return viewModel(await refresh());
  });
  ipcMain.handle("settings:get", () => ({
    providers: hub.providers(),
    values: settings.read().providers ?? {},
    app: { ...settings.app(), launchAtLogin: app.getLoginItemSettings().openAtLogin },
  }));
  ipcMain.handle("settings:save", async (_e, data) => {
    for (const [id, patch] of Object.entries(data.providers ?? {})) settings.set(id, patch);
    if (data.app) {
      const { launchAtLogin, ...rest } = data.app;
      if (typeof launchAtLogin === "boolean") app.setLoginItemSettings({ openAtLogin: launchAtLogin });
      settings.setApp(rest);
      if (rest.pillVisible === false) hidePill();
      else if (rest.pillVisible === true) showPill();
    }
    await refresh(true);
    return true;
  });
  ipcMain.on("settings:open", () => openPrefs());
  ipcMain.on("settings:close", () => prefs?.close());
  ipcMain.on("open-external", (_e, url) => {
    if (/^https?:\/\//.test(String(url))) shell.openExternal(url);
  });
  ipcMain.on("app:quit", () => app.quit());
}

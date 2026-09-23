import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, Notification, screen, shell, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  claudeModel,
  createHub,
  filePersist,
  fileSettings,
  forgetClaudeAccount,
  headline,
  level,
  listClaudeAccounts,
  meterText,
  pillLine,
  providers,
  resetLabel,
  shortReset,
  trayMeters,
  trayTitle,
  updatedLabel,
  watchResets,
} from "./core/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const renderer = (file) => path.join(here, "renderer", file);
const PRELOAD = path.join(here, "preload.cjs");
const DETAIL_WIDTH = 360;
// A popover, not a window: past this it scrolls rather than growing down the
// screen. Still clamped to the display it sits on.
const DETAIL_MAX_HEIGHT = 560;

const settings = fileSettings();
const hub = createHub({ providers, settings, persist: filePersist() });
const resets = watchResets({
  hub,
  notify: (title, body) => Notification.isSupported() && new Notification({ title, body }).show(),
});

let pill = null;
let detail = null;
let prefsWindow = null;
let tray = null;
let entries = [];

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showPill());
// A menu bar app owns no Dock slot. Run from npm there is no .app bundle
// either, so anything that does show an icon — the Dock in the moment before
// this hides it — would borrow Electron's. Point it at ours first.
if (process.platform === "darwin") {
  try {
    const icon = nativeImage.createFromPath(path.join(here, "..", "assets", "icon.png"));
    if (!icon.isEmpty()) app.dock?.setIcon(icon);
  } catch {
    // Only the icon: not worth failing a launch over.
  }
  app.dock?.hide();
}

app.whenReady().then(async () => {
  applyTheme();
  if (!settings.app().loginItemDecided) {
    app.setLoginItemSettings({ openAtLogin: true });
    settings.setApp({ loginItemDecided: true });
  }
  createTray();
  if (appPrefs().pillVisible !== false) createPill();
  registerIpc();
  await refresh();
  setInterval(() => refresh(), 60_000);
  setInterval(() => broadcast(), 30_000); // countdowns ("3h 6m") tick without a fetch
});

app.on("window-all-closed", () => {
  // A menu bar app stays alive with no windows.
});

// ---------------------------------------------------------------------------
// Preferences

/** What the windows need to know about appearance, with the defaults applied. */
function appPrefs() {
  const a = settings.app();
  return {
    theme: a.theme ?? "system", // "system" | "light" | "dark"
    pillStyle: a.pillStyle ?? "text", // "text" | "ring"
    pillVisible: a.pillVisible,
  };
}

/** Electron paints window chrome and the default page background from this,
 *  so it has to follow the app's own choice, not just the OS. */
function applyTheme() {
  nativeTheme.themeSource = appPrefs().theme;
}

// ---------------------------------------------------------------------------
// Data

async function refresh(force = false) {
  entries = await hub.getAll({ refresh: force });
  resets.update(entries);
  broadcast();
  return entries;
}

function broadcast() {
  const payload = { view: viewModel(entries), prefs: appPrefs() };
  for (const w of [pill, detail]) if (w && !w.isDestroyed()) w.webContents.send("usage", payload);
  tray?.setTitle(entries.length ? trayTitle(entries) : "", { fontType: "monospacedDigit" });
  tray?.setContextMenu(buildMenu());
}

/** Everything the windows render, already formatted: they hold no logic. */
function viewModel(list, now = Date.now()) {
  return list.map(({ provider, snapshot }) => {
    // Not just the two headline figures: a per-model weekly limit that has
    // been used (Fable, Opus) earns its place in the pill as well.
    const top = trayMeters(snapshot);
    const groups = [];
    for (const m of snapshot.meters ?? []) {
      const title = m.group ?? null;
      let g = groups.find((x) => x.title === title);
      if (!g) groups.push((g = { title, meters: [] }));
      g.meters.push({
        label: m.label,
        value: meterText(m),
        total: m.total ?? null,
        width: Math.min(100, Math.max(0, m.percent)),
        level: level(m),
        resetLabel: resetLabel(m.resetsAt, now),
      });
    }
    return {
      id: provider.id,
      label: provider.label,
      short: provider.short,
      homepage: provider.homepage,
      options: provider.options,
      available: snapshot.available,
      reason: snapshot.reason ?? null,
      stale: !!snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
      updated: updatedLabel(snapshot.fetchedAt, now),
      // Claude Code's model can change between two cached snapshots, so for
      // the account it belongs to it is read now rather than taken from one.
      badge: provider.account?.current ? claudeModel()?.short ?? null : snapshot.badge ?? null,
      account: snapshot.account ?? null,
      line: pillLine({ provider, snapshot }, now),
      headline: top.map((m) => ({
        short: m.short,
        // The card styles have the room to spell the meter out and to show
        // when it comes back, so both are carried alongside the short form.
        label: m.label,
        value: meterText(m),
        total: m.total ?? null,
        width: Math.min(100, Math.max(0, m.percent)),
        level: level(m),
        reset: shortReset(m.resetsAt, now),
        title: `${m.label} · ${resetLabel(m.resetsAt, now)}`,
      })),
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

/** Right-aligned under the pill, kept inside the pill's display — and never
 *  over the pill itself: both float at the same level, so a panel that covered
 *  the pill would take away the only thing that closes it again. Under, over,
 *  or beside, in that order. */
function positionDetail() {
  if (!detail || detail.isDestroyed() || !pill || pill.isDestroyed()) return;
  const gap = 6;
  const p = pill.getBounds();
  const d = detail.getBounds();
  const a = screen.getDisplayMatching(p).workArea;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  let x = p.x + p.width - d.width;
  let y;
  if (p.y + p.height + gap + d.height <= a.y + a.height) {
    y = p.y + p.height + gap; // under the pill, the usual case
  } else if (p.y - gap - d.height >= a.y) {
    y = p.y - d.height - gap; // over it, when the room is above instead
  } else {
    // A tall pill — the card column — can leave too little either way. Then it
    // goes alongside, on whichever side has the room, top edges roughly level.
    y = clamp(p.y, a.y, a.y + a.height - d.height);
    const left = p.x - d.width - gap;
    const right = p.x + p.width + gap;
    x = left >= a.x || right + d.width > a.x + a.width ? left : right;
  }
  x = clamp(x, a.x, a.x + a.width - d.width);
  detail.setPosition(Math.round(x), Math.round(y));
}

// ---------------------------------------------------------------------------
// Settings window: which providers are on, their keys, Claude accounts.

function openPrefs() {
  if (prefsWindow && !prefsWindow.isDestroyed()) return prefsWindow.focus();
  // Taller than the screen allows is no use, and the form grows with every
  // provider, so this one resizes and scrolls.
  const area = screen.getPrimaryDisplay().workAreaSize;
  prefsWindow = new BrowserWindow({
    width: 460,
    height: Math.min(760, area.height - 80),
    minWidth: 420,
    minHeight: 360,
    title: "Usage Pill Settings",
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  prefsWindow.setMenuBarVisibility(false);
  prefsWindow.loadFile(renderer("settings.html"));
  prefsWindow.once("ready-to-show", () => prefsWindow.show());
  prefsWindow.on("closed", () => (prefsWindow = null));
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
  const p = appPrefs();
  return Menu.buildFromTemplate([
    ...entries.map((e) => ({ label: pillLine(e), enabled: false })),
    ...(entries.length ? [{ type: "separator" }] : []),
    { label: pillShown ? "Hide pill" : "Show pill", click: () => (pillShown ? hidePill() : showPill()) },
    { label: "Refresh now", click: () => refresh(true) },
    { type: "separator" },
    {
      label: "Providers",
      submenu: all.map((x) => ({
        label: x.label,
        type: "checkbox",
        checked: x.enabled,
        click: (item) => {
          settings.set(x.id, { enabled: item.checked });
          refresh();
        },
      })),
    },
    ...all
      .filter((x) => x.enabled && x.options.length)
      .flatMap((x) => x.options.map((o) => ({ label: `${x.label}: ${o.label}`, submenu: optionSubmenu(x.id, o.key) }))),
    {
      label: "Appearance",
      submenu: [
        ...[
          ["system", "Match system"],
          ["light", "Light"],
          ["dark", "Dark"],
        ].map(([value, label]) => ({
          label,
          type: "radio",
          checked: p.theme === value,
          click: () => setPrefs({ theme: value }),
        })),
        { type: "separator" },
        ...[
          ["text", "Numbers"],
          ["ring", "Circles"],
          ["card", "Card"],
          ["mini", "Small card"],
        ].map(([value, label]) => ({
          label,
          type: "radio",
          checked: p.pillStyle === value,
          click: () => setPrefs({ pillStyle: value }),
        })),
      ],
    },
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

function setPrefs(patch) {
  settings.setApp(patch);
  applyTheme();
  broadcast();
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
  ipcMain.handle("usage:get", async (_e, { refresh: force } = {}) => ({
    view: force || !entries.length ? viewModel(await refresh(force)) : viewModel(entries),
    prefs: appPrefs(),
  }));
  ipcMain.handle("prefs:set", (_e, patch) => {
    setPrefs(patch);
    return appPrefs();
  });
  ipcMain.on("pill:size", (_e, { width, height }) => {
    if (!pill || pill.isDestroyed()) return;
    const w = Math.max(80, Math.ceil(width));
    const h = Math.max(24, Math.ceil(height));
    const b = pill.getBounds();
    if (b.width === w && b.height === h) return;
    // Grow leftwards, keeping the right edge. The card style is a column tall
    // enough to run off the bottom from where a strip sat happily, so the top
    // gives way instead — the pill stays whole and on the screen it was on.
    const a = screen.getDisplayMatching(b).workArea;
    const x = b.x + b.width - w;
    const y = Math.max(a.y, Math.min(b.y, a.y + a.height - h));
    pill.setBounds({ x, y, width: w, height: h });
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
    detail.setSize(DETAIL_WIDTH, Math.min(Math.ceil(height), DETAIL_MAX_HEIGHT, a.height - 24));
    positionDetail();
  });
  ipcMain.on("detail:close", () => hideDetail());
  ipcMain.handle("option:get", (_e, { id, key }) => hub.option(id, key));
  ipcMain.handle("option:set", async (_e, { id, key, value }) => {
    await hub.setOption(id, key, value);
    optionCache.delete(`${id}:${key}`);
    return { view: viewModel(await refresh()), prefs: appPrefs() };
  });
  // Tokens never leave the main process: the window sees names only.
  ipcMain.handle("accounts:list", async () =>
    (await listClaudeAccounts()).map(({ token, ...rest }) => rest),
  );
  ipcMain.handle("accounts:forget", async (_e, uuid) => {
    await forgetClaudeAccount(uuid);
    hub.invalidate();
    await refresh(true);
    return (await listClaudeAccounts()).map(({ token, ...rest }) => rest);
  });
  ipcMain.handle("settings:get", () => ({
    providers: hub.providers(),
    values: settings.read().providers ?? {},
    app: { ...appPrefs(), launchAtLogin: app.getLoginItemSettings().openAtLogin },
  }));
  ipcMain.handle("settings:save", async (_e, data) => {
    for (const [id, patch] of Object.entries(data.providers ?? {})) settings.set(id, patch);
    if (data.app) {
      const { launchAtLogin, ...rest } = data.app;
      if (typeof launchAtLogin === "boolean") app.setLoginItemSettings({ openAtLogin: launchAtLogin });
      // setPrefs, not setApp: a layout or theme picked here should land on the
      // pill as the dialog closes, not after the refresh below has answered.
      setPrefs(rest);
      if (rest.pillVisible === false) hidePill();
      else if (rest.pillVisible === true) showPill();
    }
    hub.invalidate(); // a new key must be tried at once, not after the cache expires
    await refresh(true);
    return true;
  });
  ipcMain.on("settings:open", () => openPrefs());
  ipcMain.on("settings:close", () => prefsWindow?.close());
  ipcMain.on("open-external", (_e, url) => {
    if (/^https?:\/\//.test(String(url))) shell.openExternal(url);
  });
  ipcMain.on("app:quit", () => app.quit());
}

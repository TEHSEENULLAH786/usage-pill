const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pill", {
  platform: process.platform,
  get: (refresh = false) => ipcRenderer.invoke("usage:get", { refresh }),
  onUsage(cb) {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("usage", handler);
    return () => ipcRenderer.off("usage", handler);
  },
  setPrefs: (patch) => ipcRenderer.invoke("prefs:set", patch),
  size: (width, height) => ipcRenderer.send("pill:size", { width, height }),
  bounds: () => ipcRenderer.invoke("pill:bounds"),
  move: (x, y) => ipcRenderer.send("pill:move", { x, y }),
  moved: () => ipcRenderer.send("pill:moved"),
  toggleDetail: () => ipcRenderer.send("pill:toggle-detail"),
  detailSize: (height) => ipcRenderer.send("detail:size", { height }),
  closeDetail: () => ipcRenderer.send("detail:close"),
  option: (id, key) => ipcRenderer.invoke("option:get", { id, key }),
  setOption: (id, key, value) => ipcRenderer.invoke("option:set", { id, key, value }),
  accounts: () => ipcRenderer.invoke("accounts:list"),
  forgetAccount: (uuid) => ipcRenderer.invoke("accounts:forget", uuid),
  settings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (data) => ipcRenderer.invoke("settings:save", data),
  openSettings: () => ipcRenderer.send("settings:open"),
  closeSettings: () => ipcRenderer.send("settings:close"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  quit: () => ipcRenderer.send("app:quit"),
});

/* Bridge between the page and the desktop shell. The page sees window.nmc; without it
   (opened in a plain browser for design work) the app falls back to browser storage + Dry run. */
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nmc", {
  desktop: true,
  info: () => ipcRenderer.sendSync("app:info"),
  readData: () => ipcRenderer.sendSync("data:read"),
  writeData: json => ipcRenderer.send("data:write", json),
  readLeads: () => ipcRenderer.invoke("leads:read"),
  writeLeads: json => ipcRenderer.send("leads:write", json),
  flush: () => ipcRenderer.invoke("data:flush"),
  openDataFolder: () => ipcRenderer.invoke("data:openFolder"),
  openOutbox: id => ipcRenderer.invoke("outbox:open", id),
  openCsv: () => ipcRenderer.invoke("file:openCsv"),
  saveText: (defaultName, text, ext) => ipcRenderer.invoke("file:saveText", { defaultName, text, ext }),
  readSample: () => ipcRenderer.invoke("file:sample"),
  showItem: p => ipcRenderer.invoke("file:showItem", p),
  providers: () => ipcRenderer.invoke("providers:catalog"),
  hasSecrets: id => ipcRenderer.invoke("secrets:has", id),
  setSecret: (provider, key, value) => ipcRenderer.invoke("secrets:set", { provider, key, value }),
  testProvider: id => ipcRenderer.invoke("providers:test", id),
  send: {
    start: id => ipcRenderer.invoke("send:start", id),
    pause: () => ipcRenderer.invoke("send:pause"),
    cancel: id => ipcRenderer.invoke("send:cancel", id),
    status: id => ipcRenderer.invoke("send:status", id),
    log: id => ipcRenderer.invoke("send:log", id),
    test: (id, leadKey, to, variant) => ipcRenderer.invoke("send:test", id, leadKey, to, variant),
    sendRemainder: (id, winner) => ipcRenderer.invoke("send:remainder", id, winner),
    onProgress: fn => ipcRenderer.on("send:progress", (e, s) => fn(s)),
    onDone: fn => ipcRenderer.on("send:done", (e, s) => fn(s)),
  },
  update: {
    install: () => ipcRenderer.invoke("update:install"),
    openReleases: () => ipcRenderer.invoke("update:openReleases"),
    onStatus: fn => ipcRenderer.on("update:status", (e, s) => fn(s)),
  },
});

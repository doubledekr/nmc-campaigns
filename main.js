/* NMC Campaigns — desktop shell (Electron main process).
   Owns the data files, the encrypted API keys and the send queue. The page (app/) never sees a key
   and never talks to an email service directly; it asks this process to send.
   Data folder:  Windows %APPDATA%\NMC Campaigns\   macOS ~/Library/Application Support/NMC Campaigns/
     campaigns-data.json   settings, campaigns, suppression list, column-map presets
     leads.json            imported leads (client data — never commit, never sync)
     secrets.json          API keys, encrypted with the OS keychain (safeStorage)
     sends/                per-campaign send logs + daily send counts
     outbox/               Dry-run output (.eml + .html per email) */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } = require("electron");
const fs = require("fs"), path = require("path");
const providers = require("./main/providers");
const { SendQueue } = require("./main/queue");

app.setName("NMC Campaigns");

function dataDir() {
  try { const portable = path.join(path.dirname(process.execPath), "data"); if (fs.existsSync(portable)) { fs.accessSync(portable, fs.constants.W_OK); return portable; } } catch (e) {}
  const d = app.getPath("userData"); fs.mkdirSync(d, { recursive: true }); return d;
}
const F = n => path.join(dataDir(), n);

/* ---- atomic JSON files with a rolling backup ---- */
const pending = {};
function writeSoon(name, json) {
  pending[name] = json; if (pending["t_" + name]) return;
  pending["t_" + name] = setTimeout(() => { delete pending["t_" + name]; flush(name); }, 300);
}
function flush(name) {
  if (pending[name] == null) return; const f = F(name), tmp = f + ".tmp";
  try { fs.writeFileSync(tmp, pending[name]); if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak"); fs.renameSync(tmp, f); cache.delete(name); } catch (e) { console.error("save failed", name, e); }
  delete pending[name];
}
function flushAll() { for (const k of Object.keys(pending)) if (k.startsWith("t_")) { clearTimeout(pending[k]); delete pending[k]; } for (const n of ["campaigns-data.json", "leads.json"]) flush(n); }
const cache = new Map();
function readJson(name, fallback) {
  if (pending[name] != null) { try { return JSON.parse(pending[name]); } catch (e) {} }
  const f = F(name); let st; try { st = fs.statSync(f); } catch (e) { return fallback; }
  const c = cache.get(name); if (c && c.mtime === st.mtimeMs) return c.value;
  try { const v = JSON.parse(fs.readFileSync(f, "utf8")); cache.set(name, { mtime: st.mtimeMs, value: v }); return v; } catch (e) { return fallback; }
}
const loadState = () => readJson("campaigns-data.json", {});
const loadLeads = () => { const d = readJson("leads.json", null); return d && d.leads || []; };

/* ---- API keys: encrypted with the OS keychain; the page can set or clear them, never read them ---- */
function secretsFile() { try { return JSON.parse(fs.readFileSync(F("secrets.json"), "utf8")); } catch (e) { return {}; } }
function saveSecrets(s) { fs.writeFileSync(F("secrets.json"), JSON.stringify(s, null, 1)); try { fs.chmodSync(F("secrets.json"), 0o600); } catch (e) {} }
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch (e) { return false; } };
function setSecret(provider, key, value) {
  const s = secretsFile(); s[provider] = s[provider] || {};
  if (!value) delete s[provider][key];
  else s[provider][key] = canEncrypt() ? { enc: safeStorage.encryptString(String(value)).toString("base64") } : { plain: String(value) };
  saveSecrets(s); return hasSecrets(provider);
}
function hasSecrets(provider) { const s = secretsFile()[provider] || {}; return Object.fromEntries(Object.keys(s).map(k => [k, true])); }
function getSecrets(provider) {
  const s = secretsFile()[provider] || {}, out = {};
  for (const [k, v] of Object.entries(s)) { try { out[k] = v.enc ? safeStorage.decryptString(Buffer.from(v.enc, "base64")) : v.plain; } catch (e) { out[k] = ""; } }
  return out;
}
function providerCreds(id) { const st = loadState().settings || {}; return { cfg: (st.providerCfg || {})[id] || {}, secrets: getSecrets(id) }; }

let queue = null, mainWin = null;

/* ---- IPC ---- */
ipcMain.on("data:read", e => { e.returnValue = fs.existsSync(F("campaigns-data.json")) ? fs.readFileSync(F("campaigns-data.json"), "utf8") : null; });
ipcMain.on("data:write", (e, json) => writeSoon("campaigns-data.json", json));
ipcMain.handle("leads:read", () => { flush("leads.json"); try { return fs.readFileSync(F("leads.json"), "utf8"); } catch (e) { return null; } });
ipcMain.on("leads:write", (e, json) => writeSoon("leads.json", json));
ipcMain.handle("data:flush", () => { flushAll(); return true; });
ipcMain.on("app:info", e => { e.returnValue = { version: app.getVersion(), dataDir: dataDir(), encrypted: canEncrypt(), platform: process.platform }; });
ipcMain.handle("data:openFolder", () => shell.openPath(dataDir()));
ipcMain.handle("outbox:open", (e, id) => { const d = path.join(dataDir(), "outbox", String(id || "").replace(/[^\w-]/g, "_")); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });

ipcMain.handle("file:openCsv", async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: "Import leads", filters: [{ name: "Lead files", extensions: ["csv", "txt", "tsv"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null; const p = r.filePaths[0];
  return { name: path.basename(p), text: fs.readFileSync(p, "utf8") };
});
ipcMain.handle("file:saveText", async (e, { defaultName, text, ext }) => {
  const r = await dialog.showSaveDialog(mainWin, { defaultPath: defaultName, filters: [{ name: (ext || "txt").toUpperCase(), extensions: [ext || "txt"] }] });
  if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, text); return r.filePath;
});
ipcMain.handle("file:sample", () => { try { return fs.readFileSync(path.join(__dirname, "samples", "sample-leads.csv"), "utf8"); } catch (e) { return null; } });
ipcMain.handle("file:showItem", (e, p) => { shell.showItemInFolder(p); return true; });

ipcMain.handle("providers:catalog", () => providers.catalog());
ipcMain.handle("secrets:has", (e, id) => hasSecrets(id));
ipcMain.handle("secrets:set", (e, { provider, key, value }) => setSecret(provider, key, value));
ipcMain.handle("providers:test", async (e, id) => {
  flushAll(); const p = providers.byId[id]; if (!p) return { ok: false, detail: "Unknown service" };
  if (!p.test) return { ok: true, detail: "This service has no credentials check — send a test email to confirm." };
  const c = providerCreds(id); try { return await p.test(c.cfg, c.secrets); } catch (err) { return { ok: false, detail: err.message }; }
});

const wrap = fn => async (e, ...a) => { try { flushAll(); return { ok: true, value: await fn(...a) }; } catch (err) { return { ok: false, error: err.message }; } };
ipcMain.handle("send:start", wrap(id => queue.start(id)));
ipcMain.handle("send:pause", wrap(() => queue.pause("Paused")));
ipcMain.handle("send:cancel", wrap(id => queue.cancel(id)));
ipcMain.handle("send:status", wrap(id => queue.status(id)));
ipcMain.handle("send:log", wrap(id => queue.log(id)));
ipcMain.handle("send:test", wrap((id, key, to, variant) => queue.testSend(id, key, to, variant)));
ipcMain.handle("send:remainder", wrap((id, winner) => queue.sendRemainder(id, winner)));

/* ---- updates from GitHub Releases (same mechanism as the NMC Toolkit) ---- */
const RELEASES_URL = "https://github.com/doubledekr/nmc-campaigns/releases/latest";
let updater = null, pendingVersion = null;
function setupUpdates() {
  if (process.env.NMC_NO_UPDATES || !app.isPackaged) return;
  try { updater = require("electron-updater").autoUpdater; } catch (e) { return; }
  updater.autoDownload = process.platform !== "darwin"; updater.autoInstallOnAppQuit = true;
  const send = s => mainWin && mainWin.webContents.send("update:status", s);
  updater.on("error", () => { if (pendingVersion) send({ state: "manual", version: pendingVersion, url: RELEASES_URL }); });
  updater.on("update-available", i => { pendingVersion = i.version; send(process.platform === "darwin" ? { state: "manual", version: i.version, url: RELEASES_URL } : { state: "downloading", version: i.version }); });
  updater.on("update-downloaded", i => send({ state: "ready", version: i.version }));
  const check = () => { try { updater.checkForUpdates().catch(() => {}); } catch (e) {} };
  setTimeout(check, 8000); setInterval(check, 60 * 60 * 1000);
}
ipcMain.handle("update:install", () => { if (!updater) return false; if (queue && queue.job && queue.job.status === "running") queue.pause("Paused to install an update"); flushAll(); setTimeout(() => updater.quitAndInstall(false, true), 300); return true; });
ipcMain.handle("update:openReleases", () => shell.openExternal(RELEASES_URL));

function createWindow() {
  mainWin = new BrowserWindow({ width: 1400, height: 920, minWidth: 1000, minHeight: 640, title: "NMC Campaigns " + app.getVersion(), backgroundColor: "#FBF8F2",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  mainWin.loadFile(path.join(__dirname, "app", "index.html"));
  mainWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:|^mailto:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  mainWin.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); } });
  mainWin.on("close", e => {
    if (queue && queue.job && queue.job.status === "running") {
      const c = dialog.showMessageBoxSync(mainWin, { type: "warning", buttons: ["Pause and quit", "Keep sending"], defaultId: 1, cancelId: 1, message: "A campaign is still sending.", detail: "If you quit, it pauses and you can resume it next time you open the app. Nobody gets emailed twice." });
      if (c === 1) { e.preventDefault(); return; } queue.pause("Paused when the app was closed");
    }
    flushAll();
  });
}

app.whenReady().then(() => {
  queue = new SendQueue({ dataDir: dataDir(), loadState, loadLeads, providerCreds });
  queue.recover();
  queue.on("progress", s => mainWin && !mainWin.isDestroyed() && mainWin.webContents.send("send:progress", s));
  queue.on("done", s => mainWin && !mainWin.isDestroyed() && mainWin.webContents.send("send:done", s));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "NMC Campaigns", submenu: [{ role: "about" }, { type: "separator" }, { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]));
  createWindow(); setupUpdates();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", flushAll);
app.on("window-all-closed", () => { flushAll(); if (process.platform !== "darwin") app.quit(); });

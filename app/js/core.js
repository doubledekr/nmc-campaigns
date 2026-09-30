/* Core: state, storage, helpers, and the shared per-campaign analysis cache. */
(function () {
  "use strict";
  const N = window.NMC;
  const desktop = !!(window.nmc && window.nmc.desktop);
  const App = window.App = { N, desktop, screens: {} };

  /* ---------- defaults ---------- */
  const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  App.todayISO = todayISO;
  App.defaultSettings = () => ({
    company: "Neighborhood Mortgage Company", companyNmls: "2484730", companyPhone: "844-210-3644", address: "", tagline: "Modern Mortgages, Human Approach.",
    website: "https://neighborhoodmc.com", logoUrl: "", ctaUrl: "", disclaimer: "", whyReceiving: "",
    senderMode: "company",
    defaultSender: { name: "", title: "Loan Officer", email: "", phone: "", nmls: "", ctaUrl: "" },
    bankers: [],
    licensedStates: ["AL", "AZ", "CA", "FL", "GA", "IN", "MD", "MI", "NC", "OH", "SC", "TN", "TX", "WA"],
    rates: { asOf: todayISO(), table: { Conventional: { 30: null, 20: null, 15: null }, FHA: { 30: null, 15: null }, VA: { 30: null, 15: null }, USDA: { 30: null }, Jumbo: { 30: null }, Second: { 10: null, 15: null, 20: null, 30: null } } },
    provider: "dryrun", providerCfg: {},
    from: { fromEmail: "", fromNameTpl: "{{banker_name}} | Neighborhood Mortgage", replyToMode: "banker", replyTo: "", listUnsubMailto: "", oneClick: false, ratePerMinute: 30, dailyCap: 500, authConfirmed: false, warmedUp: false, testTo: "" },
    unsubscribeUrl: "",
  });
  App.newCampaign = (name) => N.ab.ensure({
    id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || "Untitled campaign", created: new Date().toISOString(),
    offer: JSON.parse(JSON.stringify(N.loanmath.DEFAULT_OFFER)), filters: JSON.parse(JSON.stringify(N.filters.EMPTY)), selected: [],
    subject: "{{first_name}}, your payment could drop by {{monthly_savings}}",
    preheader: "I ran your loan against today’s rates — here’s what it could look like.",
    body: "Hi {{first_name|there}},\n\nRates have moved since you took out your loan, so I ran the numbers on your {{city|}} home. Here’s what a refinance could look like for you — the full breakdown is below.\n\nIf it’s worth a conversation, just reply to this email or pick a time that works for you.",
    ctaText: "Pick a time to talk", ctaUrl: "{{cta_url}}", sections: Object.assign({}, N.emailtpl.DEFAULT_SECTIONS), step: "audience",
  });

  /* ---------- storage ---------- */
  const LS_STATE = "nmc-campaigns-state", LS_LEADS = "nmc-campaigns-leads";
  function deepMerge(base, over) { if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
    const o = Object.assign({}, base); for (const k of Object.keys(over)) o[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) && base[k] !== null ? deepMerge(base[k], over[k]) : over[k]; return o; }
  App.load = async function () {
    let raw = null; try { raw = desktop ? window.nmc.readData() : localStorage.getItem(LS_STATE); } catch (e) {}
    let s = {}; try { s = raw ? JSON.parse(raw) : {}; } catch (e) { s = {}; }
    App.S = { settings: deepMerge(App.defaultSettings(), s.settings || {}), campaigns: s.campaigns || [], suppression: s.suppression || [], presets: s.presets || [], watchlist: s.watchlist || [], ui: s.ui || { screen: "leads" } };
    for (const c of App.S.campaigns) { N.ab.ensure(c); c.offer = deepMerge(N.loanmath.DEFAULT_OFFER, c.offer || {}); c.filters = Object.assign({}, N.filters.EMPTY, c.filters || {}); c.sections = Object.assign({}, N.emailtpl.DEFAULT_SECTIONS, c.sections || {}); c.selected = c.selected || []; }
    let lraw = null; try { lraw = desktop ? await window.nmc.readLeads() : localStorage.getItem(LS_LEADS); } catch (e) {}
    let L = {}; try { L = lraw ? JSON.parse(lraw) : {}; } catch (e) {}
    App.L = { imports: L.imports || [], leads: L.leads || [] };
    App.reindex();
  };
  let saveT = null;
  App.save = function () { clearTimeout(saveT); saveT = setTimeout(App.saveNow, 250); };
  App.saveNow = function () {
    clearTimeout(saveT); const json = JSON.stringify(App.S);
    if (desktop) window.nmc.writeData(json); else try { localStorage.setItem(LS_STATE, json); } catch (e) {}
  };
  App.saveLeads = function () {
    const json = JSON.stringify(App.L);
    if (desktop) window.nmc.writeLeads(json); else try { localStorage.setItem(LS_LEADS, json); } catch (e) { App.toast("Browser storage is full — leads are kept until you close this tab. Use the desktop app for large lists."); }
    App.reindex(); App.invalidate();
  };
  App.reindex = function () { App.byKey = new Map(App.L.leads.map(l => [N.campaign.keyOf(l), l])); };

  /* ---------- per-campaign analysis cache (offer + rates + settings that affect results) ---------- */
  const cache = new Map();
  App.invalidate = () => cache.clear();
  function sig(c) { const s = App.S.settings; return JSON.stringify([c.offer, s.rates, s.senderMode, s.licensedStates, s.bankers.map(b => [b.name, b.email, b.aliases, b.states]), App.S.suppression.length, App.L.leads.length]); }
  App.prep = function (c) {
    const k = c.id + "|" + sig(c); let m = cache.get(k);
    if (!m) { for (const key of [...cache.keys()]) if (key.startsWith(c.id + "|")) cache.delete(key);
      const suppressed = new Set(App.S.suppression.map(e => String(e).toLowerCase()));
      m = new Map(); for (const l of App.L.leads) m.set(N.campaign.keyOf(l), N.campaign.prepare(l, c, App.S, { suppressed })); cache.set(k, m); }
    return m;
  };
  App.cur = () => App.S.campaigns.find(c => c.id === App.S.ui.campaignId) || null;

  /* ---------- watchlist evaluation (re-run whenever rates, leads, suppression or licensing change) ---------- */
  let wCache = null;
  App.watchRows = function () {
    const s = App.S.settings, today = N.loanmath.todayISO();
    const sig = JSON.stringify([s.rates, s.licensedStates, s.senderMode, App.S.suppression.length, App.L.leads.length, App.S.watchlist.length, App.S.watchlist.map(e => e.status + e.campaignId).join(), today]);
    if (wCache && wCache.sig === sig) return wCache.rows;
    const suppressed = new Set(App.S.suppression.map(e => String(e).toLowerCase()));
    const camps = new Set(App.S.campaigns.map(c => c.id));
    const rows = App.S.watchlist.filter(e => e.status !== "removed").map(e => {
      if (e.status === "campaign" && !camps.has(e.campaignId)) { e.status = "watching"; e.campaignId = null; }   /* its campaign was deleted: back on watch */
      const lead = App.byKey.get(e.key);
      const ev = N.watchlist.evaluate(e, lead, s.rates, today);
      const block = lead ? N.campaign.prepare(lead, { id: "watch", offer: e.offer, subject: "", body: "" }, App.S, { suppressed }).block : "";
      if (ev.status === "ready" && !e.readyAt) e.readyAt = new Date().toISOString();
      return { e, lead, ev, block, ready: ev.status === "ready" && !block && e.status === "watching" };
    });
    wCache = { sig, rows }; return rows;
  };

  /* ---------- helpers ---------- */
  App.$ = id => document.getElementById(id);
  App.esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  App.money = v => v == null || !isFinite(v) ? "—" : (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
  App.pct = v => v == null || !isFinite(v) ? "—" : (+v).toFixed(3).replace(/0$/, "") + "%";
  App.int = v => v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US");
  App.plural = (n, w, ws) => n.toLocaleString("en-US") + " " + (n === 1 ? w : ws || w + "s");
  App.num = v => v === "" || v == null || !isFinite(+v) ? null : +v;
  let toastT = null;
  App.toast = function (msg, ms) { let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = "block"; clearTimeout(toastT); toastT = setTimeout(() => t.style.display = "none", ms || 3200); };
  App.modal = function (title, bodyHtml, buttons, opts) {
    opts = opts || {}; const back = document.createElement("div"); back.className = "modal-back";
    back.innerHTML = `<div class="modal" style="${opts.width ? "width:min(" + opts.width + "px,100%)" : ""}"><div class="mh"><h2>${title}</h2><span class="spacer"></span><button class="btn ghost sm" data-x>Close</button></div><div class="mb">${bodyHtml}</div><div class="mf">${(buttons || []).map((b, i) => `<button class="btn ${b.cls || ""}" data-b="${i}">${b.label}</button>`).join("")}</div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector("[data-x]").onclick = close;
    back.addEventListener("mousedown", e => { if (e.target === back && !opts.sticky) close(); });
    back.querySelectorAll("[data-b]").forEach(el => el.onclick = async () => { const b = buttons[+el.dataset.b]; const r = b.onClick ? await b.onClick(back) : true; if (r !== false) close(); });
    if (opts.onOpen) opts.onOpen(back);
    return { el: back, close };
  };
  App.confirm = (title, html, okLabel, cls) => new Promise(res => App.modal(title, html, [{ label: "Cancel", onClick: () => res(false) }, { label: okLabel || "OK", cls: cls || "primary", onClick: () => res(true) }], { width: 560 }));
  App.download = async function (name, text, ext) {
    if (desktop) { const p = await window.nmc.saveText(name, text, ext); if (p) App.toast("Saved " + p.split(/[\\/]/).pop()); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  App.go = function (screen, extra) { Object.assign(App.S.ui, { screen }, extra || {}); App.save(); App.render(); document.getElementById("main").scrollTop = 0; };

  /* ---------- sidebar ---------- */
  App.renderSide = function () {
    const ui = App.S.ui, e = App.esc;
    const camps = App.S.campaigns.slice().sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    const wrows = App.watchRows(); const readyN = wrows.filter(r => r.ready).length; const watchN = wrows.filter(r => r.e.status === "watching").length;
    if (App._readyN != null && readyN > App._readyN) { App.save(); setTimeout(() => App.toast("Rates moved: " + App.plural(readyN - App._readyN, "watchlist lead") + " just became eligible", 6000), 50); }
    App._readyN = readyN;
    App.$("side").innerHTML = `
      <div class="wordmark"><div class="co">Neighborhood Mortgage</div><div class="sub">Campaigns</div></div>
      <button class="nav ${ui.screen === "leads" ? "on" : ""}" data-go="leads">Leads <span class="n">${App.L.leads.length.toLocaleString()}</span></button>
      <button class="nav ${ui.screen === "campaigns" ? "on" : ""}" data-go="campaigns">Campaigns <span class="n">${camps.length}</span></button>
      <button class="nav ${ui.screen === "watchlist" ? "on" : ""}" data-go="watchlist">Watchlist ${readyN ? `<span class="n" style="background:var(--good);color:#fff">${readyN} ready</span>` : `<span class="n">${watchN.toLocaleString()}</span>`}</button>
      ${camps.length ? `<div class="navgroup">Recent</div>` + camps.slice(0, 8).map(c => `<button class="nav navcamp ${ui.screen === "campaign" && ui.campaignId === c.id ? "on" : ""}" data-camp="${c.id}"><span class="dot ${c.sendState || ""}"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(c.name)}</span></button>`).join("") : ""}
      <div class="grow"></div>
      <button class="nav ${ui.screen === "settings" ? "on" : ""}" data-go="settings">Settings</button>
      <div class="foot">${desktop ? "Version " + e(window.nmc.info().version) : "Browser preview — sending is available in the desktop app"}</div>`;
    App.$("side").querySelectorAll("[data-go]").forEach(b => b.onclick = () => App.go(b.dataset.go));
    App.$("side").querySelectorAll("[data-camp]").forEach(b => b.onclick = () => App.go("campaign", { campaignId: b.dataset.camp }));
  };
  App.render = function () {
    App.renderSide();
    const s = App.S.ui.screen; const fn = App.screens[s] || App.screens.leads;
    fn(App.$("main"));
  };

  /* generic "state-path" binding: <input data-bind="settings.from.fromEmail"> keeps App.S in sync */
  App.getPath = (obj, p) => p.split(".").reduce((o, k) => o == null ? o : o[k], obj);
  App.setPath = (obj, p, v) => { const ks = p.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; };
  App.bind = function (root, base, onChange) {
    root.querySelectorAll("[data-bind]").forEach(el => {
      const p = el.dataset.bind; const v = App.getPath(base, p);
      if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : v;
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => {
        let nv = el.type === "checkbox" ? el.checked : el.value;
        if (el.type === "number" || el.dataset.num != null) nv = App.num(el.value);
        App.setPath(base, p, nv); App.save(); if (onChange) onChange(p, nv, el);
      });
    });
  };
})();

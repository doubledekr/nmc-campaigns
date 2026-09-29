/* Leads screen: import CSVs, map columns, browse the lead list, manage the suppression list. */
(function () {
  "use strict";
  const { N, $, esc, money, pct, int } = App;
  const PAGE = 100;

  App.screens.leads = function (el) {
    const L = App.L.leads, ui = App.S.ui;
    if (!L.length) {
      el.innerHTML = `<div class="screen"><div class="head"><div><h1>Leads</h1><div class="lede">Import a CSV export of leads. Columns are matched automatically, and you can save the mapping so the same export format imports in one click next time.</div></div></div>
        <div class="drop" id="drop"><h2 style="font-size:21px;margin-bottom:6px;color:var(--ink)">Drop a lead CSV here</h2>
        <div>or</div><div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="pick">Choose a file…</button><button class="btn" id="sample">Load sample leads</button></div>
        <div class="small faint" style="margin-top:14px">Comma, tab or semicolon separated. Lead data stays on this computer.</div></div>
        ${suppressionPanel()}</div>`;
      wireDrop(); wireSuppression();
      $("pick").onclick = pickFile; $("sample").onclick = loadSample;
      return;
    }
    const q = (ui.leadQ || "").toLowerCase();
    let rows = q ? L.filter(l => [l.name, l.email, l.city, l.state, l.leadId, l.loanType, l.banker, l.source].join(" ").toLowerCase().includes(q)) : L;
    const sortK = ui.leadSort || "", dir = ui.leadDir || 1;
    if (sortK) rows = rows.slice().sort((a, b) => { const x = a[sortK], y = b[sortK]; if (x == null || x === "") return 1; if (y == null || y === "") return -1; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir; });
    const page = Math.min(ui.leadPage || 0, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
    const warnN = L.filter(l => !l.emailValid).length;
    const withDebt = L.filter(l => l.debtBalance > 0).length;
    const avgRate = L.filter(l => l.rate).reduce((s, l, i, a) => s + l.rate / a.length, 0);
    const cols = [["name", "Name"], ["email", "Email"], ["state", "State"], ["loanType", "Type"], ["rate", "Rate", 1], ["balance", "Balance", 1], ["value", "Value", 1], ["ltv", "LTV", 1], ["equity", "Equity", 1], ["debtBalance", "Other debt", 1], ["fico", "FICO", 1], ["banker", "Banker"], ["source", "Source"]];
    el.innerHTML = `<div class="screen">
      <div class="head"><div><h1>Leads</h1><div class="lede">${App.plural(L.length, "lead")} from ${App.plural(App.L.imports.length, "import")}. Campaigns choose their audience from this list.</div></div>
        <div class="actions"><button class="btn" id="exp">Export CSV</button><button class="btn danger" id="clear">Clear all leads</button><button class="btn primary" id="pick">Import CSV…</button></div></div>
      <div class="stats">
        <div class="stat"><div class="v">${L.length.toLocaleString()}</div><div class="l">Leads</div></div>
        <div class="stat"><div class="v">${avgRate ? pct(avgRate) : "—"}</div><div class="l">Average current rate</div></div>
        <div class="stat"><div class="v">${withDebt.toLocaleString()}</div><div class="l">With other debt on file</div></div>
        <div class="stat"><div class="v ${warnN ? "brand" : ""}">${warnN.toLocaleString()}</div><div class="l">Missing or invalid email</div></div>
        <div class="stat"><div class="v">${App.S.suppression.length.toLocaleString()}</div><div class="l">On suppression list</div></div>
      </div>
      <div class="panel" style="padding:12px 14px">
        <div class="row" style="margin-bottom:10px"><input type="search" id="lq" placeholder="Search name, email, city, lead ID, banker…" style="max-width:380px" value="${esc(ui.leadQ || "")}">
          <span class="small muted">${rows.length.toLocaleString()} shown</span><span class="spacer"></span>
          <span class="small muted">Imports:</span>${App.L.imports.slice(-4).map(i => `<span class="tag info" title="${esc(i.file)}">${esc(i.file.length > 26 ? i.file.slice(0, 24) + "…" : i.file)} · ${i.added}</span>`).join(" ")}</div>
        <div class="tablewrap" style="max-height:calc(100vh - 360px)"><table class="data"><thead><tr>${cols.map(([k, t, n]) => `<th class="sort ${n ? "num" : ""}" data-sort="${k}">${t}${sortK === k ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}<th>Notes</th></tr></thead><tbody>
        ${rows.slice(page * PAGE, page * PAGE + PAGE).map(l => `<tr><td>${esc(l.name)}</td><td class="${l.emailValid ? "" : "bad"}">${esc(l.email || "(none)")}</td><td>${esc(l.state)}</td><td>${esc(l.loanType)}</td>
          <td class="num">${pct(l.rate)}</td><td class="num">${money(l.balance)}${l._balanceEst ? "*" : ""}</td><td class="num">${money(l.value)}</td><td class="num">${l.ltv != null ? l.ltv.toFixed(1) + "%" : "—"}</td><td class="num">${money(l.equity)}</td>
          <td class="num">${l.debtBalance ? money(l.debtBalance) : ""}</td><td class="num">${l.fico || ""}</td><td>${esc(l.banker)}</td><td>${esc(l.source)}</td>
          <td class="small warnc">${esc((l._warn || []).join("; "))}${l.optOut ? '<span class="tag block">Opted out</span>' : ""}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="pager"><button class="btn sm" id="pp" ${page ? "" : "disabled"}>‹ Prev</button><span>Page ${page + 1} of ${Math.max(1, Math.ceil(rows.length / PAGE))}</span><button class="btn sm" id="np" ${(page + 1) * PAGE < rows.length ? "" : "disabled"}>Next ›</button><span class="spacer"></span><span>* estimated from original amount and close date</span></div>
      </div>
      ${suppressionPanel()}</div>`;
    let qt = null;
    $("lq").oninput = e => { clearTimeout(qt); qt = setTimeout(() => { ui.leadQ = e.target.value; ui.leadPage = 0; App.render(); const i = $("lq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 200); };
    el.querySelectorAll("[data-sort]").forEach(th => th.onclick = () => { const k = th.dataset.sort; ui.leadDir = ui.leadSort === k ? -(ui.leadDir || 1) : 1; ui.leadSort = k; App.save(); App.render(); });
    $("pp").onclick = () => { ui.leadPage = page - 1; App.render(); }; $("np").onclick = () => { ui.leadPage = page + 1; App.render(); };
    $("pick").onclick = pickFile;
    $("clear").onclick = async () => { if (await App.confirm("Clear all leads?", `<p>This removes all ${App.plural(L.length, "lead")} from the app. Campaigns keep their settings, but their audiences will be empty until you import again. Send logs are kept.</p>`, "Clear leads", "primary")) { App.L = { imports: [], leads: [] }; App.saveLeads(); App.render(); } };
    $("exp").onclick = () => { const hs = ["leadId", "firstName", "lastName", "email", "phone", "address", "city", "state", "zip", "loanType", "rate", "balance", "payment", "value", "ltv", "equity", "debtBalance", "debtPayment", "fico", "banker", "source", "region"];
      App.download("nmc-leads-" + App.todayISO() + ".csv", N.csv.stringify(hs, rows), "csv"); };
    wireSuppression();
  };

  /* ---------- import ---------- */
  async function pickFile() {
    if (App.desktop) { const f = await window.nmc.openCsv(); if (f) startImport(f.name, f.text); return; }
    const i = document.createElement("input"); i.type = "file"; i.accept = ".csv,.txt,.tsv"; i.onchange = () => readFile(i.files[0]); i.click();
  }
  function readFile(file) { if (!file) return; const r = new FileReader(); r.onload = () => startImport(file.name, r.result); r.readAsText(file); }
  function wireDrop() {
    const d = $("drop"); if (!d) return;
    d.ondragover = e => { e.preventDefault(); d.classList.add("over"); }; d.ondragleave = () => d.classList.remove("over");
    d.ondrop = e => { e.preventDefault(); d.classList.remove("over"); readFile(e.dataTransfer.files[0]); };
  }
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", e => { if (!e.target.closest || !e.target.closest("#drop")) { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f && /\.(csv|txt|tsv)$/i.test(f.name)) readFile(f); } });
  async function loadSample() {
    try { const text = App.desktop ? await window.nmc.readSample() : await (await fetch("../samples/sample-leads.csv")).text(); if (!text) throw 0; startImport("sample-leads.csv", text); }
    catch (e) { App.toast("Couldn’t load the sample file"); }
  }

  function startImport(fileName, text) {
    const parsed = N.csv.parse(text);
    if (!parsed.records.length) { App.toast("That file has no rows"); return; }
    const sigH = N.fields.headerSignature(parsed.headers);
    const preset = App.S.presets.find(p => p.sig === sigH);
    let map = preset ? Object.assign({}, preset.map) : N.fields.guessMap(parsed.headers);
    const sample = parsed.records.slice(0, 3);
    const opts = h => `<option value="">— not in this file —</option>` + parsed.headers.map(x => `<option ${x === h ? "selected" : ""}>${esc(x)}</option>`).join("");
    const unmapped = () => parsed.headers.filter(h => !Object.values(map).includes(h));
    const body = () => `
      ${preset ? `<div class="callout good">Recognized this export format — using the saved mapping “${esc(preset.name)}”.</div>` : `<div class="callout info">Columns were matched by their names. Check the ones that matter for your offer — <b>Email</b>, <b>State</b>, <b>Rate</b>, <b>Balance</b>, <b>Value</b> and any debt columns.</div>`}
      <div class="small muted" style="margin-bottom:8px"><b>${esc(fileName)}</b> · ${App.plural(parsed.records.length, "row")} · ${parsed.headers.length} columns</div>
      <div class="tablewrap"><table class="data maptable"><thead><tr><th>Field</th><th>CSV column</th><th>First rows</th></tr></thead><tbody>
      ${N.fields.FIELDS.map(f => `<tr><td><b>${esc(f.label)}</b>${f.required ? ' <span class="tag block">required</span>' : ""}</td><td style="min-width:220px"><select data-f="${f.key}">${opts(map[f.key])}</select></td>
        <td class="small muted" data-s="${f.key}">${sample.map(r => map[f.key] ? esc(String(r[map[f.key]] || "").slice(0, 28)) : "").filter(Boolean).join(" · ")}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="small muted" style="margin-top:10px">Columns not mapped stay available as filters (“More conditions” on a campaign’s audience): <span data-un>${esc(unmapped().join(", ") || "none")}</span></div>
      <hr class="sep"><div class="fields wide">
        <label class="f">Save this mapping as<input type="text" id="presetName" value="${esc(preset ? preset.name : fileName.replace(/\.[^.]+$/, ""))}"><span class="h">Next time a file with the same columns is imported, it maps automatically.</span></label>
        <label class="f">These leads should…<select id="mode"><option value="add">Add to the current list (duplicates by email are updated)</option><option value="replace">Replace the current list</option></select></label>
      </div>`;
    const m = App.modal("Import leads", body(), [
      { label: "Cancel" },
      { label: "Import " + parsed.records.length.toLocaleString() + " leads", cls: "primary", onClick: (back) => {
        if (!map.email) { App.toast("Map the Email column first"); return false; }
        const name = back.querySelector("#presetName").value.trim(); const mode = back.querySelector("#mode").value;
        if (name) { const i = App.S.presets.findIndex(p => p.sig === sigH); const p = { name, sig: sigH, map }; if (i >= 0) App.S.presets[i] = p; else App.S.presets.push(p); }
        finishImport(fileName, parsed, map, mode); } },
    ], { width: 980, sticky: true, onOpen: back => {
      back.querySelectorAll("[data-f]").forEach(s => s.onchange = () => { const k = s.dataset.f; if (s.value) { for (const [kk, v] of Object.entries(map)) if (v === s.value && kk !== k) { delete map[kk]; const o = back.querySelector(`[data-f="${kk}"]`); if (o) o.value = ""; } map[k] = s.value; } else delete map[k];
        back.querySelectorAll("[data-s]").forEach(td => { const kk = td.dataset.s; td.innerHTML = sample.map(r => map[kk] ? esc(String(r[map[kk]] || "").slice(0, 28)) : "").filter(Boolean).join(" · "); });
        back.querySelector("[data-un]").textContent = unmapped().join(", ") || "none"; });
      if (!App.L.leads.length) back.querySelector("#mode").value = "replace";
    } });
  }

  function finishImport(fileName, parsed, map, mode) {
    const today = App.todayISO();
    const incoming = parsed.records.map(r => N.fields.normalizeLead(r, map, { today }));
    incoming.forEach(l => { l._import = fileName; });
    let added = 0, updated = 0;
    if (mode === "replace") { const seen = new Map(); const noEmail = [];   /* same address twice in one file: the later row wins */
      for (const l of incoming) { const e = String(l.email || "").toLowerCase(); if (e) seen.set(e, l); else noEmail.push(l); }
      App.L.leads = [...seen.values(), ...noEmail]; added = App.L.leads.length; App.L.imports = []; }
    else {
      const byEmail = new Map(App.L.leads.map((l, i) => [String(l.email || "").toLowerCase(), i]));
      for (const l of incoming) { const e = String(l.email || "").toLowerCase(); if (e && byEmail.has(e)) { App.L.leads[byEmail.get(e)] = l; updated++; } else { App.L.leads.push(l); if (e) byEmail.set(e, App.L.leads.length - 1); added++; } }
    }
    const dups = incoming.length - new Set(incoming.map(l => String(l.email || "").toLowerCase()).filter(Boolean)).size;
    App.L.imports.push({ file: fileName, date: new Date().toISOString(), added: incoming.length, map });
    App.saveLeads(); App.save();
    App.S.ui.leadPage = 0; App.render();
    App.toast(`Imported ${added.toLocaleString()} new${updated ? ", updated " + updated.toLocaleString() : ""}${dups > 0 ? " · " + dups + " duplicate emails in the file" : ""}`, 4500);
  }

  /* ---------- suppression list ---------- */
  function suppressionPanel() {
    const n = App.S.suppression.length;
    return `<div class="panel"><div class="row"><div><h2>Suppression list</h2><div class="hint" style="margin:0">Addresses that must never be emailed — unsubscribes, bounces and complaints from your email service, and do-not-email requests. Checked before every send.</div></div><span class="spacer"></span>
      <b>${n.toLocaleString()}</b><span class="small muted">addresses</span><button class="btn sm" id="supAdd">Add / import…</button>${n ? '<button class="btn sm" id="supExp">Export</button><button class="btn sm ghost" id="supClr">Clear</button>' : ""}</div></div>`;
  }
  function wireSuppression() {
    const add = $("supAdd"); if (!add) return;
    add.onclick = () => App.modal("Add to suppression list", `<p class="small muted" style="margin-bottom:8px">Paste addresses (any separators), or pick a CSV exported from your email service — every email address in it is added.</p>
      <textarea id="supText" class="code" style="min-height:200px" placeholder="jane@example.com\njohn@example.com"></textarea><div class="row" style="margin-top:8px"><button class="btn sm" id="supFile">Choose CSV…</button><span class="small muted" id="supInfo"></span></div>`,
      [{ label: "Cancel" }, { label: "Add addresses", cls: "primary", onClick: back => {
        const found = (back.querySelector("#supText").value.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[a-z]{2,}/gi) || []).map(e => e.toLowerCase());
        const set = new Set(App.S.suppression); let n = 0; for (const e of found) if (!set.has(e)) { set.add(e); n++; }
        App.S.suppression = [...set]; App.save(); App.invalidate(); App.render(); App.toast(App.plural(n, "address", "addresses") + " added"); } }],
      { width: 620, onOpen: back => { back.querySelector("#supFile").onclick = async () => {
        const put = t => { back.querySelector("#supText").value += "\n" + t; back.querySelector("#supInfo").textContent = ((t.match(/@/g) || []).length) + " addresses found"; };
        if (App.desktop) { const f = await window.nmc.openCsv(); if (f) put(f.text); }
        else { const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const r = new FileReader(); r.onload = () => put(r.result); r.readAsText(i.files[0]); }; i.click(); } }; } });
    const ex = $("supExp"); if (ex) ex.onclick = () => App.download("nmc-suppression-" + App.todayISO() + ".csv", "email\r\n" + App.S.suppression.join("\r\n") + "\r\n", "csv");
    const cl = $("supClr"); if (cl) cl.onclick = async () => { if (await App.confirm("Clear the suppression list?", "<p>Anyone on it could be emailed again. Only do this if you’re about to re-import a complete list from your email service.</p>", "Clear list")) { App.S.suppression = []; App.save(); App.invalidate(); App.render(); } };
  }
})();

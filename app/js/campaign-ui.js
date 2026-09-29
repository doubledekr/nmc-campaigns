/* Campaigns: list, and the five-step editor (Audience → Offer → Message → Check → Send). */
(function () {
  "use strict";
  const { N, $, esc, money, pct } = App;
  const PAGE = 100;
  const STEPS = [["audience", "Audience"], ["offer", "Offer"], ["message", "Message"], ["check", "Check"], ["send", "Send"]];
  const PRODUCTS = {
    refi: { t: "Rate-and-term refinance", d: "Lower rate and payment on the first mortgage. FHA and VA loans are quoted as a Streamline / IRRRL.", term: 30, costs: 4500 },
    cashout: { t: "Debt consolidation refinance", d: "Refinance and pay off the lead’s other debts in one new first mortgage.", term: 30, costs: 5500 },
    second: { t: "Home equity loan", d: "Keep the first mortgage; a fixed second mortgage pays off the other debts.", term: 15, costs: 995 },
  };

  /* ---------- campaign list ---------- */
  App.screens.campaigns = function (el) {
    const cs = App.S.campaigns.slice().sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    el.innerHTML = `<div class="screen"><div class="head"><div><h1>Campaigns</h1><div class="lede">Each campaign is an audience, an offer, and a message. Every lead gets their own proposal inside the email.</div></div>
      <div class="actions"><button class="btn primary" id="newc">New campaign</button></div></div>
      ${cs.length ? `<div class="tablewrap"><table class="data"><thead><tr><th>Campaign</th><th>Offer</th><th class="num">Selected</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
      ${cs.map(c => `<tr><td><a href="#" data-open="${c.id}"><b>${esc(c.name)}</b></a></td><td>${esc(PRODUCTS[c.offer.product].t)} · ${c.offer.term} yr</td><td class="num">${c.selected.length.toLocaleString()}</td>
        <td>${statusTag(c)}</td><td class="small muted">${new Date(c.created).toLocaleDateString()}</td>
        <td class="num"><button class="btn sm" data-open="${c.id}">Open</button> <button class="btn sm ghost" data-dup="${c.id}">Duplicate</button> <button class="btn sm ghost" data-del="${c.id}">Delete</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="panel empty"><h2>No campaigns yet</h2><div>${App.L.leads.length ? "Start one — you’ll pick the audience from your " + App.plural(App.L.leads.length, "lead") + "." : "Import leads first, then create a campaign."}</div><button class="btn primary" id="newc2">New campaign</button></div>`}</div>`;
    const create = () => { const c = App.newCampaign("Campaign " + new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })); App.S.campaigns.push(c); App.go("campaign", { campaignId: c.id }); };
    $("newc").onclick = create; if ($("newc2")) $("newc2").onclick = create;
    el.querySelectorAll("[data-open]").forEach(b => b.onclick = e => { e.preventDefault(); App.go("campaign", { campaignId: b.dataset.open }); });
    el.querySelectorAll("[data-dup]").forEach(b => b.onclick = () => { const src = App.S.campaigns.find(c => c.id === b.dataset.dup); const c = JSON.parse(JSON.stringify(src));
      Object.assign(c, { id: App.newCampaign().id, name: src.name + " (copy)", created: new Date().toISOString(), sendState: "", sendCounts: null, step: "audience" }); App.S.campaigns.push(c); App.save(); App.render(); });
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { const c = App.S.campaigns.find(x => x.id === b.dataset.del);
      if (c.sendState === "sending") { App.toast("Pause and cancel the send first"); return; }
      if (await App.confirm("Delete “" + esc(c.name) + "”?", "<p>The campaign’s settings are removed. Its send log stays in the data folder.</p>", "Delete")) { App.S.campaigns = App.S.campaigns.filter(x => x !== c); App.save(); App.render(); } });
  };
  function statusTag(c) {
    const k = c.sendCounts;
    if (c.sendState === "sending") return `<span class="tag ok">Sending ${k ? k.sent + "/" + k.total : ""}</span>`;
    if (c.sendState === "paused") return `<span class="tag warn">Paused ${k ? k.sent + "/" + k.total : ""}</span>`;
    if (c.sendState === "done") return c.sendDry ? `<span class="tag no">Dry run done</span>` : `<span class="tag info">Sent ${k ? k.sent.toLocaleString() : ""}</span>`;
    if (c.sendState === "cancelled") return `<span class="tag no">Cancelled</span>`;
    return `<span class="tag no">Draft</span>`;
  }

  /* ---------- editor shell ---------- */
  App.screens.campaign = function (el) {
    const c = App.cur(); if (!c) return App.go("campaigns");
    const step = c.step || "audience";
    const idx = STEPS.findIndex(s => s[0] === step);
    el.innerHTML = `<div class="screen">
      <div class="head"><div style="flex:1;min-width:300px"><input type="text" id="cname" value="${esc(c.name)}" style="font-family:var(--serif);font-size:24px;border-color:transparent;background:transparent;padding:2px 6px;margin-left:-8px;max-width:640px">
        <div class="lede" style="margin-left:0">${esc(PRODUCTS[c.offer.product].t)} · ${App.plural(c.selected.length, "lead")} selected · ${statusTag(c)}</div></div></div>
      <div class="steps">${STEPS.map(([k, t], i) => `<button class="step ${k === step ? "on" : i < idx ? "done" : ""}" data-step="${k}"><span class="i">${i < idx ? "✓" : i + 1}</span>${t}</button>`).join("")}</div>
      <div id="stepbody"></div>
      <div class="row" style="margin-top:18px">${idx > 0 ? `<button class="btn" data-step="${STEPS[idx - 1][0]}">‹ ${STEPS[idx - 1][1]}</button>` : ""}<span class="spacer"></span>${idx < STEPS.length - 1 ? `<button class="btn primary" data-step="${STEPS[idx + 1][0]}">Next: ${STEPS[idx + 1][1]} ›</button>` : ""}</div>
    </div>`;
    $("cname").oninput = e => { c.name = e.target.value || "Untitled campaign"; App.save(); App.renderSide(); };
    el.querySelectorAll("[data-step]").forEach(b => b.onclick = () => { c.step = b.dataset.step; App.save(); App.render(); $("main").scrollTop = 0; });
    ({ audience, offer, message, check, send })[step](c, $("stepbody"));
  };

  /* ================= 1. AUDIENCE ================= */
  function ctxFor(c) { const P = App.prep(c); return { P, analysisOf: l => P.get(N.campaign.keyOf(l)).analysis, blockedOf: l => P.get(N.campaign.keyOf(l)).block }; }

  function audience(c, el) {
    if (!App.L.leads.length) { el.innerHTML = `<div class="panel empty"><h2>No leads yet</h2><div>Import a lead CSV, then come back to pick this campaign’s audience.</div><button class="btn primary" id="gol">Go to Leads</button></div>`; $("gol").onclick = () => App.go("leads"); return; }
    const f = c.filters, ctx = ctxFor(c), P = ctx.P;
    const leads = App.L.leads;
    const matching = N.filters.apply(leads, f, ctx);
    const sel = new Set(c.selected);
    const ui = App.S.ui; const view = ui.audView || "matching";
    const shown = view === "selected" ? leads.filter(l => sel.has(N.campaign.keyOf(l))) : matching;
    const page = Math.min(ui.audPage || 0, Math.max(0, Math.ceil(shown.length / PAGE) - 1));
    const noRates = !Object.values(App.S.settings.rates.table || {}).some(r => Object.values(r || {}).some(v => v > 0)) && c.offer.rateMode !== "fixed";

    const chipGroup = (label, field, key) => { const fac = N.filters.facets(leads, field); if (fac.length < 2 && !(f[key] || []).length) return "";
      return `<div class="grp"><div class="gl">${label}${(f[key] || []).length ? `<span class="spacer"></span><a href="#" class="tiny" data-clr="${key}">clear</a>` : ""}</div><div class="chips">${fac.slice(0, 40).map(x => `<button class="chip ${(f[key] || []).includes(x.value) ? "on" : ""}" data-chip="${key}" data-v="${esc(x.value)}">${esc(x.value)} <span class="c">${x.count}</span></button>`).join("")}</div></div>`; };
    const range = (label, lo, hi, ph1, ph2, unit) => `<div class="grp"><div class="gl">${label}</div><div class="range"><input type="number" step="any" data-f="${lo}" placeholder="${ph1 || "min"}" value="${f[lo] ?? ""}"><span class="small muted">to</span><input type="number" step="any" data-f="${hi}" placeholder="${ph2 || "max"}" value="${f[hi] ?? ""}"></div>${unit ? `<div class="tiny faint" style="margin-top:3px">${unit}</div>` : ""}</div>`;
    const single = (label, key, ph, unit) => `<div class="grp"><div class="gl">${label}</div><input type="number" step="any" data-f="${key}" placeholder="${ph}" value="${f[key] ?? ""}" style="min-height:32px;padding:5px 8px">${unit ? `<div class="tiny faint" style="margin-top:3px">${unit}</div>` : ""}</div>`;
    const rawCols = [...new Set(App.L.imports.flatMap(i => Object.keys((App.L.leads.find(l => l._import === i.file) || {})._raw || {})))];
    const fieldOpts = [...N.fields.FIELDS.filter(x => !["fullName"].includes(x.key)).map(x => [x.key, x.label]), ["region", "Region"], ["equity", "Equity $"], ["ltv", "LTV %"], ["a.saveMo", "Offer: monthly savings"], ["a.rateDrop", "Offer: rate drop"], ["a.interestSaved", "Offer: interest saved"], ["a.ltvNew", "Offer: new LTV"], ...rawCols.map(h => ["raw:" + h, "CSV: " + h])];

    const qualN = matching.filter(l => P.get(N.campaign.keyOf(l)).analysis.ok).length;
    el.innerHTML = `${noRates ? `<div class="callout warn"><div><b>No rates entered yet.</b> Leads can’t qualify for the offer until there’s a rate for their loan type. Enter today’s rates in the <a href="#" id="toOffer">Offer</a> step (or Settings → Rates).</div></div>` : ""}
    <div class="aud">
      <div class="panel filters" style="padding:10px 16px">
        <div class="row" style="padding:6px 0 4px"><h2 style="font-size:16px">Filters</h2><span class="spacer"></span><button class="btn sm ghost" id="freset">Reset</button></div>
        <div class="grp"><input type="search" data-fs="q" placeholder="Search name, city, ZIP…" value="${esc(f.q)}"></div>
        <div class="grp"><label class="check"><input type="checkbox" data-fb="qualifiedOnly" ${f.qualifiedOnly ? "checked" : ""}> <span>Only leads who qualify for this offer</span></label>
          <label class="check" style="margin-top:6px"><input type="checkbox" data-fb="sendableOnly" ${f.sendableOnly ? "checked" : ""}> <span>Only leads we can email <span class="faint">(valid address, licensed state, not opted out)</span></span></label></div>
        ${range("Current rate %", "rateMin", "rateMax", "e.g. 6.5", "")}
        ${chipGroup("Loan type", "loanType", "loanTypes")}
        ${chipGroup("Region", "region", "regions")}
        ${chipGroup("State", "state", "states")}
        ${range("Equity $", "equityMin", "equityMax", "e.g. 50000", "")}
        ${range("LTV %", "ltvMin", "ltvMax", "", "e.g. 80")}
        ${range("Other debt $", "debtMin", "debtMax", "e.g. 10000", "")}
        ${single("Credit score at least", "ficoMin", "e.g. 640")}
        ${range("Balance $", "balanceMin", "balanceMax")}
        ${single("Saves at least / month", "saveMin", "e.g. 200", "Uses this campaign’s offer")}
        ${single("Rate drop at least %", "rateDropMin", "e.g. 0.75", "Current rate minus offered rate")}
        ${chipGroup("Banker", "banker", "bankers")}
        ${chipGroup("Lead source", "source", "sources")}
        <div class="grp"><div class="gl">More conditions</div>
          ${(f.custom || []).map((x, i) => `<div style="display:grid;grid-template-columns:1fr;gap:4px;margin-bottom:8px;padding:8px;border:1px solid var(--line);border-radius:8px">
            <select data-cf="${i}" data-k="field">${fieldOpts.map(([k, t]) => `<option value="${esc(k)}" ${x.field === k ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
            <div class="row" style="gap:4px;flex-wrap:nowrap"><select data-cf="${i}" data-k="op" style="width:auto">${[">=", "<=", "=", "!=", "contains", "not contains", "is empty", "is not empty"].map(o => `<option ${x.op === o ? "selected" : ""}>${o}</option>`).join("")}</select>
            <input type="text" data-cf="${i}" data-k="value" value="${esc(x.value)}" ${/empty/.test(x.op) ? "disabled" : ""}><button class="btn sm ghost" data-cdel="${i}">✕</button></div></div>`).join("")}
          <button class="btn sm" id="cadd">+ Add condition</button></div>
      </div>
      <div>
        <div class="selbar"><b>${sel.size.toLocaleString()}</b> selected <span style="opacity:.7">· ${matching.length.toLocaleString()} match the filters${!f.qualifiedOnly ? " · " + qualN.toLocaleString() + " qualify" : ""}</span><span class="spacer"></span>
          <button class="btn" id="selMatch">Select all ${matching.length.toLocaleString()} matching</button><button class="btn" id="addMatch">Add matching</button><button class="btn" id="selClear" ${sel.size ? "" : "disabled"}>Clear selection</button></div>
        <div class="row" style="margin-bottom:8px"><button class="chip ${view === "matching" ? "on" : ""}" data-view="matching">Matching filters (${matching.length.toLocaleString()})</button><button class="chip ${view === "selected" ? "on" : ""}" data-view="selected">Selected (${sel.size.toLocaleString()})</button>
          <span class="spacer"></span><span class="small muted">${esc(N.filters.describe(f))}</span></div>
        <div class="tablewrap" style="max-height:calc(100vh - 330px)"><table class="data"><thead><tr><th style="width:30px"><input type="checkbox" id="pageAll" title="Select this page"></th><th>Name</th><th>State</th><th>Type</th><th class="num">Rate</th><th class="num">Offered</th><th class="num">Saves / mo</th><th class="num">New LTV</th><th class="num">Debt</th><th>Status</th></tr></thead><tbody>
        ${shown.slice(page * PAGE, page * PAGE + PAGE).map(l => { const k = N.campaign.keyOf(l), p = P.get(k), a = p.analysis;
          const status = p.block ? `<span class="tag block">${esc(p.block)}</span>` : a.ok ? `<span class="tag ok">Qualifies</span>` : `<span class="tag no" title="${esc(a.reasons.join("; "))}">${esc(a.reasons[0] || "")}</span>`;
          return `<tr class="${sel.has(k) ? "sel" : ""}"><td><input type="checkbox" data-k="${esc(k)}" ${sel.has(k) ? "checked" : ""}></td><td>${esc(l.name)}<div class="tiny faint">${esc(l.email)}</div></td><td>${esc(l.state)}</td><td>${esc(l.loanType)}</td>
            <td class="num">${pct(l.rate)}</td><td class="num">${a.rate ? pct(a.rate) : "—"}</td><td class="num ${a.saveMo > 0 ? "good" : ""}">${a.newPay ? money(a.saveMo) : "—"}</td><td class="num">${a.ltvNew != null ? a.ltvNew.toFixed(1) + "%" : a.cltvNew != null ? a.cltvNew.toFixed(1) + "% C" : "—"}</td><td class="num">${l.debtBalance ? money(l.debtBalance) : ""}</td><td>${status}</td></tr>`; }).join("")}
        </tbody></table>${shown.length ? "" : `<div class="empty">${view === "selected" ? "Nobody selected yet." : "No leads match these filters."}</div>`}</div>
        <div class="pager"><button class="btn sm" id="pp" ${page ? "" : "disabled"}>‹ Prev</button><span>Page ${page + 1} of ${Math.max(1, Math.ceil(shown.length / PAGE))}</span><button class="btn sm" id="np" ${(page + 1) * PAGE < shown.length ? "" : "disabled"}>Next ›</button></div>
      </div></div>`;

    const rerender = (keepFocus) => { App.save(); if ($("selCount")) $("selCount").textContent = App.plural(c.selected.length, "lead"); const a = document.activeElement; const id = a && (a.dataset.f || a.dataset.fs); audience(c, el); if (keepFocus && id) { const n = el.querySelector(`[data-f="${id}"],[data-fs="${id}"]`); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) {} } } App.renderSide(); };
    let t = null; const later = () => { clearTimeout(t); t = setTimeout(() => { ui.audPage = 0; rerender(true); }, 350); };
    if ($("toOffer")) $("toOffer").onclick = e => { e.preventDefault(); c.step = "offer"; App.save(); App.render(); };
    el.querySelectorAll("[data-f]").forEach(i => i.oninput = () => { f[i.dataset.f] = App.num(i.value); later(); });
    el.querySelectorAll("[data-fs]").forEach(i => i.oninput = () => { f[i.dataset.fs] = i.value; later(); });
    el.querySelectorAll("[data-fb]").forEach(i => i.onchange = () => { f[i.dataset.fb] = i.checked; ui.audPage = 0; rerender(); });
    el.querySelectorAll("[data-chip]").forEach(b => b.onclick = () => { const k = b.dataset.chip, v = b.dataset.v; f[k] = f[k] || []; const i = f[k].indexOf(v); if (i >= 0) f[k].splice(i, 1); else f[k].push(v); ui.audPage = 0; rerender(); });
    el.querySelectorAll("[data-clr]").forEach(a => a.onclick = e => { e.preventDefault(); f[a.dataset.clr] = []; rerender(); });
    $("freset").onclick = () => { c.filters = JSON.parse(JSON.stringify(N.filters.EMPTY)); rerender(); };
    $("cadd").onclick = () => { f.custom = f.custom || []; f.custom.push({ field: "fico", op: ">=", value: "" }); rerender(); };
    el.querySelectorAll("[data-cf]").forEach(i => { const upd = () => { const x = f.custom[+i.dataset.cf]; x[i.dataset.k] = i.value; if (i.dataset.k === "value") later(); else rerender(); }; i.onchange = upd; if (i.tagName === "INPUT") i.oninput = upd; });
    el.querySelectorAll("[data-cdel]").forEach(b => b.onclick = () => { f.custom.splice(+b.dataset.cdel, 1); rerender(); });
    el.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { ui.audView = b.dataset.view; ui.audPage = 0; rerender(); });
    $("selMatch").onclick = () => { c.selected = matching.map(l => N.campaign.keyOf(l)); rerender(); App.toast(App.plural(c.selected.length, "lead") + " selected"); };
    $("addMatch").onclick = () => { const s = new Set(c.selected); matching.forEach(l => s.add(N.campaign.keyOf(l))); c.selected = [...s]; rerender(); };
    $("selClear").onclick = () => { c.selected = []; rerender(); };
    el.querySelectorAll("tbody [data-k]").forEach(cb => cb.onchange = () => { const s = new Set(c.selected); if (cb.checked) s.add(cb.dataset.k); else s.delete(cb.dataset.k); c.selected = [...s]; App.save(); cb.closest("tr").classList.toggle("sel", cb.checked); el.querySelector(".selbar b").textContent = s.size.toLocaleString(); if ($("selCount")) $("selCount").textContent = App.plural(s.size, "lead"); });
    $("pageAll").onchange = e => { const s = new Set(c.selected); el.querySelectorAll("tbody [data-k]").forEach(cb => { cb.checked = e.target.checked; if (e.target.checked) s.add(cb.dataset.k); else s.delete(cb.dataset.k); }); c.selected = [...s]; rerender(); };
    $("pp").onclick = () => { ui.audPage = page - 1; rerender(); }; $("np").onclick = () => { ui.audPage = page + 1; rerender(); };
  }

  /* ================= 2. OFFER ================= */
  function offer(c, el) {
    const o = c.offer, R = o.rules, s = App.S.settings;
    const rt = s.rates.table;
    const rows = o.product === "second" ? ["Second"] : ["Conventional", "FHA", "VA", "USDA", "Jumbo"];
    const terms = o.product === "second" ? [10, 15, 20, 30] : [30, 20, 15];
    const ctx = ctxFor(c); const P = ctx.P;
    const aud = N.filters.apply(App.L.leads, Object.assign({}, c.filters, { qualifiedOnly: false }), ctx);
    const res = aud.map(l => P.get(N.campaign.keyOf(l)).analysis);
    const ok = res.filter(a => a.ok);
    const reasons = {}; res.filter(a => !a.ok).forEach(a => { const r = (a.reasons[0] || "").replace(/-?\$[\d,]+|-?[\d.]+%?/g, "#").replace(/\(needs #\)|\(max #\)|\(min #\)/, "").replace(/#/g, "…").trim(); reasons[r] = (reasons[r] || 0) + 1; });
    const rs = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6); const maxR = rs.length ? rs[0][1] : 1;
    const avg = k => ok.length ? ok.reduce((t, a) => t + (a[k] || 0), 0) / ok.length : null;
    el.innerHTML = `
      <div class="panel"><h2>What are we offering?</h2><div class="hint">Each lead’s proposal is calculated with the Banker Toolkit’s math — same payment, pay-what-you-pay-now, blended rate and APR figures.</div>
        <div class="cards">${Object.entries(PRODUCTS).map(([k, p]) => `<button class="card ${o.product === k ? "on" : ""}" data-prod="${k}"><div class="t">${p.t}</div><div class="d">${p.d}</div></button>`).join("")}</div></div>
      <div class="grid2">
        <div class="panel"><h2>Loan terms</h2><div class="hint">Applied to every lead in the campaign.</div>
          <div class="fields">
            <label class="f">Term<select data-bind="offer.term" data-num>${terms.map(t => `<option value="${t}">${t} years</option>`).join("")}</select></label>
            <label class="f">Rate<select data-bind="offer.rateMode"><option value="table">From the rate sheet, by loan type</option><option value="fixed">One rate for everyone</option></select></label>
            ${o.rateMode === "fixed" ? `<label class="f">Rate %<input type="number" step="0.001" data-bind="offer.fixedRate"></label>` : ""}
            <label class="f">Closing costs<select data-bind="offer.costsMode"><option value="flat">Flat $ amount</option><option value="pct">% of loan</option></select></label>
            ${o.costsMode === "pct" ? `<label class="f">Costs %<input type="number" step="0.05" data-bind="offer.costsPct"></label>` : `<label class="f">Costs $<input type="number" step="50" data-bind="offer.costs"></label>`}
            ${o.product !== "second" ? `<label class="f">Skipped payments<select data-bind="offer.skip" data-num><option value="0">None</option><option value="1">1 payment</option><option value="2">2 payments</option></select></label>` : ""}
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            <label class="check"><input type="checkbox" data-bind="offer.pwypn"> Show “pay what you pay now” — time and interest saved if they keep today’s payment</label>
            ${o.product === "refi" ? `<label class="check"><input type="checkbox" data-bind="offer.streamline"> Quote FHA loans as an FHA Streamline and VA loans as a VA IRRRL</label>` : ""}
          </div></div>
        <div class="panel"><div class="row"><h2>Rate sheet</h2><span class="spacer"></span><label class="f" style="flex-direction:row;align-items:center;gap:6px">As of<input type="date" data-bind="settings.rates.asOf" style="width:auto"></label></div>
          <div class="hint">Shared with every campaign (also in Settings). Leave blank what you don’t offer.</div>
          <table class="data ratesheet"><thead><tr><th></th>${terms.map(t => `<th class="num">${t}-yr</th>`).join("")}</tr></thead><tbody>
          ${rows.map(r => `<tr><td><b>${r === "Second" ? "Home equity (2nd)" : r}</b></td>${terms.map(t => `<td class="num"><input type="number" step="0.001" data-rate="${r}|${t}" value="${(rt[r] || {})[t] ?? ""}" placeholder="—"></td>`).join("")}</tr>`).join("")}
          </tbody></table></div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>Who qualifies</h2><div class="hint">A lead only gets this offer if it clears every rule. Leads that don’t are left out of the audience automatically (you can turn that off in Audience).</div>
          <div class="fields">
            ${o.product === "refi" ? `<label class="f">Minimum rate drop %<input type="number" step="0.125" data-bind="offer.rules.minRateDrop"></label>` : ""}
            <label class="f">Minimum monthly savings $<input type="number" step="25" data-bind="offer.rules.minMonthlySave"></label>
            ${o.product === "refi" ? `<label class="f">Max new LTV %<input type="number" data-bind="offer.rules.maxLtvRefi"><span class="h">Not applied to Streamline / IRRRL</span></label>` : ""}
            ${o.product === "cashout" ? `<label class="f">Max new LTV %<input type="number" data-bind="offer.rules.maxLtvCashout"></label><label class="f">Max new LTV % (VA)<input type="number" data-bind="offer.rules.maxLtvCashoutVA"></label>` : ""}
            ${o.product === "second" ? `<label class="f">Max combined LTV %<input type="number" data-bind="offer.rules.maxCltvSecond"></label>` : ""}
            ${o.product !== "refi" ? `<label class="f">Minimum other debt $<input type="number" step="500" data-bind="offer.rules.minDebt"></label>` : ""}
            <label class="f">Minimum credit score<input type="number" data-bind="offer.rules.minFico" placeholder="0 = don’t check"></label>
          </div></div>
        <div class="panel"><h2>Result for the filtered audience</h2>
          <div class="stats" style="margin:8px 0 12px"><div class="stat"><div class="v brand">${ok.length.toLocaleString()}</div><div class="l">of ${aud.length.toLocaleString()} qualify</div></div>
            <div class="stat"><div class="v">${avg("saveMo") != null ? money(avg("saveMo")) : "—"}</div><div class="l">Average savings / mo</div></div>
            <div class="stat"><div class="v">${avg("interestSaved") != null && o.pwypn ? money(avg("interestSaved")) : "—"}</div><div class="l">Avg. interest saved (PWYPN)</div></div></div>
          ${rs.length ? `<div class="small muted" style="margin-bottom:6px">Most common reasons a lead doesn’t qualify</div><div class="bars">${rs.map(([r, n]) => `<div class="b"><div class="track"><div class="fill" style="width:${Math.round(n / maxR * 100)}%"></div><div class="lbl">${esc(r)}</div></div><div class="num small">${n.toLocaleString()}</div></div>`).join("")}</div>` : ""}
        </div></div>`;
    const refresh = () => { App.invalidate(); offer(c, el); App.renderSide(); };
    App.bind(el, { offer: o, settings: s }, (p) => { if (/rateMode|costsMode/.test(p)) refresh(); else { clearTimeout(offer.t); offer.t = setTimeout(refresh, 450); } });
    el.querySelectorAll("[data-prod]").forEach(b => b.onclick = () => { const k = b.dataset.prod; if (o.product === k) return; o.product = k; const p = PRODUCTS[k]; o.term = p.term; o.costs = p.costs; o.costsMode = "flat"; App.save(); refresh(); });
    el.querySelectorAll("[data-rate]").forEach(i => i.oninput = () => { const [r, t] = i.dataset.rate.split("|"); rt[r] = rt[r] || {}; rt[r][t] = App.num(i.value); App.save(); clearTimeout(offer.t); offer.t = setTimeout(refresh, 600); });
  }

  /* ================= 3. MESSAGE ================= */
  function previewLeads(c) { const sel = new Set(c.selected); const L = App.L.leads.filter(l => sel.has(N.campaign.keyOf(l))); return L.length ? L : [N.campaign.sampleLead(App.L.leads, c, App.S)].filter(Boolean); }
  function renderFor(c, lead) { return lead ? N.campaign.prepare(lead, c, App.S, { render: true }) : null; }

  function message(c, el) {
    const leads = previewLeads(c); const ui = App.S.ui;
    let pi = Math.min(ui.prevIdx || 0, Math.max(0, leads.length - 1));
    el.innerHTML = `<div class="compose">
      <div>
        <div class="panel">
          <label class="f"><span class="row" style="gap:6px">Subject line <span class="counter" id="sc"></span></span><input type="text" id="subj" data-bind="subject"></label>
          <div class="mini-issues" id="subjIssues"></div>
          <div class="row" style="margin-top:8px"><div class="menu" id="ideas"><button class="btn sm">Subject ideas ▾</button><div class="pop">${(N.deliver.IDEAS[c.offer.product] || []).map(s => `<button data-idea="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>
            <div class="menu" data-ins="subj"><button class="btn sm">Insert field ▾</button><div class="pop"></div></div><span class="small faint">Personal, specific, under 50 characters, no rates.</span></div>
          <label class="f" style="margin-top:14px"><span class="row" style="gap:6px">Preview text <span class="h">(shown after the subject in the inbox)</span><span class="counter" id="pc"></span></span><input type="text" id="pre" data-bind="preheader"></label>
          <div class="mini-issues" id="preIssues"></div>
        </div>
        <div class="panel">
          <div class="row" style="margin-bottom:6px"><b class="small" style="color:var(--muted)">Email copy</b><span class="h small faint">— appears above the proposal</span><span class="spacer"></span><div class="menu" data-ins="body"><button class="btn sm">Insert field ▾</button><div class="pop"></div></div></div>
          <textarea id="body" data-bind="body" style="min-height:220px"></textarea>
          <div class="tiny faint" style="margin-top:4px">Blank line = new paragraph · <span class="kbd">**bold**</span> · <span class="kbd">- </span> starts a bullet · <span class="kbd">[text](https://link)</span> · fallback for empty fields: <span class="kbd">{{first_name|there}}</span></div>
          <div class="mini-issues" id="bodyIssues"></div>
          <div class="fields" style="margin-top:14px"><label class="f">Button text<input type="text" data-bind="ctaText"></label><label class="f">Button link<input type="text" data-bind="ctaUrl" placeholder="https://… or {{cta_url}}"><span class="h">{{cta_url}} = each sender’s scheduling link (Settings)</span></label></div>
        </div>
        <div class="panel"><h2 style="font-size:15px">Proposal sections</h2><div class="row" style="margin-top:8px;gap:16px">
          ${[["stats", "Headline numbers"], ["benefits", "What this does for you"], ["table", "Today vs. proposed table"], ["bars", "Payment bars"], ["cta", "Button"], ["signature", "Signature"]].map(([k, t]) => `<label class="check"><input type="checkbox" data-bind="sections.${k}"> ${t}</label>`).join("")}</div></div>
      </div>
      <div class="preview">
        <div class="bar"><button class="btn sm" id="pv">‹</button><span class="small" id="pwho" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span><button class="btn sm" id="nx">›</button>
          <button class="chip ${ui.pvMode !== "mobile" && ui.pvMode !== "text" ? "on" : ""}" data-pm="desktop">Desktop</button><button class="chip ${ui.pvMode === "mobile" ? "on" : ""}" data-pm="mobile">Phone</button><button class="chip ${ui.pvMode === "text" ? "on" : ""}" data-pm="text">Plain text</button></div>
        <div class="inbox"><div class="av" id="iav"></div><div style="min-width:0;flex:1"><div class="fr" id="ifr"></div><div class="sj" id="isj"></div><div class="ph" id="iph"></div></div></div>
        <div id="pwarn"></div>
        <div class="frame ${ui.pvMode === "mobile" ? "mobile" : ""}" id="frame" ${ui.pvMode === "text" ? 'style="display:none"' : ""}><iframe id="ifr_" title="Email preview" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"></iframe></div>
        <pre class="plain" id="plain" ${ui.pvMode === "text" ? "" : 'style="display:none"'}></pre>
      </div></div>`;

    const insMenu = m => { const target = m.dataset.ins === "subj" ? $("subj") : $("body");
      m.querySelector(".pop").innerHTML = N.merge.FIELDS.map(([k, t]) => `<button data-field="${k}">${esc(t)} <code>{{${k}}}</code></button>`).join("");
      m.querySelector(".btn").onclick = e => { e.stopPropagation(); document.querySelectorAll(".menu.open").forEach(x => x !== m && x.classList.remove("open")); m.classList.toggle("open"); };
      m.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { const tok = "{{" + b.dataset.field + (b.dataset.field === "first_name" ? "|there" : "") + "}}"; const s0 = target.selectionStart ?? target.value.length, s1 = target.selectionEnd ?? s0;
        target.value = target.value.slice(0, s0) + tok + target.value.slice(s1); target.dispatchEvent(new Event("input")); target.focus(); target.setSelectionRange(s0 + tok.length, s0 + tok.length); m.classList.remove("open"); }); };
    el.querySelectorAll("[data-ins]").forEach(insMenu);
    const ideas = $("ideas"); ideas.querySelector(".btn").onclick = e => { e.stopPropagation(); ideas.classList.toggle("open"); };
    ideas.querySelectorAll("[data-idea]").forEach(b => b.onclick = () => { $("subj").value = b.dataset.idea; $("subj").dispatchEvent(new Event("input")); ideas.classList.remove("open"); });

    let t = null;
    App.bind(el, c, () => { clearTimeout(t); t = setTimeout(update, 250); });
    el.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { ui.pvMode = b.dataset.pm; App.save(); message(c, el); });
    $("pv").onclick = () => { pi = (pi - 1 + leads.length) % leads.length; ui.prevIdx = pi; update(); };
    $("nx").onclick = () => { pi = (pi + 1) % leads.length; ui.prevIdx = pi; update(); };

    function issuesHtml(list) { return list.slice(0, 4).map(i => `<div class="${i.level}">${esc(i.msg)}${i.fix ? ` <span class="faint">— ${esc(i.fix)}</span>` : ""}</div>`).join(""); }
    function update() {
      const lead = leads[pi]; const p = renderFor(c, lead);
      const r = p && p.rendered;
      const subjR = r ? r.subject : c.subject;
      $("sc").textContent = [...subjR].length + " chars"; $("sc").className = "counter" + ([...subjR].length > 55 ? " over" : "");
      $("pc").textContent = (r ? r.preheader : c.preheader || "").length + " chars";
      $("subjIssues").innerHTML = issuesHtml(N.deliver.checkSubject(c.subject, subjR));
      $("preIssues").innerHTML = issuesHtml(N.deliver.checkPreheader(c.preheader, subjR));
      $("bodyIssues").innerHTML = issuesHtml(N.deliver.checkContent(c.body, null).filter(i => i.level !== "tip"));
      if (!p) { $("pwho").textContent = "No leads to preview"; return; }
      $("pwho").innerHTML = `<b>${esc(lead.name)}</b> <span class="faint">${pi + 1} of ${leads.length.toLocaleString()} ${c.selected.length ? "selected" : "(sample — none selected yet)"}</span>`;
      const fromName = p.message.fromName || "(no From name)";
      $("iav").textContent = (fromName.trim()[0] || "N").toUpperCase(); $("ifr").textContent = fromName + (p.message.from ? " <" + p.message.from + ">" : "");
      $("isj").textContent = r.subject || "(no subject)"; $("iph").textContent = r.preheader || "";
      const warns = [...(p.block ? ["Won’t be sent: " + p.block] : []), ...(!p.analysis.ok ? ["Doesn’t qualify: " + p.analysis.reasons.join("; ")] : []), ...p.warnings];
      $("pwarn").innerHTML = warns.length ? `<div class="callout warn" style="margin-bottom:8px;padding:8px 12px"><div class="small">${warns.map(esc).join("<br>")}</div></div>` : "";
      $("ifr_").srcdoc = r.html; $("plain").textContent = r.text; fitFrame();
    }
    function fitFrame() {   /* show the desktop layout at 640px wide, scaled to fit the panel */
      const fr = $("frame"), ifr = $("ifr_"); if (!fr || !ifr) return;
      if (fr.classList.contains("mobile")) { ifr.style.cssText = ""; fr.style.height = ""; return; }
      const sc = Math.min(1, fr.clientWidth / 640);
      ifr.style.width = "640px"; ifr.style.height = Math.round(760 / sc) + "px"; ifr.style.transform = "scale(" + sc + ")"; ifr.style.transformOrigin = "0 0"; fr.style.height = "760px"; fr.style.justifyContent = "flex-start";
    }
    window.onresize = fitFrame;
    update();
  }
  document.addEventListener("click", closeMenus);
  function closeMenus(e) { if (!e.target.closest || !e.target.closest(".menu")) document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open")); }

  /* ================= 4. CHECK ================= */
  function check(c, el) {
    const P = App.prep(c); const sel = c.selected.map(k => P.get(k)).filter(Boolean);
    const sample = sel.find(p => !p.block && p.analysis.ok) || sel[0];
    const res = N.campaign.check(c, App.S, sample ? sample.lead : N.campaign.sampleLead(App.L.leads, c, App.S), sel.length);
    const blocked = {}, unq = [], warned = [];
    for (const p of sel) { if (p.block) blocked[p.block.replace(/ in [A-Z]{2}$/, "")] = (blocked[p.block.replace(/ in [A-Z]{2}$/, "")] || 0) + 1; else if (!p.analysis.ok) unq.push(p); }
    const okN = sel.filter(p => !p.block && p.analysis.ok).length;
    const warnSample = sel.filter(p => !p.block && p.analysis.ok).slice(0, 400).map(p => ({ p, w: N.deliver.leadWarnings(p.lead, N.campaign.prepare(p.lead, c, App.S, { render: true }).rendered) })).filter(x => x.w.length);
    const areas = { subject: "Subject line", preheader: "Preview text", content: "Content", compliance: "Compliance", setup: "Sending setup" };
    const lv = { error: ["block", "Fix"], warn: ["warn", "Improve"], tip: ["info", "Tip"] };
    const ringColor = { A: "var(--good)", B: "var(--good)", C: "#D39A35", D: "var(--bad)", F: "var(--bad)" }[res.grade];
    el.innerHTML = `
      <div class="grid2">
        <div class="panel"><div class="scorecard"><div class="bigscore grade-${res.grade}" style="border:4px solid ${ringColor}"><div class="g">${res.grade}</div><div class="s">${res.score}/100</div></div>
          <div><h2>Deliverability &amp; compliance</h2><div class="small muted" style="margin-top:4px">${res.errors ? `<b class="bad">${App.plural(res.errors, "thing")} to fix</b> before sending · ` : "<b class=\"good\">Nothing blocking</b> · "}${App.plural(res.warns, "improvement")} · ${App.plural(res.tips, "tip")}</div>
          <div class="small faint" style="margin-top:6px">Checked against a real rendered email${sample ? " (for " + esc(sample.lead.name) + ")" : ""}. Scores measure what spam filters and mortgage-advertising rules look at; they don’t replace a compliance review.</div></div></div></div>
        <div class="panel"><h2>Audience</h2>
          <div class="stats" style="margin:10px 0 8px"><div class="stat"><div class="v brand">${okN.toLocaleString()}</div><div class="l">Will be sent</div></div><div class="stat"><div class="v">${Object.values(blocked).reduce((a, b) => a + b, 0).toLocaleString()}</div><div class="l">Can’t be emailed</div></div><div class="stat"><div class="v">${unq.length.toLocaleString()}</div><div class="l">No longer qualify</div></div></div>
          ${Object.keys(blocked).length ? `<div class="small">${Object.entries(blocked).map(([r, n]) => `<span class="tag block">${esc(r)}: ${n}</span>`).join(" ")}</div>` : ""}
          ${Object.keys(blocked).length || unq.length ? `<button class="btn sm" id="prune" style="margin-top:10px">Remove these ${(Object.values(blocked).reduce((a, b) => a + b, 0) + unq.length).toLocaleString()} from the selection</button>` : ""}
          ${!sel.length ? `<div class="callout warn">No leads selected — go back to Audience.</div>` : ""}</div>
      </div>
      <div class="panel"><h2>Findings</h2>${res.issues.length ? Object.keys(areas).map(a => { const is = res.issues.filter(i => i.area === a).sort((x, y) => "ewt".indexOf(x.level[0]) - "ewt".indexOf(y.level[0])); return is.length ? `<div style="margin-top:12px"><div class="small" style="font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px">${areas[a]}</div>${is.map(i => `<div class="issue"><div><span class="tag ${lv[i.level][0]}">${lv[i.level][1]}</span></div><div><div class="m">${esc(i.msg)}</div>${i.fix ? `<div class="x">${esc(i.fix)}</div>` : ""}</div></div>`).join("")}</div>` : ""; }).join("") : `<div class="callout good" style="margin-top:10px">No issues found.</div>`}</div>
      ${warnSample.length ? `<div class="panel"><h2>Lead-level warnings</h2><div class="hint">These leads will still be sent; worth a look.</div><div class="tablewrap" style="max-height:320px"><table class="data"><tbody>${warnSample.slice(0, 100).map(x => `<tr><td>${esc(x.p.lead.name)}<div class="tiny faint">${esc(x.p.lead.email)}</div></td><td class="wrap small">${x.w.map(esc).join("<br>")}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
    if ($("prune")) $("prune").onclick = () => { const bad = new Set(sel.filter(p => p.block || !p.analysis.ok).map(p => p.key)); c.selected = c.selected.filter(k => !bad.has(k)); App.save(); App.render(); App.toast(App.plural(bad.size, "lead") + " removed"); };
  }

  /* ================= 5. SEND ================= */
  let liveStatus = {};
  function send(c, el) {
    const s = App.S.settings, from = s.from;
    const P = App.prep(c); const sel = c.selected.map(k => P.get(k)).filter(Boolean);
    const okN = sel.filter(p => !p.block && p.analysis.ok).length;
    const res = N.campaign.check(c, App.S, (sel.find(p => !p.block && p.analysis.ok) || {}).lead || null, sel.length);
    const provLabel = (App.providerCatalog || []).find(p => p.id === s.provider);
    const st = liveStatus[c.id] || null;
    const k = st && st.counts || c.sendCounts || null;
    const running = st && st.status === "running";
    const dry = (s.provider || "dryrun") === "dryrun";
    el.innerHTML = `
      ${!App.desktop ? `<div class="callout info"><div>Sending runs in the desktop app. This browser preview can build and check campaigns.</div></div>` : ""}
      ${res.errors ? `<div class="callout bad"><div><b>${App.plural(res.errors, "issue")} to fix first</b> — see the Check step. ${esc(res.issues.filter(i => i.level === "error").map(i => i.msg).slice(0, 3).join(" · "))}</div></div>` : ""}
      ${dry ? `<div class="callout info"><div><b>Dry run.</b> Nothing will be emailed — each message is saved as a file you can open. Connect your email service in <a href="#" id="toSet">Settings → Sending</a> when it’s ready.</div></div>` : ""}
      <div class="grid2">
        <div class="panel"><h2>Ready to send</h2>
          <table class="data" style="margin-top:10px"><tbody>
            <tr><td class="muted">Recipients</td><td><b>${okN.toLocaleString()}</b> <span class="small muted">of ${sel.length.toLocaleString()} selected (the rest are skipped automatically)</span></td></tr>
            <tr><td class="muted">Email service</td><td>${esc(provLabel ? provLabel.label : s.provider)}</td></tr>
            <tr><td class="muted">From</td><td>${esc(sampleFrom(c, sel) || from.fromNameTpl)} &lt;${esc(from.fromEmail || "not set")}&gt;</td></tr>
            <tr><td class="muted">Reply-to</td><td>${from.replyToMode === "banker" ? "Each lead’s banker (or the default sender)" : esc(from.replyTo || "Same as From")}</td></tr>
            <tr><td class="muted">Pace</td><td>${from.ratePerMinute || 30} per minute${from.dailyCap ? " · max " + (+from.dailyCap).toLocaleString() + " per day" : ""} · ${etaText(okN, from)}</td></tr>
            <tr><td class="muted">Score</td><td><span class="scorepill grade-${res.grade}">${res.grade} · ${res.score}</span></td></tr>
          </tbody></table>
          <div class="row" style="margin-top:16px">
            ${st && (st.status === "done" || st.status === "cancelled") && st.provider !== "dryrun" ? `<span class="tag ${st.status === "done" ? "ok" : "no"}" style="font-size:13px;padding:6px 12px">${st.status === "done" ? "\u2713 Campaign " + (dry ? "dry run finished" : "sent") : "Campaign cancelled"}</span><span class="small muted">Duplicate it (Campaigns list) to send to a new audience.</span>`
            : running ? `<button class="btn" id="pause">Pause</button>` : `<button class="btn primary" id="go" ${!App.desktop || !okN || res.errors && !dry ? "disabled" : ""}>${st && st.status === "paused" ? "Resume sending" : dry ? (st && st.provider === "dryrun" && st.status === "done" ? "Run dry run again" : "Run dry run for " + okN.toLocaleString()) : "Send to " + okN.toLocaleString()}</button>`}
            ${st && (st.status === "paused" || running) ? `<button class="btn danger" id="cancel">Cancel campaign</button>` : ""}
            ${App.desktop ? `<button class="btn ghost" id="outbox">${dry ? "Open dry-run folder" : "Open test folder"}</button>` : ""}
          </div>
          ${res.errors && !dry ? `<div class="small bad" style="margin-top:8px">Sending is locked until the errors in Check are fixed.</div>` : ""}
        </div>
        <div class="panel"><h2>Send a test</h2><div class="hint">Sends the proposal for the lead shown in the Message preview to your own inbox, with “[TEST]” in the subject. Check it on your phone and in Outlook.</div>
          <div class="row"><input type="email" id="testTo" placeholder="you@neighborhoodmc.com" value="${esc(from.testTo || "")}" style="flex:1"><button class="btn" id="test" ${App.desktop ? "" : "disabled"}>Send test</button></div>
          <div class="small muted" id="testRes" style="margin-top:8px"></div></div>
      </div>
      <div class="panel"><div class="row"><h2>Progress</h2><span class="spacer"></span>${st ? `<span class="small muted">${esc(st.reason || "")}</span>` : ""}<button class="btn sm" id="logExp" ${App.desktop ? "" : "disabled"}>Export log CSV</button></div>
        ${k ? `<div class="stats" style="margin:10px 0"><div class="stat"><div class="v good">${k.sent.toLocaleString()}</div><div class="l">Sent</div></div><div class="stat"><div class="v">${k.queued.toLocaleString()}</div><div class="l">Waiting</div></div><div class="stat"><div class="v ${k.failed ? "brand" : ""}">${k.failed.toLocaleString()}</div><div class="l">Failed</div></div><div class="stat"><div class="v">${k.skipped.toLocaleString()}</div><div class="l">Skipped</div></div><div class="stat"><div class="v">${st ? (st.sentToday || 0).toLocaleString() : "—"}</div><div class="l">Sent today (all campaigns)</div></div></div>
          <div class="progress"><div class="s" style="width:${pctOf(k.sent, k.total)}%"></div><div class="f" style="width:${pctOf(k.failed, k.total)}%"></div><div class="k" style="width:${pctOf(k.skipped, k.total)}%"></div></div>
          <div id="log" style="margin-top:14px"></div>` : `<div class="small muted" style="margin-top:6px">Not started.</div>`}
      </div>`;

    if ($("toSet")) $("toSet").onclick = e => { e.preventDefault(); App.S.ui.settingsTab = "sending"; App.go("settings"); };
    const testTo = $("testTo"); testTo.oninput = () => { from.testTo = testTo.value.trim(); App.save(); };
    $("test").onclick = async () => {
      const to = testTo.value.trim(); if (!N.fields.validEmail(to)) { App.toast("Enter your email address"); return; }
      const leads = previewLeads(c); const lead = leads[Math.min(App.S.ui.prevIdx || 0, leads.length - 1)]; if (!lead) { App.toast("No lead to preview"); return; }
      App.saveNow(); $("testRes").textContent = "Sending…";
      const r = await window.nmc.send.test(c.id, N.campaign.keyOf(lead), to);
      $("testRes").innerHTML = r.ok && r.value.ok ? `<span class="good">✓ ${dry ? "Saved to the test folder (dry run)" : "Sent — check " + esc(to)}.</span> Rendered for ${esc(lead.name)}.` : `<span class="bad">${esc(r.ok ? r.value.error : r.error)}</span>`;
    };
    if ($("go")) $("go").onclick = async () => {
      const resume = st && st.status === "paused";
      if (!resume && !await App.confirm(dry ? "Run the dry run?" : "Send this campaign?", dry ? `<p>${App.plural(okN, "email")} will be built and saved as files. Nothing is sent.</p>`
        : `<p>You’re about to email <b>${App.plural(okN, "person", "people")}</b> through <b>${esc(provLabel ? provLabel.label : s.provider)}</b> from <b>${esc(from.fromEmail)}</b>.</p><p class="small muted" style="margin-top:8px">Sending runs at ${from.ratePerMinute || 30}/minute. You can pause any time; nobody is emailed twice.</p>`, dry ? "Run dry run" : "Send " + okN.toLocaleString() + " emails")) return;
      App.saveNow(); await window.nmc.flush();
      const r = await window.nmc.send.start(c.id); if (!r.ok) { App.toast(r.error, 5000); return; }
      liveStatus[c.id] = r.value; setState(c, r.value); send(c, el);
    };
    if ($("pause")) $("pause").onclick = async () => { const r = await window.nmc.send.pause(); if (r.ok) { liveStatus[c.id] = r.value; setState(c, r.value); send(c, el); } };
    if ($("cancel")) $("cancel").onclick = async () => { if (!await App.confirm("Cancel this campaign?", "<p>Emails already sent stay sent. Everyone still waiting is skipped, and the campaign can’t be resumed (you can duplicate it to start again — already-emailed people would be emailed again in the copy).</p>", "Cancel campaign")) return;
      const r = await window.nmc.send.cancel(c.id); if (r.ok) { liveStatus[c.id] = Object.assign({}, st, { status: "cancelled", reason: "Cancelled" }); c.sendState = "cancelled"; App.save(); send(c, el); App.renderSide(); } };
    if ($("outbox")) $("outbox").onclick = () => window.nmc.openOutbox(dry ? c.id : c.id + "-tests");
    $("logExp").onclick = async () => { const r = await window.nmc.send.log(c.id); if (!r.ok || !r.value.length) { App.toast("Nothing in the log yet"); return; }
      App.download(c.name.replace(/[^\w-]+/g, "-") + "-send-log.csv", N.csv.stringify(["key", "email", "name", "status", "attempts", "at", "id", "error"], r.value), "csv"); };
    if (k) loadLog(c);
    if (App.desktop && !st) window.nmc.send.status(c.id).then(r => { if (r.ok && r.value) { liveStatus[c.id] = r.value; setState(c, r.value); if (App.cur() === c && c.step === "send") send(c, el); } });
  }
  function sampleFrom(c, sel) { const p = sel.find(x => !x.block && x.analysis.ok); return p ? N.campaign.prepare(p.lead, c, App.S, { render: true }).message.fromName : ""; }
  const pctOf = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  function etaText(n, from) { const perDay = +from.dailyCap || Infinity; const mins = n / Math.max(1, +from.ratePerMinute || 30);
    if (n > perDay) return Math.ceil(n / perDay) + " days (daily cap)"; return mins < 1 ? "under a minute" : mins < 90 ? "about " + Math.ceil(mins) + " minutes" : "about " + (mins / 60).toFixed(1) + " hours"; }
  async function loadLog(c) {
    const box = $("log"); if (!box || !App.desktop) return;
    const r = await window.nmc.send.log(c.id); if (!r.ok) return;
    const items = r.value.filter(i => i.status !== "queued").sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 200);
    const tag = { sent: "ok", failed: "block", skipped: "no" };
    box.innerHTML = items.length ? `<div class="tablewrap" style="max-height:360px"><table class="data"><thead><tr><th>Status</th><th>Email</th><th>Name</th><th>When</th><th>Detail</th></tr></thead><tbody>${items.map(i => `<tr><td><span class="tag ${tag[i.status] || "info"}">${i.status}</span></td><td>${esc(i.email)}</td><td>${esc(i.name || "")}</td><td class="small muted">${i.at ? new Date(i.at).toLocaleTimeString() : ""}</td><td class="wrap small ${i.status === "failed" ? "bad" : "muted"}">${esc(i.error || i.id || "")}</td></tr>`).join("")}</tbody></table></div><div class="tiny faint" style="margin-top:4px">Latest 200 — export for the full log.</div>` : "";
  }
  function setState(c, st) { if (!st) return; const map = { running: "sending", paused: "paused", done: "done", cancelled: "cancelled" }; c.sendState = map[st.status] || ""; c.sendDry = st.provider === "dryrun"; if (st.counts) c.sendCounts = st.counts; App.save(); }

  /* live progress from the desktop shell */
  if (window.nmc && window.nmc.send) {
    let rt = null;
    window.nmc.send.onProgress(st => {
      const prev = liveStatus[st.campaignId]; liveStatus[st.campaignId] = st; const c = App.S.campaigns.find(x => x.id === st.campaignId); if (!c) return; setState(c, st);
      if (prev && prev.status !== st.status && App.S.ui.screen === "campaign" && App.cur() === c) { App.render(); return; }
      clearTimeout(rt); rt = setTimeout(() => { App.renderSide(); const cur = App.cur(); if (App.S.ui.screen === "campaign" && cur && cur.id === c.id && c.step === "send") send(c, $("stepbody")); }, 400);
    });
    window.nmc.send.onDone(st => { const c = App.S.campaigns.find(x => x.id === st.campaignId); App.toast("“" + (c ? c.name : "Campaign") + "” finished — " + st.counts.sent.toLocaleString() + " sent", 6000); });
  }
})();

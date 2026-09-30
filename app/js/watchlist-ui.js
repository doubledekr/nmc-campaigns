/* Watchlist screen: near-miss leads waiting on the rate market or loan seasoning. */
(function () {
  "use strict";
  const { N, $, esc, money, pct } = App;
  const W = () => N.watchlist;
  const fmtD = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  /* shared: add near-miss leads for an offer. Returns counts so callers can report. */
  App.addToWatch = function (leads, offer, label, source) {
    const today = N.loanmath.todayISO(); const rates = App.S.settings.rates;
    const o = W().fullOffer(Object.assign({}, offer, { rateMode: "table" }));      /* always re-check against the live rate sheet */
    const sig = W().offerSig(o);
    const have = new Set(App.S.watchlist.filter(e => e.status !== "removed" && W().offerSig(e.offer) === sig).map(e => e.key));
    const out = { added: 0, already: 0, readyNow: 0, hard: 0, rate: 0, time: 0, blocked: 0 };
    const suppressed = new Set(App.S.suppression.map(e => String(e).toLowerCase()));
    for (const l of leads) {
      const key = N.campaign.keyOf(l);
      if (have.has(key)) { out.already++; continue; }
      if (N.campaign.prepare(l, { id: "watch", offer: o, subject: "", body: "" }, App.S, { suppressed }).block) { out.blocked++; continue; }   /* can't email them anyway */
      const r = W().assess(l, o, rates, today);
      if (!r) { out.hard++; continue; }
      if (r.ready) { out.readyNow++; continue; }
      if (r.waitingOn.includes("rate")) out.rate++; if (r.waitingOn.includes("time")) out.time++;
      App.S.watchlist.push({ id: "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), key, name: l.name, email: l.email, loanType: l.loanType, noteRate: l.rate,
        label, offer: o, need: r.need, eligibleOn: r.eligibleOn, waitingOn: r.waitingOn, addedAt: new Date().toISOString(), source: source || "", status: "watching", campaignId: null });
      have.add(key); out.added++;
    }
    App.save(); return out;
  };

  function presetOptions() {
    const o = Object.entries(W().PRESETS).map(([k, p]) => [`preset:${k}`, p.label]);
    for (const c of App.S.campaigns) o.push([`camp:${c.id}`, "Offer from “" + c.name + "”"]);
    return o;
  }
  function presetOf(val) {
    if (val.startsWith("preset:")) { const p = W().PRESETS[val.slice(7)]; return { label: p.label, offer: p.offer, loanTypes: p.loanTypes }; }
    const c = App.S.campaigns.find(x => "camp:" + x.id === val); return c ? { label: c.name, offer: c.offer, loanTypes: null } : null;
  }

  App.screens.watchlist = function (el) {
    const ui = App.S.ui; const rows = App.watchRows(); const s = App.S.settings;
    const view = ui.watchView || "all";
    const watching = rows.filter(r => r.e.status === "watching");
    const ready = rows.filter(r => r.ready);
    const onRate = watching.filter(r => r.ev.status === "rate" || r.ev.status === "both");
    const onTime = watching.filter(r => r.ev.status === "time" || r.ev.status === "both");
    const inCamp = rows.filter(r => r.e.status === "campaign");
    const shown = { all: rows, ready, rate: onRate, time: onTime, campaign: inCamp }[view] || rows;
    const sens = W().sensitivity(watching);
    const maxS = Math.max(1, ...sens.map(x => x.count));
    const sel = new Set(ui.watchSel || []);
    const pv = ui.watchPreset && presetOf(ui.watchPreset) ? ui.watchPreset : "preset:streamline";
    const campName = id => (App.S.campaigns.find(c => c.id === id) || {}).name || "campaign";

    const statusCell = r => {
      if (r.e.status === "campaign") return `<span class="tag info">In “${esc(campName(r.e.campaignId))}”</span>`;
      if (r.ev.status === "missing") return `<span class="tag no">Not in current lead list</span>`;
      if (r.block) return `<span class="tag block">${esc(r.block)}</span>`;
      if (r.ready) return `<span class="tag ok">Ready now</span>`;
      if (r.ev.status === "changed") return `<span class="tag no" title="${esc((r.ev.analysis && r.ev.analysis.reasons || []).join("; "))}">Rate is there — other rules changed</span>`;
      const bits = [];
      if (r.ev.status === "rate" || r.ev.status === "both") bits.push(r.ev.todayRate == null ? "No rate on the sheet" : "Rates ↓ " + r.ev.gap.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%");
      if (r.ev.status === "time" || r.ev.status === "both") bits.push("Seasoned " + fmtD(r.e.eligibleOn));
      return `<span class="tag warn">${esc(bits.join(" + "))}</span>`;
    };

    el.innerHTML = `<div class="screen">
      <div class="head"><div><h1>Watchlist</h1><div class="lede">Leads who don’t qualify yet — rates haven’t dropped enough, or the loan isn’t seasoned. Every rate-sheet update re-checks them, and they’re flagged the moment they qualify.</div></div>
        <div class="actions"><button class="btn" id="wExp" ${rows.length ? "" : "disabled"}>Export CSV</button><button class="btn primary" id="wCamp" ${ready.length ? "" : "disabled"}>Create campaign from ${ready.length.toLocaleString()} ready</button></div></div>
      <div class="stats">
        <div class="stat"><div class="v">${watching.length.toLocaleString()}</div><div class="l">Watching</div></div>
        <div class="stat"><div class="v ${ready.length ? "brand" : ""}">${ready.length.toLocaleString()}</div><div class="l">Ready now</div></div>
        <div class="stat"><div class="v">${onRate.length.toLocaleString()}</div><div class="l">Waiting on rates</div></div>
        <div class="stat"><div class="v">${onTime.length.toLocaleString()}</div><div class="l">Waiting on seasoning</div></div>
        <div class="stat"><div class="v" style="font-size:18px">${s.rates.asOf ? fmtD(s.rates.asOf) : "—"}</div><div class="l">Rate sheet as of · <a href="#" id="toRates">update</a></div></div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>Add near-miss leads</h2><div class="hint">Checks your leads against an offer and adds the ones held back <i>only</i> by the rate market or seasoning. Leads blocked for other reasons (LTV, missing data) aren’t added.</div>
          <div class="row"><select id="wPreset" style="flex:1">${presetOptions().map(([v, t]) => `<option value="${esc(v)}" ${v === pv ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><button class="btn primary" id="wScan" ${App.L.leads.length ? "" : "disabled"}>Scan ${App.plural(App.L.leads.length, "lead")}</button></div>
          <div class="small muted" style="margin-top:8px" id="wPresetInfo"></div></div>
        <div class="panel"><h2>If rates drop…</h2><div class="hint">How many watched leads (already seasoned) would become eligible at each drop from today’s rate sheet.</div>
          ${watching.length ? `<div class="bars">${sens.map(x => `<div class="b"><div class="track"><div class="fill" style="width:${Math.round(x.count / maxS * 100)}%"></div><div class="lbl">↓ ${x.drop}%</div></div><div class="num small">${x.count.toLocaleString()}</div></div>`).join("")}</div>` : `<div class="small muted">Nothing on the watchlist yet.</div>`}</div>
      </div>
      <div class="panel" style="padding:12px 14px">
        <div class="row" style="margin-bottom:10px">${[["all", "All", rows.length], ["ready", "Ready now", ready.length], ["rate", "Waiting on rates", onRate.length], ["time", "Waiting on seasoning", onTime.length], ["campaign", "In a campaign", inCamp.length]].map(([k, t, n]) => `<button class="chip ${view === k ? "on" : ""}" data-wv="${k}">${t} <span class="c">${n}</span></button>`).join("")}
          <span class="spacer"></span>${sel.size ? `<span class="small muted">${sel.size} selected</span><button class="btn sm" id="wUnwatch">Remove from watchlist</button>${[...sel].some(id => (rows.find(r => r.e.id === id) || {}).e && rows.find(r => r.e.id === id).e.status === "campaign") ? '<button class="btn sm" id="wRewatch">Watch again</button>' : ""}` : ""}</div>
        ${shown.length ? `<div class="tablewrap" style="max-height:calc(100vh - 420px)"><table class="data"><thead><tr><th style="width:30px"><input type="checkbox" id="wAll"></th><th>Name</th><th>Watching for</th><th>Type</th><th class="num">Note rate</th><th class="num">Today’s rate</th><th class="num">Qualifies at</th><th>Seasoned</th><th>Status</th><th>Added</th></tr></thead><tbody>
        ${shown.slice(0, 500).map(r => `<tr class="${sel.has(r.e.id) ? "sel" : ""}"><td><input type="checkbox" data-w="${r.e.id}" ${sel.has(r.e.id) ? "checked" : ""}></td>
          <td>${esc(r.e.name)}<div class="tiny faint">${esc(r.e.email)}</div></td><td class="small">${esc(r.e.label)}</td><td>${esc(r.e.loanType)}</td>
          <td class="num">${pct(r.lead ? r.lead.rate : r.e.noteRate)}</td><td class="num">${r.ev.todayRate != null ? pct(r.ev.todayRate) : "—"}</td><td class="num"><b>≤ ${pct(r.e.need)}</b></td>
          <td class="small">${r.e.eligibleOn ? (r.ev.seasoned ? '<span class="good">✓</span> ' : "") + fmtD(r.e.eligibleOn) : '<span class="faint">—</span>'}</td>
          <td>${statusCell(r)}</td><td class="small muted">${new Date(r.e.addedAt).toLocaleDateString()}</td></tr>`).join("")}
        </tbody></table></div>${shown.length > 500 ? `<div class="tiny faint" style="margin-top:4px">Showing 500 of ${shown.length.toLocaleString()} — export for the full list.</div>` : ""}`
        : `<div class="empty">${rows.length ? "Nobody in this view." : "Scan your leads above to start watching."}</div>`}
      </div></div>`;

    const info = () => { const p = presetOf($("wPreset").value); if (!p) return; const o = W().fullOffer(p.offer), R = o.rules;
      $("wPresetInfo").innerHTML = esc([p.loanTypes ? p.loanTypes.join(" / ") + " leads" : "All leads", o.term + "-yr " + (o.product === "second" ? "home equity" : o.product === "cashout" ? "consolidation refi" : "refi"),
        o.product === "refi" ? "rate drop ≥ " + R.minRateDrop + "%" : "", R.minMonthlySave ? "saves ≥ $" + R.minMonthlySave + "/mo" : "",
        o.streamline && o.product === "refi" ? "FHA/VA seasoning (210 days + 6 payments)" : "", o.streamline && o.product === "refi" && R.vaRecoupMonths ? "VA recoupment ≤ " + R.vaRecoupMonths + " mo" : ""].filter(Boolean).join(" · ")); };
    $("wPreset").onchange = () => { ui.watchPreset = $("wPreset").value; App.save(); info(); }; info();
    $("toRates").onclick = e => { e.preventDefault(); App.S.ui.settingsTab = "rates"; App.go("settings"); };
    $("wScan").onclick = () => {
      const p = presetOf($("wPreset").value); const leads = App.L.leads.filter(l => !p.loanTypes || p.loanTypes.includes(l.loanType));
      App.toast("Scanning " + App.plural(leads.length, "lead") + "…", 1500);
      setTimeout(() => { const r = App.addToWatch(leads, p.offer, p.label, "scan");
        App.modal("Scan finished", `<div class="stats" style="margin:0"><div class="stat"><div class="v brand">${r.added.toLocaleString()}</div><div class="l">Added to the watchlist</div></div><div class="stat"><div class="v">${r.readyNow.toLocaleString()}</div><div class="l">Qualify today (not added)</div></div><div class="stat"><div class="v">${r.already.toLocaleString()}</div><div class="l">Already watching</div></div><div class="stat"><div class="v">${(r.hard + r.blocked).toLocaleString()}</div><div class="l">Held back by other rules or can\u2019t be emailed</div></div></div>
          <p class="small muted" style="margin-top:12px">Of those added: ${r.rate.toLocaleString()} are waiting on rates, ${r.time.toLocaleString()} on seasoning (some on both).${r.readyNow ? " Leads who qualify today belong in a campaign now — build one with this offer from Campaigns." : ""}</p>`, [{ label: "Done", cls: "primary" }], { width: 720 });
        App.render(); }, 30);
    };
    el.querySelectorAll("[data-wv]").forEach(b => b.onclick = () => { ui.watchView = b.dataset.wv; ui.watchSel = []; App.save(); App.render(); });
    el.querySelectorAll("[data-w]").forEach(cb => cb.onchange = () => { const s2 = new Set(ui.watchSel || []); if (cb.checked) s2.add(cb.dataset.w); else s2.delete(cb.dataset.w); ui.watchSel = [...s2]; App.render(); });
    if ($("wAll")) $("wAll").onchange = e => { ui.watchSel = e.target.checked ? shown.slice(0, 500).map(r => r.e.id) : []; App.render(); };
    if ($("wUnwatch")) $("wUnwatch").onclick = () => { for (const e of App.S.watchlist) if (sel.has(e.id)) e.status = "removed"; App.S.watchlist = App.S.watchlist.filter(e => e.status !== "removed"); ui.watchSel = []; App.save(); App.render(); };
    if ($("wRewatch")) $("wRewatch").onclick = () => { for (const e of App.S.watchlist) if (sel.has(e.id) && e.status === "campaign") { e.status = "watching"; e.campaignId = null; } ui.watchSel = []; App.save(); App.render(); };
    $("wExp").onclick = () => App.download("nmc-watchlist-" + App.todayISO() + ".csv", N.csv.stringify(["name", "email", "loanType", "watching", "noteRate", "todayRate", "qualifiesAt", "seasonedOn", "status", "added"],
      rows.map(r => ({ name: r.e.name, email: r.e.email, loanType: r.e.loanType, watching: r.e.label, noteRate: r.lead ? r.lead.rate : r.e.noteRate, todayRate: r.ev.todayRate, qualifiesAt: r.e.need, seasonedOn: r.e.eligibleOn || "",
        status: r.e.status === "campaign" ? "in campaign" : r.block ? r.block : r.ready ? "ready" : r.ev.status, added: r.e.addedAt.slice(0, 10) }))), "csv");
    $("wCamp").onclick = () => createFromReady(ready);
  };

  /* one campaign per offer among the ready leads, with copy written for "rates finally moved" */
  function createFromReady(ready) {
    const groups = new Map(); for (const r of ready) { const k = W().offerSig(r.e.offer); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    let first = null; const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    for (const rs of groups.values()) {
      const e0 = rs[0].e; const c = App.newCampaign("Watchlist · " + e0.label + " · " + date);
      c.offer = JSON.parse(JSON.stringify(e0.offer));
      c.filters = Object.assign({}, c.filters, { qualifiedOnly: true, sendableOnly: true });
      c.selected = rs.map(r => r.e.key);
      const v = c.variants[0];
      v.subject = "{{first_name}}, rates finally moved for your loan";
      v.preheader = "When we last looked it didn’t make sense to refinance. Today it does.";
      v.body = "Hi {{first_name|there}},\n\nWhen we last looked at your {{loan_type}} loan, rates hadn’t dropped far enough to make a refinance worth it for you. They have now, so I ran your numbers again — the full breakdown is below.\n\nIf it looks worth a conversation, reply to this email or pick a time that works for you.";
      App.S.campaigns.push(c);
      for (const r of rs) { r.e.status = "campaign"; r.e.campaignId = c.id; }
      first = first || c;
    }
    App.S.ui.audView = "selected"; App.save();
    App.toast(groups.size > 1 ? groups.size + " campaigns created (one per offer)" : "Campaign created with " + App.plural(ready.length, "ready lead"), 4500);
    App.go("campaign", { campaignId: first.id });
  }
})();

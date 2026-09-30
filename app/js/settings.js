/* Settings: company & branding, senders, licensing, rate sheet, sending/email service, data. */
(function () {
  "use strict";
  const { N, $, esc } = App;
  const TABS = [["company", "Company & branding"], ["senders", "Senders"], ["licensing", "Licensed states"], ["rates", "Rate sheet"], ["sending", "Sending"], ["data", "Data"]];

  App.screens.settings = function (el) {
    const tab = App.S.ui.settingsTab || "company"; const s = App.S.settings;
    el.innerHTML = `<div class="screen"><div class="head"><div><h1>Settings</h1><div class="lede">Shared by every campaign. Changes save automatically.</div></div></div>
      <div class="steps">${TABS.map(([k, t]) => `<button class="step ${k === tab ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</div><div id="tabbody"></div></div>`;
    el.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { App.S.ui.settingsTab = b.dataset.tab; App.save(); App.render(); });
    ({ company, senders, licensing, rates, sending, data })[tab]($("tabbody"), s);
  };

  function company(el, s) {
    el.innerHTML = `<div class="grid2"><div class="panel"><h2>Company</h2><div class="hint">Printed in every email’s header, signature and compliance footer.</div>
        <div class="fields wide">
          <label class="f">Company name<input type="text" data-bind="company"></label>
          <label class="f">Company NMLS #<input type="text" data-bind="companyNmls"></label>
          <label class="f">Main phone<input type="text" data-bind="companyPhone"><span class="h">Always shown so clients can verify the call is really from NMC.</span></label>
          <label class="f">Website<input type="url" data-bind="website"></label>
        </div>
        <label class="f" style="margin-top:12px">Physical mailing address <span class="h">Required by CAN-SPAM in every commercial email.</span><input type="text" data-bind="address" placeholder="Street, City, State ZIP"></label>
        <label class="f" style="margin-top:12px">Tagline<input type="text" data-bind="tagline"></label></div>
      <div class="panel"><h2>Logo</h2><div class="hint">Email clients won’t show a logo embedded in the email itself — it has to be a web address. Use a PNG (about 330×80 px for sharp phones) hosted on the company website or in your email service’s image library.</div>
        <label class="f">Logo image URL<input type="url" data-bind="logoUrl" placeholder="https://neighborhoodmc.com/…/logo.png"></label>
        <div style="margin-top:12px;padding:16px;border:1px dashed var(--line-strong);border-radius:10px;background:#fff;min-height:70px" id="logoPrev"></div>
        <div class="small muted" style="margin-top:8px">No URL yet? The header uses the company name in the brand serif — it looks intentional, not broken.</div></div></div>
      <div class="panel"><h2>Compliance footer</h2><div class="hint">Every email already includes the loan example (amount, rate, APR, term, payment, costs), company and banker NMLS numbers, Equal Housing Opportunity, the NMLS Consumer Access link, your address and an unsubscribe link. The text below follows the loan example. <b>Have compliance approve it before the first send.</b></div>
        <label class="f">Disclaimer<textarea data-bind="disclaimer" style="min-height:120px" placeholder="${esc(N.emailtpl.DEFAULT_DISCLAIMER)}"></textarea><span class="h">Leave blank to use the default shown in grey.</span></label>
        <label class="f" style="margin-top:12px">Why they’re receiving this<input type="text" data-bind="whyReceiving" placeholder="You’re receiving this because you’re a current or past client, or you asked us about your mortgage options."></label></div>`;
    const lp = () => { const box = $("logoPrev");
      box.innerHTML = s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="logo" style="max-height:46px">` : `<span style="font-family:var(--serif);font-size:19px">${esc(s.company)}</span><div class="small muted">${esc(s.tagline)}</div>`;
      const img = box.querySelector("img"); if (img) img.onerror = () => { box.innerHTML = '<span class="bad small">Couldn\u2019t load that image \u2014 check the URL is public.</span>'; }; };
    App.bind(el, s, (p) => { if (p === "logoUrl" || p === "company" || p === "tagline") lp(); }); lp();
  }

  function senders(el, s) {
    const d = s.defaultSender;
    el.innerHTML = `<div class="panel"><h2>Who each email comes from</h2><div class="hint">The sender’s name, NMLS #, phone and scheduling link appear in the header, button and signature.</div>
        <div class="row" style="gap:24px"><label class="check"><input type="radio" name="sm" value="company" ${s.senderMode !== "banker" ? "checked" : ""}> <span><b>One sender for everyone</b><br><span class="small muted">Every email is signed by the default sender below.</span></span></label>
          <label class="check"><input type="radio" name="sm" value="banker" ${s.senderMode === "banker" ? "checked" : ""}> <span><b>Each lead’s assigned banker</b><br><span class="small muted">Matched from the lead file’s banker column; leads with no match use the default sender.</span></span></label></div></div>
      <div class="panel"><h2>Default sender</h2><div class="fields wide">
        <label class="f">Name<input type="text" data-bind="defaultSender.name" placeholder="Dave Maxwell"></label>
        <label class="f">Title<input type="text" data-bind="defaultSender.title"></label>
        <label class="f">Email<input type="email" data-bind="defaultSender.email"><span class="h">Used as Reply-To when replies go to the banker.</span></label>
        <label class="f">Direct phone<input type="text" data-bind="defaultSender.phone"></label>
        <label class="f">NMLS #<input type="text" data-bind="defaultSender.nmls"></label>
        <label class="f">Scheduling link<input type="url" data-bind="defaultSender.ctaUrl" placeholder="https://calendly.com/…"><span class="h">Fills {{cta_url}}. Blank = the button calls their phone.</span></label>
      </div></div>
      <div class="panel"><div class="row"><h2>Bankers</h2><span class="spacer"></span><button class="btn sm" id="addB">+ Add banker</button></div><div class="hint">Used when “Each lead’s assigned banker” is on. A lead matches a banker when the lead file’s banker column equals the banker’s name, email, or one of the “also matches” names. Licensed states limit who that banker can email; leave blank to use the company list.</div>
        ${s.bankers.length ? `<div class="tablewrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>NMLS #</th><th>Scheduling link</th><th>Also matches</th><th>Licensed states</th><th></th></tr></thead><tbody>
        ${s.bankers.map((b, i) => `<tr>${["name", "email", "phone", "nmls", "ctaUrl", "aliases"].map(k => `<td><input type="text" data-b="${i}" data-k="${k}" value="${esc(b[k] || "")}" style="min-width:${k === "ctaUrl" ? 180 : 110}px;min-height:30px;padding:4px 8px"></td>`).join("")}
          <td><input type="text" data-b="${i}" data-k="states" value="${esc((b.states || []).join(", "))}" placeholder="MI, OH, …" style="min-width:150px;min-height:30px;padding:4px 8px"></td><td><button class="btn sm ghost" data-del="${i}">✕</button></td></tr>`).join("")}
        </tbody></table></div>` : `<div class="small muted">No bankers added.${unmatched()}</div>`}
        ${s.bankers.length ? `<div class="small muted" style="margin-top:8px">${unmatched()}</div>` : ""}</div>`;
    App.bind(el, s);
    el.querySelectorAll("[name=sm]").forEach(r => r.onchange = () => { s.senderMode = r.value; App.save(); App.invalidate(); });
    $("addB").onclick = () => { s.bankers.push({ name: "", title: "Loan Officer", email: "", phone: "", nmls: "", ctaUrl: "", aliases: "", states: [] }); App.save(); senders(el, s); };
    el.querySelectorAll("[data-b]").forEach(i => i.oninput = () => { const b = s.bankers[+i.dataset.b]; b[i.dataset.k] = i.dataset.k === "states" ? i.value.toUpperCase().split(/[^A-Z]+/).filter(x => x.length === 2) : i.value; App.save(); App.invalidate(); });
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { s.bankers.splice(+b.dataset.del, 1); App.save(); App.invalidate(); senders(el, s); });
    function unmatched() {
      const names = new Map(); for (const l of App.L.leads) if (l.banker) names.set(l.banker, (names.get(l.banker) || 0) + 1);
      const miss = [...names.entries()].filter(([n]) => !N.campaign.bankerFor({ banker: n }, s));
      return miss.length ? ` Banker names in your leads with no match: ${miss.slice(0, 8).map(([n, c]) => `<b>${esc(n)}</b> (${c})`).join(", ")}.` : "";
    }
  }

  function licensing(el, s) {
    const set = new Set(s.licensedStates);
    const counts = {}; for (const l of App.L.leads) if (l.state) counts[l.state] = (counts[l.state] || 0) + 1;
    el.innerHTML = `<div class="panel"><div class="row"><h2>Company licensed states</h2><span class="spacer"></span><span class="small muted">${set.size} selected</span></div>
      <div class="hint">Leads in any other state are never emailed — a mortgage offer to someone in a state you’re not licensed in is a licensing violation. Numbers show leads on file per state.</div>
      <div class="states">${Object.keys(N.fields.STATES).map(st => `<label class="${set.has(st) ? "on" : ""}"><input type="checkbox" data-st="${st}" ${set.has(st) ? "checked" : ""}>${st}${counts[st] ? `<span class="tiny faint">${counts[st]}</span>` : ""}</label>`).join("")}</div></div>`;
    el.querySelectorAll("[data-st]").forEach(c => c.onchange = () => { if (c.checked) set.add(c.dataset.st); else set.delete(c.dataset.st); s.licensedStates = [...set].sort(); c.parentElement.classList.toggle("on", c.checked); App.save(); App.invalidate(); });
  }

  function rates(el, s) {
    const t = s.rates.table; const rows = [["Conventional", [30, 20, 15]], ["FHA", [30, 15]], ["VA", [30, 15]], ["USDA", [30]], ["Jumbo", [30]], ["Second", [10, 15, 20, 30]]];
    el.innerHTML = `<div class="panel"><div class="row"><h2>Rate sheet</h2><span class="spacer"></span><label class="f" style="flex-direction:row;align-items:center;gap:6px">Rates as of<input type="date" data-bind="rates.asOf" style="width:auto"></label></div>
      <div class="hint">Each lead is quoted the rate for their loan type and the campaign’s term. The “as of” date prints in each email’s loan example. Update before every send — pricing moves daily.</div>
      <table class="data ratesheet" style="max-width:640px"><thead><tr><th>Program</th><th class="num">10-yr</th><th class="num">15-yr</th><th class="num">20-yr</th><th class="num">30-yr</th></tr></thead><tbody>
      ${rows.map(([r, terms]) => `<tr><td><b>${r === "Second" ? "Home equity (2nd)" : r}</b></td>${[10, 15, 20, 30].map(y => `<td class="num">${terms.includes(y) ? `<input type="number" step="0.001" data-rate="${r}|${y}" value="${(t[r] || {})[y] ?? ""}" placeholder="—">` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    App.bind(el, s, () => App.invalidate());
    el.querySelectorAll("[data-rate]").forEach(i => i.oninput = () => { const [r, y] = i.dataset.rate.split("|"); t[r] = t[r] || {}; t[r][y] = App.num(i.value); App.save(); App.invalidate(); });
  }

  async function sending(el, s) {
    const cat = App.providerCatalog || [{ id: "dryrun", label: "Dry run (nothing is sent)", fields: [], help: "" }];
    const pid = s.provider || "dryrun"; const prov = cat.find(p => p.id === pid) || cat[0];
    s.providerCfg[pid] = s.providerCfg[pid] || {}; const cfg = s.providerCfg[pid];
    const has = App.desktop ? await window.nmc.hasSecrets(pid) : {};
    const f = s.from;
    el.innerHTML = `<div class="grid2">
      <div class="panel"><h2>Email service</h2><div class="hint">Campaigns hand each finished email to this service. Switching services later doesn’t change anything else in the app.</div>
        <label class="f">Service<select id="prov">${cat.map(p => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select></label>
        ${prov.help ? `<div class="small muted" style="margin-top:8px">${esc(prov.help)}</div>` : ""}
        <div class="fields wide" style="margin-top:12px">${prov.fields.map(x => x.secret ? `<label class="f">${esc(x.label)} ${has[x.key] ? '<span class="secret-set">✓ saved</span>' : ""}<div class="inline-pair"><input type="password" data-secret="${x.key}" placeholder="${has[x.key] ? "•••••••• (enter to replace)" : esc(x.placeholder || "")}" autocomplete="off"><button class="btn sm" data-save="${x.key}">Save</button>${has[x.key] ? `<button class="btn sm ghost" data-clear="${x.key}">Clear</button>` : ""}</div>${x.help ? `<span class="h">${esc(x.help)}</span>` : ""}</label>`
          : x.type === "checkbox" ? `<label class="check"><input type="checkbox" data-cfg="${x.key}" ${cfg[x.key] ? "checked" : ""}> ${esc(x.label)}</label>`
          : x.type === "select" ? `<label class="f">${esc(x.label)}<select data-cfg="${x.key}">${x.options.map(o => `<option ${cfg[x.key] === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>`
          : `<label class="f">${esc(x.label)}<input type="text" data-cfg="${x.key}" value="${esc(cfg[x.key] || "")}" placeholder="${esc(x.placeholder || "")}">${x.help ? `<span class="h">${esc(x.help)}</span>` : ""}</label>`).join("")}</div>
        ${App.desktop ? `<div class="row" style="margin-top:12px"><button class="btn" id="ptest">Check connection</button><span class="small" id="ptestRes"></span></div><div class="tiny faint" style="margin-top:6px">${window.nmc.info().encrypted ? "Keys are encrypted with this computer’s keychain and never shown again." : "This computer has no keychain available — keys are stored in the app’s data folder unencrypted."}</div>` : `<div class="small muted" style="margin-top:10px">Keys can only be entered in the desktop app.</div>`}
      </div>
      <div class="panel"><h2>From &amp; reply-to</h2>
        <div class="fields wide">
          <label class="f">From address<input type="email" data-bind="from.fromEmail" placeholder="dave@neighborhoodmc.com"><span class="h">Must be on a domain authenticated with your email service — not Gmail/Outlook.com.</span></label>
          <label class="f">From name<input type="text" data-bind="from.fromNameTpl"><span class="h">Merge fields work: {{banker_name}}, {{company_name}}</span></label>
          <label class="f">Replies go to<select data-bind="from.replyToMode"><option value="banker">The lead’s banker / default sender</option><option value="fixed">A fixed address</option></select></label>
          <label class="f">Fixed reply-to<input type="email" data-bind="from.replyTo" placeholder="optional"></label>
        </div></div></div>
      <div class="grid2">
      <div class="panel"><h2>Unsubscribe</h2><div class="hint">Required on every marketing email. Gmail and Yahoo also require one-click unsubscribe for bulk senders.</div>
        <label class="f">Unsubscribe link<input type="url" data-bind="unsubscribeUrl" placeholder="https://neighborhoodmc.com/unsubscribe?e={{email}}"><span class="h">Use {{email}}, {{lead_id}}, {{campaign_id}}. Many services give you an unsubscribe page link — paste its address here.</span></label>
        <label class="f" style="margin-top:10px">Unsubscribe mailbox (List-Unsubscribe)<input type="email" data-bind="from.listUnsubMailto" placeholder="unsubscribe@neighborhoodmc.com"><span class="h">Adds the inbox “Unsubscribe” button. Someone must process these into the suppression list.</span></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-bind="from.oneClick"> The unsubscribe link supports one-click (it accepts a POST and unsubscribes immediately)</label></div>
      <div class="panel"><h2>Pace &amp; reputation</h2>
        <div class="fields"><label class="f">Emails per minute<input type="number" data-bind="from.ratePerMinute" min="1" max="600"></label><label class="f">Daily cap<input type="number" data-bind="from.dailyCap" placeholder="0 = no cap"><span class="h">Across all campaigns</span></label></div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <label class="check"><input type="checkbox" data-bind="from.authConfirmed"> SPF, DKIM and DMARC are set up for the From domain with this email service</label>
          <label class="check"><input type="checkbox" data-bind="from.warmedUp"> This domain is warmed up (it has been sending this volume for a few weeks)</label></div>
        <div class="small muted" style="margin-top:10px">New sending domain? Start around 200/day and roughly double every few days while bounces and complaints stay low.</div></div></div>`;
    App.bind(el, s, () => App.invalidate());
    $("prov").onchange = e => { s.provider = e.target.value; App.save(); sending(el, s); };
    el.querySelectorAll("[data-cfg]").forEach(i => i.addEventListener(i.type === "checkbox" || i.tagName === "SELECT" ? "change" : "input", () => { cfg[i.dataset.cfg] = i.type === "checkbox" ? i.checked : i.value.trim(); App.save(); }));
    el.querySelectorAll("[data-save]").forEach(b => b.onclick = async () => { const i = el.querySelector(`[data-secret="${b.dataset.save}"]`); if (!i.value) return; await window.nmc.setSecret(pid, b.dataset.save, i.value); i.value = ""; App.toast("Saved"); sending(el, s); });
    el.querySelectorAll("[data-clear]").forEach(b => b.onclick = async () => { await window.nmc.setSecret(pid, b.dataset.clear, ""); sending(el, s); });
    if ($("ptest")) $("ptest").onclick = async () => { App.saveNow(); await window.nmc.flush(); $("ptestRes").textContent = "Checking…"; const r = await window.nmc.testProvider(pid); $("ptestRes").innerHTML = `<span class="${r.ok ? "good" : "bad"}">${r.ok ? "✓ " : ""}${esc(r.detail)}</span>`; };
  }

  function data(el) {
    const info = App.desktop ? window.nmc.info() : null;
    el.innerHTML = `<div class="grid2"><div class="panel"><h2>Where your data lives</h2><div class="hint">Leads, campaigns and send logs are stored on this computer only and survive app updates. Lead files contain client information — don’t email or share them.</div>
        ${info ? `<div class="small" style="font-family:var(--mono);background:var(--cream-soft);padding:8px 10px;border-radius:8px;word-break:break-all">${esc(info.dataDir)}</div><button class="btn" id="odf" style="margin-top:10px">Open data folder</button>` : `<div class="small muted">Browser preview: data is kept in this browser.</div>`}</div>
      <div class="panel"><h2>Backup</h2><div class="hint">Settings, campaigns, column mappings and the suppression list (not leads, not API keys) as one file — to move to a new computer or keep a copy.</div>
        <div class="row"><button class="btn" id="bexp">Export settings backup</button><button class="btn" id="bimp">Restore from backup…</button></div></div></div>`;
    if ($("odf")) $("odf").onclick = () => window.nmc.openDataFolder();
    $("bexp").onclick = () => App.download("nmc-campaigns-backup-" + App.todayISO() + ".json", JSON.stringify(Object.assign({}, App.S, { ui: {} }), null, 1), "json");
    $("bimp").onclick = () => { const i = document.createElement("input"); i.type = "file"; i.accept = ".json"; i.onchange = () => { const r = new FileReader(); r.onload = async () => {
      let b; try { b = JSON.parse(r.result); } catch (e) { App.toast("That isn’t a backup file"); return; }
      if (!b.settings || !b.campaigns) { App.toast("That isn’t a backup file"); return; }
      if (await App.confirm("Restore this backup?", `<p>Replaces settings, ${App.plural(b.campaigns.length, "campaign")}, mappings and the suppression list (${(b.suppression || []).length.toLocaleString()} addresses). Leads and API keys are not touched.</p>`, "Restore")) {
        App.S.settings = b.settings; App.S.campaigns = b.campaigns; App.S.presets = b.presets || []; App.S.suppression = b.suppression || []; App.S.watchlist = b.watchlist || []; App.saveNow(); await App.load(); App.render(); App.toast("Restored"); } }; r.readAsText(i.files[0]); }; i.click(); };
  }
})();

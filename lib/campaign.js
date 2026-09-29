/* Campaign assembly — the one place that decides, for each lead, who the email is from, whether it
   may be sent, what the proposal says, and what the finished message is. The app window uses it
   for previews and checks; the send queue uses the same code, so what you preview is what goes out. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./loanmath"), require("./emailtpl"), require("./deliverability"), require("./merge"));
  else (root.NMC = root.NMC || {}).campaign = factory(root.NMC.loanmath, root.NMC.emailtpl, root.NMC.deliver, root.NMC.merge);
})(typeof self !== "undefined" ? self : this, function (LM, E, D, M) {
  "use strict";

  const keyOf = l => l.leadId ? "id:" + l.leadId : "em:" + (l.email || "").toLowerCase();
  const norm = s => String(s || "").trim().toLowerCase();

  function bankerFor(lead, settings) {
    const list = settings.bankers || []; if (!lead.banker) return null; const b = norm(lead.banker);
    return list.find(x => norm(x.name) === b || norm(x.email) === b || (x.aliases || "").split(",").map(norm).filter(Boolean).includes(b)) || null;
  }
  function senderFor(lead, settings) {
    const d = settings.defaultSender || {};
    if (settings.senderMode === "banker") { const b = bankerFor(lead, settings); if (b) return Object.assign({}, d, b, { _banker: true }); }
    return Object.assign({}, d);
  }
  function licensedFor(sender, settings) {
    if (settings.senderMode === "banker" && sender._banker && sender.states && sender.states.length) return new Set(sender.states);
    return new Set(settings.licensedStates || []);
  }

  function unsubscribeFor(lead, campaign, settings) {
    const t = settings.unsubscribeUrl || ""; if (!t) return "";
    return t.replace(/\{\{\s*email\s*\}\}/gi, encodeURIComponent(lead.email || "")).replace(/\{\{\s*lead_id\s*\}\}/gi, encodeURIComponent(lead.leadId || "")).replace(/\{\{\s*campaign_id\s*\}\}/gi, encodeURIComponent(campaign.id || ""));
  }

  /* everything about one lead in one campaign */
  function prepare(lead, campaign, state, opts) {
    opts = opts || {}; const settings = state.settings || {};
    const sender = senderFor(lead, settings);
    const analysis = LM.analyze(lead, campaign.offer, settings.rates);
    const suppressed = opts.suppressed || new Set((state.suppression || []).map(norm));
    const block = D.leadBlock(lead, { suppressed, licensed: licensedFor(sender, settings) });
    const out = { key: keyOf(lead), lead, sender, analysis, block };
    if (opts.render) {
      const unsub = unsubscribeFor(lead, campaign, settings);
      const r = E.build({ lead, analysis, sender, settings, campaign, unsubscribeUrl: unsub });
      out.rendered = r; out.warnings = D.leadWarnings(lead, r); out.unsub = unsub;
      out.message = messageFor(lead, sender, r, campaign, settings, unsub);
    }
    return out;
  }

  function messageFor(lead, sender, r, campaign, settings, unsub) {
    const from = settings.from || {};
    const ctx = M.context(lead, null, sender, settings);
    const fromName = M.fill(from.fromNameTpl || "{{banker_name}} | {{company_name}}", ctx).text.replace(/^\s*\|\s*|\s*\|\s*$/g, "").trim() || settings.company || "";
    const replyTo = from.replyToMode === "banker" && sender.email ? sender.email : (from.replyTo || "");
    const headers = {};
    const lu = []; if (from.listUnsubMailto) lu.push("<mailto:" + from.listUnsubMailto + "?subject=unsubscribe>"); if (unsub && /^https:/i.test(unsub)) lu.push("<" + unsub + ">");
    if (lu.length) headers["List-Unsubscribe"] = lu.join(", ");
    if (from.oneClick && unsub && /^https:/i.test(unsub)) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    return {
      to: lead.email, toName: lead.name || "", from: from.fromEmail || "", fromName, replyTo, subject: r.subject, html: r.html, text: r.text, headers,
      tags: ["nmc-campaign", String(campaign.id || "").slice(0, 60)].filter(Boolean),
      metadata: { campaignId: campaign.id || "", leadId: lead.leadId || "", banker: sender.name || "" },
    };
  }

  /* pick a lead that shows the offer at its best for previews and checks */
  function sampleLead(leads, campaign, state) {
    let best = null;
    for (const l of leads) { const a = LM.analyze(l, campaign.offer, (state.settings || {}).rates); if (a.ok && l.emailValid && (!best || a.saveMo > best.a.saveMo)) best = { l, a }; }
    return best ? best.l : leads[0] || null;
  }

  /* campaign-wide check against a rendered sample */
  function check(campaign, state, sample, volume) {
    const settings = state.settings || {}; const from = settings.from || {};
    const p = sample ? prepare(sample, campaign, state, { render: true }) : null;
    return D.checkCampaign({
      subject: campaign.subject, preheader: campaign.preheader, body: campaign.body,
      renderedSubject: p ? p.rendered.subject : campaign.subject, html: p ? p.rendered.html : "", bytes: p ? p.rendered.bytes : 0,
      unsubscribe: !!settings.unsubscribeUrl || /sendgrid/.test(settings.provider || "") && !!(settings.providerCfg || {}).asmGroupId,
      address: !!(settings.address || "").trim(), logo: !!settings.logoUrl,
      setup: { noSender: !((settings.defaultSender || {}).name), fromEmail: from.fromEmail, fromName: p ? p.message.fromName : from.fromNameTpl, replyTo: p ? p.message.replyTo : from.replyTo, authConfirmed: from.authConfirmed, provider: settings.provider, volume: volume || 0, warmedUp: from.warmedUp, warmCap: from.dailyCap || 500 },
    });
  }

  return { prepare, sampleLead, check, senderFor, bankerFor, keyOf, unsubscribeFor, messageFor };
});

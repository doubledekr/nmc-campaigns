/* Email-safe proposal. Same brand, sections and wording as the Banker Toolkit proposal, rebuilt for
   inboxes: 600px table layout, every style inline, no scripts, no SVG, web fonts only as a bonus
   (Georgia / Arial fallbacks), images only for the logo. Works in Gmail, Outlook (desktop + web),
   Apple Mail and phones. build() returns { subject, preheader, html, text, missing, bytes }. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./merge"));
  else (root.NMC = root.NMC || {}).emailtpl = factory(root.NMC.merge);
})(typeof self !== "undefined" ? self : this, function (M) {
  "use strict";
  const { money, pct, yrsMo, esc } = M;

  const C = { brand: "#A53222", brandDeep: "#7C2519", ink: "#343740", muted: "#5C616E", cream: "#EDE3D2", creamSoft: "#F7F1E6", line: "#E2DCCF", good: "#2E6B4F", accent: "#DDE4F4", paper: "#FBF8F2" };
  const SERIF = "Lora,Georgia,'Times New Roman',serif", SANS = "Montserrat,'Segoe UI',Helvetica,Arial,sans-serif";

  const DEFAULT_SECTIONS = { stats: true, benefits: true, table: true, bars: true, cta: true, signature: true };

  /* ---------- light markdown for the campaign copy: paragraphs, **bold**, *italic*, [text](url), "- " bullets ---------- */
  function inlineMd(s, linkColor) {
    return s
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" style="color:${linkColor};text-decoration:underline">${t}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  }
  function mdToHtml(escaped, color) {
    const blocks = escaped.replace(/\r/g, "").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    return blocks.map(b => {
      const lines = b.split("\n");
      if (lines.every(l => /^\s*[-•*]\s+/.test(l))) {
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0">` + lines.map(l =>
          `<tr><td valign="top" style="padding:0 8px 6px 2px;color:${C.brand};font-size:12px;line-height:22px;font-family:${SANS}">&#10095;</td><td style="padding:0 0 6px 0;font-family:${SANS};font-size:15px;line-height:22px;color:${C.ink}">${inlineMd(l.replace(/^\s*[-•*]\s+/, ""), color)}</td></tr>`).join("") + `</table>`;
      }
      return `<p style="margin:0 0 14px 0;font-family:${SANS};font-size:15px;line-height:23px;color:${C.ink}">${inlineMd(lines.join("<br>"), color)}</p>`;
    }).join("\n");
  }
  function mdToText(s) {
    return String(s || "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)").replace(/^[ \t]*[-•*][ \t]+/gm, "  • ");
  }

  /* ---------- proposal content (mirrors the toolkit's proposalSingleHTML wording) ---------- */
  function benefitsOf(L, a) {
    const b = [];
    if (a.second && a.dMonths === Infinity) b.push(`At today’s minimum payments your balances <b>never pay off</b> — a home equity loan gives them an end date of <b>${yrsMo(a.pw.months < a.n ? a.pw.months : a.n)}</b>`);
    if (a.saveMo > 0) b.push(`Free up <b>${money(a.saveMo)}/month</b> in cash flow from day one`);
    if (a.fhaS) b.push(`<b>No origination fee and no closing costs out of pocket</b> — on an FHA Streamline the lender covers the costs; the only charge is FHA’s upfront mortgage insurance premium (${money(a.mipAmt)}), financed into the loan`);
    if (a.fhaS) b.push(`<b>No appraisal and no income re-verification</b> — the FHA Streamline is built to be simple`);
    if (a.prog === "va_irrrl") b.push(`<b>VA IRRRL</b> — typically no appraisal or income re-verification, and the VA funding fee drops to 0.5% (waived for exempt veterans)`);
    b.push(`<b>No prepayment penalty</b> — pay extra or pay it off early whenever it makes sense, with no fee`);
    if (a.dBal > 0) b.push(`Consolidate <b>${money(a.dBal)}</b> in other debt — balances paid to zero at closing`);
    if (a.dBal > 0 && a.blended != null && a.rate < a.blended) b.push(a.second
      ? `Replace ${a.dApr ? "a <b>" + pct(a.blended) + "</b> average APR" : "high-interest balances"} with one <b>${pct(a.rate)}</b> fixed home equity loan`
      : `Replace a <b>${pct(a.blended)}</b> blended rate across your mortgage and debts with one <b>${pct(a.rate)}</b> loan`);
    if (a.skipCash > 0) b.push(`Skip ${a.skipN === 1 ? "your next payment" : "your next " + a.skipN + " payments"} — roughly <b>${money(a.skipCash)}</b> stays in your pocket at closing`);
    if (a.second) {
      if (a.extra > 0 && (a.debtFreeSooner > 0 || a.interestSaved > 0))
        b.push(`Keep paying what you pay now (<b>${money(a.outlayNow)}/mo</b>) and you’re <b>debt-free in ${yrsMo(a.pw.months)}</b>${a.debtFreeSooner > 0 ? ` — ${yrsMo(a.debtFreeSooner)} sooner than today’s path` : ""}${a.interestSaved > 0 ? `, saving <b>${money(a.interestSaved)}</b> in interest` : ""}`);
    } else if (a.extra > 0 && a.termCut > 0) b.push(`Keep paying what you pay now and be <b>mortgage-free ${yrsMo(a.termCut)} sooner</b>${a.interestSaved > 0 ? `, saving <b>${money(a.interestSaved)}</b> in interest` : ""}`);
    if (a.extra > 0 && a.pwEff < a.rate - 0.05) b.push(`Paying what you pay now makes your <b>effective rate ${pct(a.pwEff)}</b> — the loan is ${pct(a.rate)} on paper, but the extra going to principal means you pay interest like a ${pct(a.pwEff)} loan`);
    return b;
  }

  function statsOf(L, a) {
    const s = [];
    s.push({ v: money(a.newPay) + "/mo", l: "New " + (a.second ? "loan" : "principal & interest") + " payment" });
    if (a.saveMo > 0) s.push({ v: money(a.saveMo) + "/mo", l: "Freed up every month" });
    if (a.interestSaved > 0 && a.extra > 0) s.push({ v: money(a.interestSaved), l: "Interest saved paying what you pay now" });
    else if (a.skipCash > 0) s.push({ v: money(a.skipCash), l: "Kept at closing (skipped payment" + (a.skipN > 1 ? "s" : "") + ")" });
    else s.push({ v: pct(a.rate), l: a.term + "-year fixed rate · " + pct(a.apr) + " APR" });
    return s.slice(0, 3);
  }

  function compareRows(L, a) {
    if (a.second) return [
      ["Balances owed", money(a.dBal), money(a.newP) + " — one loan"],
      ["Rate", a.dApr ? pct(a.dApr) + " average APR" : "Varies (card rates)", pct(a.rate) + " fixed"],
      ["APR", "", pct(a.apr) + (a.aprEst ? " (est.)" : "")],
      ["Monthly payments", money(a.dPay) + (a.dPayEst ? " (est.)" : ""), money(a.newPay)],
      ["Paid off in", a.dMonths === Infinity ? "Never at minimums" : a.dMonths > 0 ? yrsMo(a.dMonths) : "—", yrsMo(a.n) + (a.extra > 0 && isFinite(a.pw.months) ? " (or " + yrsMo(a.pw.months) + " paying what you pay now)" : "")],
    ];
    const rows = [
      ["Loan amount", money(L.balance), money(a.newP)],
      ["Interest rate", pct(L.rate), pct(a.rate)],
      ["APR", "", pct(a.apr) + (a.aprEst ? " (est.)" : "")],
      ["Term", L.monthsLeft ? yrsMo(L.monthsLeft) + " left" : "—", a.term + " years"],
      ["Principal & interest", money(a.curPay), money(a.newPay)],
    ];
    if (a.dBal > 0) { rows.push(["Other debt payments", money(a.dPay) + (a.dPayEst ? " (est.)" : ""), "$0 — paid off"]); rows.push(["<b>Total monthly</b>", "<b>" + money(a.outlayNow) + "</b>", "<b>" + money(a.newPay) + "</b>"]); }
    return rows;
  }

  function programLine(L, a) {
    if (a.second) return "Home equity loan — your first mortgage stays as it is";
    if (a.fhaS) return "FHA Streamline refinance";
    if (a.prog === "va_irrrl") return "VA IRRRL refinance";
    return a.product === "cashout" ? "Debt consolidation refinance" : "Rate-and-term refinance";
  }

  function assumptionsLine(L, a, settings) {
    const rd = settings.rates && settings.rates.asOf ? " as of " + new Date(settings.rates.asOf + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
    return `Example based on a ${money(a.newP)} ${a.second ? "home equity loan" : "loan"} at ${pct(a.rate)} (${pct(a.apr)} APR${a.aprEst ? ", estimated" : ""}) for ${a.term} years: ${a.n} monthly principal and interest payments of ${M.money2(a.newPay)}. ` +
      `Assumes ${a.fhaS ? "an FHA Streamline with " + money(a.mipAmt) + " upfront MIP financed" : money(a.costs) + " in estimated closing costs" + (a.second ? "" : " financed into the loan")}${rd ? ", pricing" + rd : ""}. ` +
      `Payment shown excludes taxes and insurance; the actual payment will be higher if escrowed. Figures use the loan information we have on file for you${L._balanceEst ? " (balance estimated)" : ""}, which may not be current.`;
  }

  /* ---------- the email ---------- */
  function build(opts) {
    const { lead: L, analysis: a, sender = {}, settings = {}, campaign = {} } = opts;
    const sections = Object.assign({}, DEFAULT_SECTIONS, campaign.sections || {});
    const ctx = M.context(L, a, sender, settings);
    const unsub = opts.unsubscribeUrl || "";
    const missing = [];
    const f = (tpl, html) => { const r = M.fill(tpl, ctx, { html }); missing.push(...r.missing); return r.text; };

    const subject = f(campaign.subject || "", false).trim();
    const preheader = f(campaign.preheader || "", false).trim();
    const bodyHtml = mdToHtml(f(campaign.body || "", true), C.brand);
    const bodyText = mdToText(f(campaign.body || "", false));
    const ctaText = f(campaign.ctaText || "Schedule a quick call", false);
    const ctaUrl = M.fill(campaign.ctaUrl || "{{cta_url}}", ctx).text.trim() || (sender.phone ? "tel:" + sender.phone.replace(/[^\d+]/g, "") : "");   /* no scheduling link: the button calls the sender */

    const co = settings.company || "Neighborhood Mortgage Company";
    const coPhone = settings.companyPhone || "844-210-3644";
    const logo = settings.logoUrl ? `<img src="${esc(settings.logoUrl)}" width="165" alt="${esc(co)}" style="display:block;border:0;outline:none;width:165px;max-width:165px;height:auto">`
      : `<span style="font-family:${SERIF};font-size:19px;color:${C.ink};line-height:24px">${esc(co)}</span>`;
    const title = a.second ? "Home Equity Proposal" : "Mortgage Savings Proposal";
    const hasProp = a && a.newPay > 0;

    const stats = hasProp && sections.stats ? statsOf(L, a) : [];
    const statsHtml = stats.length ? `<tr><td style="padding:0 28px 6px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${stats.map((s, i) => `<td class="stack" width="${Math.floor(100 / stats.length)}%" valign="top" style="height:100%;padding:${i ? "0 0 8px 8px" : "0 0 8px 0"}">
        <table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="height:100%;background:${C.creamSoft};border:1px solid ${C.line};border-radius:10px"><tr><td valign="top" style="padding:12px 14px">
          <div style="font-family:${SERIF};font-size:21px;line-height:26px;color:${C.brand}">${esc(s.v)}</div>
          <div style="font-family:${SANS};font-size:12px;line-height:16px;color:${C.muted};padding-top:2px">${esc(s.l)}</div>
        </td></tr></table></td>`).join("")}
      </tr></table></td></tr>` : "";

    const h2 = t => `<tr><td style="padding:18px 28px 6px 28px;font-family:${SERIF};font-size:17px;line-height:22px;color:${C.ink}"><span style="color:${C.brand};font-size:12px">&#10095;</span> ${t}</td></tr>`;

    const benefits = hasProp && sections.benefits ? benefitsOf(L, a) : [];
    const benefitsHtml = benefits.length ? h2("What this does for you") + `<tr><td style="padding:0 28px 4px 28px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">` +
      benefits.map(b => `<tr><td valign="top" style="padding:0 8px 7px 2px;color:${C.brand};font-size:11px;line-height:21px;font-family:${SANS}">&#10095;</td><td style="padding:0 0 7px 0;font-family:${SANS};font-size:14px;line-height:21px;color:${C.ink}">${b.replace(/<b>/g, `<b style="color:${C.ink}">`)}</td></tr>`).join("") + `</table></td></tr>` : "";

    const rows = hasProp && sections.table ? compareRows(L, a) : [];
    const th = (t, right) => `<th align="${right ? "right" : "left"}" style="background:${C.cream};color:${C.ink};padding:8px 10px;font-family:${SANS};font-size:12px;font-weight:700;text-align:${right ? "right" : "left"};border-bottom:2px solid ${C.brand}">${t}</th>`;
    const tableHtml = rows.length ? h2("Today vs. your proposal") + `<tr><td style="padding:0 28px 4px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      <tr>${th("")}${th("Today", 1)}${th("Proposed", 1)}</tr>
      ${rows.map(r => `<tr><td style="padding:7px 10px;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:13px;color:${C.ink}">${r[0]}</td><td align="right" style="padding:7px 10px;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:13px;color:${C.muted};text-align:right">${r[1]}</td><td align="right" style="padding:7px 10px;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:13px;color:${C.ink};font-weight:600;text-align:right;background:${C.creamSoft}">${r[2].replace(/^\$0 — paid off$/, `<span style="color:${C.good}">$0 — paid off</span>`)}</td></tr>`).join("")}
      </table></td></tr>` : "";

    /* payment bars: pure table cells, so they render everywhere (no images, no SVG) */
    let barsHtml = "";
    if (hasProp && sections.bars && a.outlayNow > 0 && a.newPay > 0) {
      const max = Math.max(a.outlayNow, a.newPay), w1 = Math.max(8, Math.round(a.outlayNow / max * 100)), w2 = Math.max(8, Math.round(a.newPay / max * 100));
      const bar = (label, val, w, color) => `<tr><td style="padding:0 0 3px 0;font-family:${SANS};font-size:12px;color:${C.muted}">${label}</td></tr>
        <tr><td style="padding:0 0 10px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="${w}%" style="background:${color};height:26px;border-radius:4px;font-family:${SANS};font-size:13px;font-weight:700;color:#ffffff;padding:0 10px;white-space:nowrap">${val}</td>
          ${w < 100 ? `<td width="${100 - w}%" style="font-size:1px;line-height:1px">&nbsp;</td>` : ""}</tr></table></td></tr>`;
      barsHtml = h2("Your monthly payment") + `<tr><td style="padding:2px 28px 0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${bar(a.second ? "Today — payments on those debts" : a.dBal > 0 ? "Today — mortgage + other debts" : "Today — principal & interest", money(a.outlayNow) + "/mo", w1, "#9AA7C9")}
        ${bar("With this " + (a.second ? "home equity loan" : "refinance"), money(a.newPay) + "/mo", w2, C.brand)}
        </table></td></tr>`;
    }

    const ctaHtml = sections.cta && ctaUrl ? `<tr><td align="center" style="padding:20px 28px 8px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.brand}" style="background:${C.brand};border-radius:8px">
        <a href="${esc(ctaUrl)}" style="display:inline-block;padding:13px 28px;font-family:${SANS};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(ctaText)}</a>
      </td></tr></table>
      ${sender.phone ? `<div style="font-family:${SANS};font-size:13px;color:${C.muted};padding-top:10px">or call / text ${esc(sender.name ? sender.name.split(" ")[0] : "me")} at <a href="tel:${esc(sender.phone.replace(/[^\d+]/g, ""))}" style="color:${C.brand};text-decoration:none;font-weight:600">${esc(sender.phone)}</a></div>` : ""}
    </td></tr>` : "";

    const sigHtml = sections.signature ? `<tr><td style="padding:18px 28px 22px 28px;border-top:1px solid ${C.line}">
      <div style="font-family:${SERIF};font-size:16px;color:${C.ink}">${esc(sender.name || co)}</div>
      <div style="font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted}">${esc(sender.title || (sender.nmls ? "Loan Officer" : ""))}${sender.nmls ? " · NMLS #" + esc(sender.nmls) : ""}<br>
      ${sender.phone ? `<a href="tel:${esc(sender.phone.replace(/[^\d+]/g, ""))}" style="color:${C.muted};text-decoration:none">${esc(sender.phone)}</a> · ` : ""}${sender.email ? `<a href="mailto:${esc(sender.email)}" style="color:${C.muted};text-decoration:none">${esc(sender.email)}</a><br>` : ""}
      ${esc(co)} · <a href="tel:${esc(coPhone.replace(/[^\d+]/g, ""))}" style="color:${C.muted};text-decoration:none">${esc(coPhone)}</a></div></td></tr>` : "";

    const disclaimer = (hasProp ? assumptionsLine(L, a, settings) + " " : "") + (settings.disclaimer || DEFAULT_DISCLAIMER);
    const footer = `<tr><td style="padding:16px 28px 26px 28px;background:${C.paper};border-top:1px solid ${C.line};font-family:${SANS};font-size:10.5px;line-height:16px;color:#777777">
      ${esc(disclaimer)}<br><br>
      ${esc(co)} · NMLS #${esc(settings.companyNmls || "2484730")}${sender.nmls ? " · Loan Officer NMLS #" + esc(sender.nmls) : ""} · Equal Housing Opportunity · <a href="https://www.nmlsconsumeraccess.org/" style="color:#777777">nmlsconsumeraccess.org</a><br>
      ${esc(settings.address || "")}${settings.address ? "<br>" : ""}
      ${esc(settings.whyReceiving || "You’re receiving this because you’re a current or past client, or you asked us about your mortgage options.")}
      ${unsub ? ` <a href="${esc(unsub)}" style="color:#777777;text-decoration:underline">Unsubscribe</a>` : ""}
    </td></tr>`;

    const pre = preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper};opacity:0">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>` : "";

    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<title>${esc(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Lora&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%}table{border-collapse:collapse}img{border:0;line-height:100%}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media only screen and (max-width:620px){.container{width:100%!important}.stack{display:block!important;width:100%!important;padding:0 0 8px 0!important}.px{padding-left:18px!important;padding-right:18px!important}.hdr-r{display:block!important;text-align:left!important;padding-top:8px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.creamSoft}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.creamSoft}"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-top:4px solid ${C.brand};border-radius:4px">
<tr><td class="px" style="padding:22px 28px 16px 28px;border-bottom:1px solid ${C.line}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td valign="middle">${logo}${settings.tagline !== "" ? `<div style="font-family:${SANS};font-size:11px;color:#666666;padding-top:4px">${esc(settings.tagline || "Modern Mortgages, Human Approach.")}</div>` : ""}</td>
  <td class="hdr-r" align="right" valign="middle" style="font-family:${SANS};font-size:11px;line-height:17px;color:#444444;text-align:right"><b>${esc(sender.name || co)}</b>${sender.nmls ? " · NMLS #" + esc(sender.nmls) : ""}<br>${esc(sender.phone || coPhone)}${sender.email ? "<br>" + esc(sender.email) : ""}</td>
  </tr></table></td></tr>
<tr><td class="px" style="padding:24px 28px 8px 28px">${bodyHtml}</td></tr>
${hasProp ? `<tr><td class="px" style="padding:10px 28px 0 28px"><div style="font-family:${SANS};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.brand};font-weight:700">Prepared for ${esc(L.name || "you")}</div>
  <div style="font-family:${SERIF};font-size:23px;line-height:30px;color:${C.ink};padding:4px 0 2px 0">${title}</div>
  <div style="font-family:${SANS};font-size:12px;line-height:18px;color:#555555;padding-bottom:12px">${esc([L.city && L.state ? L.city + ", " + L.state : L.state, L.loanType].filter(Boolean).join(" · "))}${L.city || L.state || L.loanType ? " · " : ""}${esc(programLine(L, a))}</div></td></tr>` : ""}
${statsHtml}${benefitsHtml}${tableHtml}${barsHtml}${ctaHtml}
${sigHtml}
${footer}
</table>
</td></tr></table>
</body></html>`;

    /* plain-text part — written, not stripped from the HTML, so it reads well on its own */
    const T = [];
    T.push(bodyText.trim());
    if (hasProp) {
      T.push("", "=".repeat(40), title.toUpperCase() + " — " + (L.name || "").toUpperCase(), programLine(L, a), "=".repeat(40));
      if (stats.length) T.push("", ...stats.map(s => "  " + s.v + "  — " + s.l));
      if (benefits.length) T.push("", "What this does for you:", ...benefits.map(b => "  • " + b.replace(/<[^>]+>/g, "")));
      if (rows.length) T.push("", "Today vs. proposed:", ...rows.map(r => "  " + r[0].replace(/<[^>]+>/g, "") + ": " + (r[1] ? r[1].replace(/<[^>]+>/g, "") + " → " : "") + r[2].replace(/<[^>]+>/g, "")));
    }
    if (sections.cta && ctaUrl) T.push("", ctaText + ": " + ctaUrl);
    T.push("", "--", sender.name || co, [sender.nmls ? "NMLS #" + sender.nmls : "", sender.phone, sender.email].filter(Boolean).join(" · "), co + " · " + coPhone);
    T.push("", disclaimer, "", co + " · NMLS #" + (settings.companyNmls || "2484730") + " · Equal Housing Opportunity", settings.address || "");
    if (unsub) T.push("Unsubscribe: " + unsub);
    const text = T.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";

    const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(html).length : html.length;
    return { subject, preheader, html, text, missing: [...new Set(missing)], bytes };
  }

  const DEFAULT_DISCLAIMER = "This is an estimate for discussion purposes only, based on information on file and current market pricing, which changes daily. It is not a Loan Estimate, an offer or commitment to lend, a rate lock, or an approval. Rates, APR, payments and program availability are subject to change and to credit approval, underwriting, property eligibility and lender and agency guidelines. Consolidating short-term debt into a mortgage or home equity loan may increase the total interest paid on that debt over the life of the loan and converts unsecured debt into debt secured by your home. Refinancing may increase the total finance charges over the life of the loan.";

  return { build, benefitsOf, statsOf, DEFAULT_DISCLAIMER, DEFAULT_SECTIONS, COLORS: C, mdToHtml, mdToText };
});

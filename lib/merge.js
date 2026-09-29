/* Merge fields: {{first_name}}, {{monthly_savings}}, {{first_name|there}} (fallback after the bar).
   context(lead, analysis, sender, settings) builds every value once per lead; fill() swaps them in,
   HTML-escaping when the target is HTML, and reports any field that came up empty. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NMC = root.NMC || {}).merge = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const money = v => v == null || !isFinite(v) ? "" : "$" + Math.round(v).toLocaleString("en-US");
  const money2 = v => v == null || !isFinite(v) ? "" : "$" + (+v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = v => v == null || !isFinite(v) ? "" : (Math.round(v * 1000) / 1000).toFixed(3).replace(/0$/, "") + "%";
  function yrsMo(m) { if (m == null || !isFinite(m) || m <= 0) return ""; m = Math.round(m); const y = Math.floor(m / 12), mo = m % 12;
    return [y ? y + (y === 1 ? " year" : " years") : "", mo ? mo + (mo === 1 ? " month" : " months") : ""].filter(Boolean).join(" "); }
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* what the composer's "Insert field" menu offers */
  const FIELDS = [
    ["first_name", "First name"], ["last_name", "Last name"], ["full_name", "Full name"], ["city", "City"], ["state", "State"],
    ["loan_type", "Loan type"], ["current_rate", "Current rate"], ["new_rate", "Offered rate"], ["apr", "APR"],
    ["current_payment", "Current payment (P&I)"], ["new_payment", "New payment"], ["monthly_savings", "Monthly savings"],
    ["interest_saved", "Interest saved (pay what you pay now)"], ["time_saved", "Paid off sooner by"], ["effective_rate", "Effective rate (pay what you pay now)"],
    ["debt_balance", "Debt balance"], ["debt_payment", "Debt payments / mo"], ["skip_amount", "Skipped-payment cash"], ["new_term", "New term"],
    ["property_value", "Property value"], ["equity", "Equity"], ["banker_name", "Banker / sender name"], ["banker_phone", "Banker phone"],
    ["banker_email", "Banker email"], ["banker_nmls", "Banker NMLS #"], ["company_name", "Company name"], ["company_phone", "Company phone"],
    ["rate_date", "Rates as of"], ["cta_url", "Call-to-action link"],
  ];

  function context(lead, a, sender, settings) {
    lead = lead || {}; a = a || {}; sender = sender || {}; settings = settings || {};
    const rates = settings.rates || {};
    return {
      first_name: lead.firstName || "", last_name: lead.lastName || "", full_name: lead.name || "", email: lead.email || "",
      city: lead.city || "", state: lead.state || "", address: lead.address || "", loan_type: lead.loanType || "",
      current_rate: pct(lead.rate), new_rate: pct(a.rate), apr: pct(a.apr), effective_rate: a.extra > 0 ? pct(a.pwEff) : "",
      current_payment: money(a.second ? a.outlayNow : a.curPay), new_payment: money(a.newPay),
      monthly_savings: a.saveMo > 0 ? money(a.saveMo) : "",
      interest_saved: a.interestSaved > 0 ? money(a.interestSaved) : "",
      time_saved: yrsMo(a.second ? a.debtFreeSooner : a.termCut),
      debt_balance: money(lead.debtBalance), debt_payment: money(a.dPay || lead.debtPayment),
      skip_amount: a.skipCash > 0 ? money(a.skipCash) : "", new_term: a.term ? a.term + " years" : "",
      property_value: money(lead.value), equity: money(lead.equity),
      banker_name: sender.name || "", banker_phone: sender.phone || "", banker_email: sender.email || "", banker_nmls: sender.nmls || "",
      company_name: settings.company || "Neighborhood Mortgage Company", company_phone: settings.companyPhone || "844-210-3644",
      rate_date: rates.asOf ? new Date(rates.asOf + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "",
      cta_url: sender.ctaUrl || settings.ctaUrl || "",
    };
  }

  /* returns { text, missing:[field] } */
  function fill(tpl, ctx, opts) {
    opts = opts || {}; const missing = [];
    const text = String(tpl || "").replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (m, key, fb) => {
      const k = key.toLowerCase(); let v = ctx[k];
      if (v == null || v === "") { if (fb != null) v = fb.trim(); else { if (!(k in ctx)) missing.push(k + " (unknown field)"); else missing.push(k); v = ""; } }
      return opts.html ? esc(v) : String(v);
    });
    return { text: opts.html ? text : text.replace(/[ \t]{2,}/g, " "), missing };
  }

  function fieldsUsed(tpl) { const out = new Set(); String(tpl || "").replace(/\{\{\s*([a-z_]+)/gi, (m, k) => out.add(k.toLowerCase())); return [...out]; }

  return { FIELDS, context, fill, fieldsUsed, money, money2, pct, yrsMo, esc };
});

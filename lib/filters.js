/* Lead filters. A filter set is a plain object the campaign saves, so re-opening a campaign
   re-applies the same audience. `custom` holds any extra conditions on any field, including
   raw CSV columns ("raw:Column Name"). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NMC = root.NMC || {}).filters = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EMPTY = { q: "", rateMin: null, rateMax: null, loanTypes: [], regions: [], states: [], sources: [], bankers: [],
    equityMin: null, equityMax: null, ltvMax: null, ltvMin: null, debtMin: null, debtMax: null, ficoMin: null, balanceMin: null, balanceMax: null,
    saveMin: null, rateDropMin: null, qualifiedOnly: true, sendableOnly: true, custom: [] };

  const num = v => v === "" || v == null || !isFinite(+v) ? null : +v;
  function get(lead, field, analysis) {
    if (field.startsWith("raw:")) return lead._raw ? lead._raw[field.slice(4)] : undefined;
    if (field.startsWith("a.")) return analysis ? analysis[field.slice(2)] : undefined;
    return lead[field];
  }
  function test(v, op, val) {
    const nv = parseFloat(String(v).replace(/[$,%]/g, "")), nval = parseFloat(val);
    const s = String(v == null ? "" : v).toLowerCase(), sval = String(val == null ? "" : val).toLowerCase();
    switch (op) {
      case ">=": return isFinite(nv) && nv >= nval;
      case "<=": return isFinite(nv) && nv <= nval;
      case ">": return isFinite(nv) && nv > nval;
      case "<": return isFinite(nv) && nv < nval;
      case "=": return isFinite(nv) && isFinite(nval) ? nv === nval : s === sval;
      case "!=": return isFinite(nv) && isFinite(nval) ? nv !== nval : s !== sval;
      case "contains": return s.includes(sval);
      case "not contains": return !s.includes(sval);
      case "is empty": return v == null || s.trim() === "";
      case "is not empty": return !(v == null || s.trim() === "");
      default: return true;
    }
  }

  /* ctx: { analysisOf(lead) → analysis, blockedOf(lead) → reason string or "" } */
  function matches(lead, f, ctx) {
    f = f || EMPTY; const a = ctx && ctx.analysisOf ? ctx.analysisOf(lead) : null;
    const inRange = (v, lo, hi) => { lo = num(lo); hi = num(hi); if (lo == null && hi == null) return true; if (v == null) return false; return (lo == null || v >= lo) && (hi == null || v <= hi); };
    if (f.q) { const q = f.q.toLowerCase(); const hay = [lead.name, lead.email, lead.city, lead.state, lead.zip, lead.leadId, lead.address, lead.source, lead.banker].join(" ").toLowerCase(); if (!q.split(/\s+/).every(w => hay.includes(w))) return false; }
    if (!inRange(lead.rate, f.rateMin, f.rateMax)) return false;
    if (f.loanTypes && f.loanTypes.length && !f.loanTypes.includes(lead.loanType || "(blank)")) return false;
    if (f.regions && f.regions.length && !f.regions.includes(lead.region || "(blank)")) return false;
    if (f.states && f.states.length && !f.states.includes(lead.state || "(blank)")) return false;
    if (f.sources && f.sources.length && !f.sources.includes(lead.source || "(blank)")) return false;
    if (f.bankers && f.bankers.length && !f.bankers.includes(lead.banker || "(blank)")) return false;
    if (!inRange(lead.equity, f.equityMin, f.equityMax)) return false;
    if (!inRange(lead.ltv, f.ltvMin, f.ltvMax)) return false;
    if (num(f.debtMin) != null || num(f.debtMax) != null) { if (!inRange(lead.debtBalance || 0, f.debtMin, f.debtMax)) return false; }
    if (num(f.ficoMin) != null && !(lead.fico >= num(f.ficoMin))) return false;
    if (!inRange(lead.balance, f.balanceMin, f.balanceMax)) return false;
    if (num(f.saveMin) != null && !(a && a.saveMo >= num(f.saveMin))) return false;
    if (num(f.rateDropMin) != null && !(a && a.rateDrop != null && a.rateDrop >= num(f.rateDropMin))) return false;
    if (f.qualifiedOnly && !(a && a.ok)) return false;
    if (f.sendableOnly && ctx && ctx.blockedOf && ctx.blockedOf(lead)) return false;
    for (const c of f.custom || []) { if (!c || !c.field) continue; if (!test(get(lead, c.field, a), c.op, c.value)) return false; }
    return true;
  }

  function apply(leads, f, ctx) { return leads.filter(l => matches(l, f, ctx)); }

  /* distinct values for a multi-select filter, with counts */
  function facets(leads, field) {
    const m = new Map(); for (const l of leads) { const v = l[field] || "(blank)"; m.set(v, (m.get(v) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  }

  function describe(f) {
    const out = []; const $ = v => "$" + Number(v).toLocaleString("en-US");
    if (f.q) out.push("“" + f.q + "”");
    if (num(f.rateMin) != null || num(f.rateMax) != null) out.push("rate " + (num(f.rateMin) != null ? f.rateMin + "%" : "any") + "–" + (num(f.rateMax) != null ? f.rateMax + "%" : "any"));
    if (f.loanTypes && f.loanTypes.length) out.push(f.loanTypes.join("/"));
    if (f.regions && f.regions.length) out.push(f.regions.join(", "));
    if (f.states && f.states.length) out.push(f.states.join(", "));
    if (num(f.equityMin) != null) out.push("equity ≥ " + $(f.equityMin));
    if (num(f.ltvMax) != null) out.push("LTV ≤ " + f.ltvMax + "%");
    if (num(f.debtMin) != null) out.push("debt ≥ " + $(f.debtMin));
    if (num(f.ficoMin) != null) out.push("FICO ≥ " + f.ficoMin);
    if (num(f.saveMin) != null) out.push("saves ≥ " + $(f.saveMin) + "/mo");
    if (num(f.rateDropMin) != null) out.push("rate drop ≥ " + f.rateDropMin + "%");
    if (f.qualifiedOnly) out.push("qualifies for the offer");
    for (const c of f.custom || []) if (c && c.field) out.push(c.field.replace(/^raw:/, "") + " " + c.op + (/empty/.test(c.op) ? "" : " " + c.value));
    return out.join(" · ") || "All leads";
  }

  return { EMPTY, matches, apply, facets, describe, test };
});

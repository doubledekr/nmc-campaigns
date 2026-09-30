/* Watchlist — leads that miss an offer today only because of the rate market or loan seasoning.
   For each one we solve the highest offered rate at which they'd qualify (their "trigger rate") once,
   so every rate-sheet update can re-check the whole list instantly. Classic case: FHA/VA borrowers who
   need rates 0.5% below their note rate for a Streamline / IRRRL, or who aren't 210 days seasoned yet. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./loanmath"));
  else (root.NMC = root.NMC || {}).watchlist = factory(root.NMC.loanmath);
})(typeof self !== "undefined" ? self : this, function (LM) {
  "use strict";

  /* rate- and time-driven reasons can clear on their own; anything else (LTV, no data, FICO…) can't */
  const RATE_RE = /^(Rate drop|Saves |No payment or interest savings|Recoupment|No rate set)/;
  const TIME_RE = /^Seasoning/;
  const kindOf = r => RATE_RE.test(r) ? "rate" : TIME_RE.test(r) ? "time" : "hard";

  const PRESETS = {
    streamline: { label: "FHA / VA Streamline", loanTypes: ["FHA", "VA"],
      offer: { product: "refi", term: 30, rateMode: "table", streamline: true, skip: 0, costsMode: "flat", costs: 3500, pwypn: true,
        rules: { minRateDrop: 0.5, minMonthlySave: 50, streamlineSeasoning: true, vaRecoupMonths: 36, minFico: 0 } } },
    refi: { label: "Rate-and-term refi (Conventional)", loanTypes: ["Conventional", "Jumbo", "USDA"],
      offer: { product: "refi", term: 30, rateMode: "table", streamline: false, rules: { minRateDrop: 0.75, minMonthlySave: 150 } } },
  };

  function fullOffer(o) { const x = Object.assign({}, LM.DEFAULT_OFFER, o || {}); x.rules = Object.assign({}, LM.DEFAULT_OFFER.rules, (o || {}).rules || {}); return x; }

  /* highest rate (to 0.001%) at which the lead passes every rate-driven rule, ignoring seasoning.
     null = no rate would do it (a hard reason, or it only works below ~0%). */
  function neededRate(lead, offer) {
    const at = r => { const a = LM.analyze(lead, Object.assign({}, offer, { rateMode: "fixed", fixedRate: r }), null, { today: "2999-01-01" });
      return a.reasons.length === 0 ? "ok" : a.reasons.some(x => kindOf(x) === "hard") ? "hard" : "no"; };
    const top = Math.max(1, (lead.rate || 8) + 1);
    if (at(top) === "ok") return top;
    if (at(0.25) !== "ok") return null;
    let lo = 0.25, hi = top;                              /* at(lo) ok, at(hi) not */
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (at(mid) === "ok") lo = mid; else hi = mid; }
    return Math.floor(lo * 1000) / 1000;
  }

  /* Is this lead a near-miss for the offer right now? → entry fields, or null */
  function assess(lead, offerIn, rates, today) {
    const offer = fullOffer(offerIn);
    const a = LM.analyze(lead, offer, rates, { today });
    if (a.ok) return { ready: true, analysis: a };
    const kinds = a.reasons.map(kindOf);
    if (kinds.includes("hard")) return null;
    const need = neededRate(lead, offer);
    if (need == null) return null;
    return { ready: false, analysis: a, need, eligibleOn: a.eligibleOn || null, waitingOn: [...new Set(kinds.filter(k => k !== "hard"))] };
  }

  /* re-check an existing entry against today's rate sheet (cheap: uses the stored trigger rate) */
  function evaluate(entry, lead, rates, today) {
    if (!lead) return { status: "missing", label: "Lead not in current list" };
    const offer = fullOffer(entry.offer);
    const todayRate = LM.rateFor(lead, offer, rates);
    const seasoned = !entry.eligibleOn || entry.eligibleOn <= today;
    const rateOk = todayRate != null && entry.need != null && todayRate <= entry.need + 1e-9;
    const gap = todayRate != null && entry.need != null ? Math.round((todayRate - entry.need) * 1000) / 1000 : null;
    let status = rateOk && seasoned ? "ready" : !rateOk && !seasoned ? "both" : !rateOk ? "rate" : "time";
    let analysis = null;
    if (status === "ready") { analysis = LM.analyze(lead, offer, rates, { today }); if (!analysis.ok) status = "changed"; }   /* lead data or rules changed since it was added */
    return { status, todayRate, gap, seasoned, analysis };
  }

  /* how many entries a rate move would free up: [{drop, count}] */
  function sensitivity(rows, steps) {
    return (steps || [0.125, 0.25, 0.375, 0.5, 0.75, 1]).map(d => ({ drop: d, count: rows.filter(r => r.ev && r.ev.gap != null && r.ev.gap > 0 && r.ev.gap <= d + 1e-9 && r.ev.seasoned).length }));
  }

  const offerSig = o => JSON.stringify(fullOffer(o));

  return { PRESETS, neededRate, assess, evaluate, sensitivity, kindOf, offerSig, fullOffer };
});

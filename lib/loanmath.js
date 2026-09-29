/* Loan math — ported from the NMC Banker Toolkit (pmt, amort, debt payoff, effective rate, APR)
   so a campaign proposal shows exactly the numbers a banker's proposal would.
   analyze(lead, offer) builds one lead's proposal from the campaign's offer settings and
   says whether the lead qualifies for it. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NMC = root.NMC || {}).loanmath = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function pmt(P, annualPct, n) { const r = annualPct / 1200; if (!n || n <= 0) return 0; if (r === 0) return P / n; return P * r / (1 - Math.pow(1 + r, -n)); }
  function amort(P, annualPct, n, extra, payOverride) {
    extra = extra || 0; const r = annualPct / 1200; const basePay = payOverride != null ? payOverride : pmt(P, annualPct, n);
    let bal = P, i = 0, totInt = 0; const pts = [[0, P]];
    while (bal > 0.01 && i < 1201) {
      i++; const int = bal * r; let prin = basePay + extra - int;
      if (prin <= 0) return { months: Infinity, interest: Infinity, pay: basePay, points: pts };
      if (prin > bal) prin = bal; totInt += int; bal -= prin;
      if (i % 12 === 0 || bal <= 0.01) pts.push([i, Math.max(bal, 0)]);
    }
    return { months: i, interest: totInt, pay: basePay, points: pts };
  }
  function debtMonths(bal, apr, pay) { const r = apr / 1200; if (pay <= bal * r + 0.01) return Infinity; if (r === 0) return bal / pay; return -Math.log(1 - bal * r / pay) / Math.log(1 + r); }
  function debtInterest(bal, apr, pay) { const m = debtMonths(bal, apr, pay); return isFinite(m) ? pay * m - bal : Infinity; }
  function equivRate(P, n, targetInterest, hi) {
    if (!(P > 0) || !(n > 0) || !isFinite(targetInterest)) return null; let lo = 0, h = hi || 30;
    for (let i = 0; i < 40; i++) { const mid = (lo + h) / 2; if (amort(P, mid, n).interest > targetInterest) h = mid; else lo = mid; }
    return (lo + h) / 2;
  }

  /* default offer settings for a new campaign */
  const DEFAULT_OFFER = {
    product: "refi",          /* refi = rate & term · cashout = refi + pay off debts · second = home equity loan for debts */
    term: 30,
    rateMode: "table",        /* table = Settings rate sheet by loan type · fixed = one rate for everyone */
    fixedRate: null,
    costsMode: "flat",        /* flat $ or pct of loan */
    costs: 4500,
    costsPct: 1.5,
    skip: 1,                  /* payments skipped at closing (refis) */
    pwypn: true,              /* show "pay what you pay now" */
    streamline: true,         /* FHA/VA rate-and-term refis quoted as FHA Streamline / VA IRRRL */
    fhaMip: 1.75,             /* FHA upfront MIP % on a streamline (financed) */
    rules: { minRateDrop: 0.5, minMonthlySave: 100, maxLtvRefi: 97, maxLtvCashout: 80, maxLtvCashoutVA: 90, maxCltvSecond: 85, minFico: 0, minDebt: 5000 },
  };

  /* rates: { asOf, table: { Conventional:{30,20,15}, FHA:{..}, VA:{..}, Jumbo:{..}, USDA:{..}, Second:{10,15,20,30} } } */
  function rateFor(lead, offer, rates) {
    if (offer.rateMode === "fixed") return offer.fixedRate > 0 ? +offer.fixedRate : null;
    const t = (rates && rates.table) || {};
    const key = offer.product === "second" ? "Second" : (t[lead.loanType] ? lead.loanType : "Conventional");
    const row = t[key] || {}; const v = row[offer.term] != null ? row[offer.term] : null;
    return v > 0 ? +v : null;
  }

  function analyze(lead, offerIn, rates) {
    const offer = Object.assign({}, DEFAULT_OFFER, offerIn || {}); offer.rules = Object.assign({}, DEFAULT_OFFER.rules, (offerIn || {}).rules || {});
    const R = offer.rules; const reasons = [];
    const second = offer.product === "second";
    const rate = rateFor(lead, offer, rates);
    const out = { ok: false, reasons, second, product: offer.product, rate, term: offer.term };
    if (!rate) { reasons.push("No rate set for " + (second ? "home equity" : (lead.loanType || "this loan type")) + " " + offer.term + "-yr"); return out; }
    if (!second && !(lead.balance > 0 && lead.rate > 0)) { reasons.push("Missing current balance or rate"); return out; }

    const hasDebt = lead.debtBalance > 0;
    const roll = offer.product === "cashout" || second;
    if (roll && !(lead.debtBalance >= (R.minDebt || 1))) { reasons.push(hasDebt ? "Debt below " + money0(R.minDebt) + " minimum" : "No other debt on file"); return out; }

    const curMonths = lead.monthsLeft || 360;
    const curPay = !second ? (lead.payment || pmt(lead.balance, lead.rate, curMonths)) : 0;
    const curSched = !second ? amort(lead.balance, lead.rate, curMonths, 0, lead.payment || null) : { interest: 0, months: 0 };

    const streamline = !second && offer.product === "refi" && offer.streamline && (lead.loanType === "FHA" || lead.loanType === "VA");
    const prog = streamline ? (lead.loanType === "FHA" ? "fha_streamline" : "va_irrrl") : "standard";
    const fhaS = prog === "fha_streamline";

    /* debts arrive as one combined line from the CSV */
    const dBal = roll ? (lead.debtBalance || 0) : 0;
    const dPay = roll ? (lead.debtPayment || (dBal ? Math.round(dBal * 0.03) : 0)) : 0;   /* no payment on file: ~3% of balance, a typical card minimum */
    const dPayEst = roll && !lead.debtPayment && dBal > 0;
    const dApr = lead.debtApr > 0 ? lead.debtApr : null;
    const dAprUse = dApr || 22;                                  /* no APR on file: 22% (typical card APR) — shown as an estimate */
    const dInt = dBal ? (isFinite(debtInterest(dBal, dAprUse, dPay)) ? debtInterest(dBal, dAprUse, dPay) : dBal * 3) : 0;
    const dMonths = dBal && dPay ? debtMonths(dBal, dAprUse, dPay) : 0;

    const base = (second ? 0 : lead.balance) + dBal;
    let costs = offer.costsMode === "pct" ? Math.round(base * (offer.costsPct || 0) / 100) : (offer.costs || 0);
    if (fhaS) costs = 0;                                         /* FHA Streamline: lender-paid, no origination */
    const mipAmt = fhaS ? Math.round(lead.balance * (offer.fhaMip || 0) / 100) : 0;
    const newP = base + costs + mipAmt;
    const n = offer.term * 12;
    const newPay = pmt(newP, rate, n); const newSched = amort(newP, rate, n);

    const outlayNow = curPay + dPay;
    const saveMo = outlayNow - newPay;

    /* blended rate today: mortgage + debts weighted by balance (refi), or just the debts (second) */
    let blended = null;
    if (second) blended = dApr;
    else if (roll && dApr) blended = (lead.balance * lead.rate + dBal * dApr) / (lead.balance + dBal);
    else blended = lead.rate;

    /* pay what you pay now: keep today's outlay; the difference goes to principal */
    const extra = offer.pwypn ? Math.max(0, Math.round(outlayNow - newPay)) : 0;
    const pw = extra > 0 ? amort(newP, rate, n, extra) : { months: newSched.months, interest: newSched.interest };
    const pwEff = extra > 0 && isFinite(pw.interest) ? equivRate(newP, n, pw.interest, rate) : rate;

    const escrow = !second && lead.escrow > 0 ? lead.escrow : 0;
    const piti = lead.paymentTotal > 0 ? lead.paymentTotal : curPay + escrow;
    const skipN = second || fhaS ? 0 : Math.max(0, Math.min(2, offer.skip || 0));
    const skipCash = skipN * piti;

    const curPathInterest = (second ? 0 : curSched.interest) + dInt;
    const interestSaved = curPathInterest - pw.interest;
    const termCut = !second && isFinite(pw.months) ? curMonths - pw.months : 0;
    const debtFreeSooner = second && isFinite(dMonths) && dMonths > 0 ? dMonths - pw.months : null;

    /* APR — same method as the toolkit: amount financed net of prepaid finance charges, at the actual payment */
    const finCharges = costs + mipAmt; let apr = rate + 0.25, aprEst = true;
    if (finCharges > 0 && newP > finCharges) { const amt = newP - finCharges; let lo = rate, hi = rate + 10;
      for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (pmt(amt, mid, n) > newPay) hi = mid; else lo = mid; } apr = (lo + hi) / 2; aprEst = false; }
    else if (finCharges === 0) { apr = rate; aprEst = false; }

    const ltvNew = !second && lead.value > 0 ? newP / lead.value * 100 : null;
    const cltvNew = second && lead.value > 0 ? ((lead.balance || 0) + newP) / lead.value * 100 : null;

    /* ---- qualification ---- */
    if (!second) {
      const drop = lead.rate - rate;
      if (offer.product === "refi" && drop < R.minRateDrop) reasons.push("Rate drop " + drop.toFixed(2) + "% (needs " + R.minRateDrop + "%)");
      if (saveMo < R.minMonthlySave) reasons.push("Saves " + money0(saveMo) + "/mo (needs " + money0(R.minMonthlySave) + ")");
      if (!streamline) {
        const maxL = offer.product === "cashout" ? (lead.loanType === "VA" ? R.maxLtvCashoutVA : R.maxLtvCashout) : R.maxLtvRefi;
        if (ltvNew == null) reasons.push("No property value — can’t check LTV");
        else if (ltvNew > maxL) reasons.push("New LTV " + ltvNew.toFixed(1) + "% (max " + maxL + "%)");
      }
    } else {
      if (cltvNew == null) reasons.push("No property value — can’t check CLTV");
      else if (cltvNew > R.maxCltvSecond) reasons.push("CLTV " + cltvNew.toFixed(1) + "% (max " + R.maxCltvSecond + "%)");
      if (saveMo < R.minMonthlySave && !(interestSaved > 0)) reasons.push("No payment or interest savings");
    }
    if (R.minFico && lead.fico && lead.fico < R.minFico) reasons.push("Credit score " + lead.fico + " (min " + R.minFico + ")");

    return Object.assign(out, {
      ok: reasons.length === 0, prog, streamline, fhaS, mipAmt, costs, newP, n, newPay, curPay, curMonths, outlayNow, saveMo,
      dBal, dPay, dPayEst, dApr, dAprUse, dInt, dMonths, blended, extra, pw, pwEff, skipN, skipCash, piti,
      curPathInterest, interestSaved, termCut, debtFreeSooner, apr, aprEst, ltvNew, cltvNew,
      rateDrop: !second ? lead.rate - rate : null, newSched,
    });
  }

  function money0(v) { v = Math.round(v || 0); return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US"); }

  return { pmt, amort, debtMonths, debtInterest, equivRate, analyze, rateFor, DEFAULT_OFFER };
});

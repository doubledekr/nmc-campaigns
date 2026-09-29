/* Lead fields: what the app understands, how CSV headers map onto it, and how raw cell text is
   cleaned up ("$245,000" → 245000, "6.875%" → 6.875, "Michigan" → "MI", "FHA 30yr" → "FHA").
   normalizeLead() turns one CSV row + a column map into a clean lead with derived values
   (equity, LTV, region, months left, estimated payment). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NMC = root.NMC || {}).fields = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* key, label, type, header synonyms (lower-case, punctuation-stripped) */
  const FIELDS = [
    { key: "leadId", label: "Lead ID", type: "text", syn: ["leadid", "id", "recordid", "loannumber", "loanid", "customerid", "contactid", "salesforceid", "sfid"] },
    { key: "firstName", label: "First name", type: "text", syn: ["firstname", "first", "fname", "borrowerfirstname", "givenname", "borrowerfirst"] },
    { key: "lastName", label: "Last name", type: "text", syn: ["lastname", "last", "lname", "surname", "borrowerlastname", "familyname", "borrowerlast"] },
    { key: "fullName", label: "Full name", type: "text", syn: ["name", "fullname", "borrowername", "borrower", "contactname", "clientname", "customername", "leadname"] },
    { key: "email", label: "Email", type: "email", required: true, syn: ["email", "emailaddress", "borroweremail", "primaryemail", "email1", "contactemail", "emailaddr"] },
    { key: "phone", label: "Phone", type: "phone", syn: ["phone", "phonenumber", "mobile", "cell", "cellphone", "mobilephone", "homephone", "primaryphone", "phone1", "telephone"] },
    { key: "address", label: "Street address", type: "text", syn: ["address", "street", "streetaddress", "propertyaddress", "address1", "mailingaddress", "subjectpropertyaddress", "propertystreet"] },
    { key: "city", label: "City", type: "text", syn: ["city", "propertycity", "mailingcity", "town"] },
    { key: "state", label: "State", type: "state", syn: ["state", "st", "propertystate", "mailingstate", "province", "statecode"] },
    { key: "zip", label: "ZIP", type: "zip", syn: ["zip", "zipcode", "postalcode", "postcode", "propertyzip", "mailingzip", "zip5"] },
    { key: "loanType", label: "Loan type", type: "loanType", syn: ["loantype", "type", "program", "loanprogram", "product", "mortgagetype", "producttype", "currentloantype"] },
    { key: "rate", label: "Current rate %", type: "percent", syn: ["rate", "currentrate", "interestrate", "noterate", "currentinterestrate", "ir", "mortgagerate", "existingrate"] },
    { key: "balance", label: "Loan balance", type: "money", syn: ["balance", "loanbalance", "currentbalance", "upb", "unpaidprincipalbalance", "principalbalance", "mortgagebalance", "payoff", "currentupb", "estbalance", "estimatedbalance"] },
    { key: "payment", label: "Monthly P&I", type: "money", syn: ["payment", "pi", "pandi", "principalandinterest", "monthlypayment", "pipayment", "currentpayment", "mortgagepayment", "monthlypi"] },
    { key: "paymentTotal", label: "Total payment (PITI)", type: "money", syn: ["piti", "totalpayment", "fullpayment", "paymentwithescrow", "totalmonthlypayment"] },
    { key: "escrow", label: "Escrow / month", type: "money", syn: ["escrow", "escrowpayment", "ti", "taxesandinsurance", "monthlyescrow"] },
    { key: "value", label: "Property value", type: "money", syn: ["value", "propertyvalue", "homevalue", "estimatedvalue", "estvalue", "avm", "avmvalue", "marketvalue", "appraisedvalue", "currentvalue", "zestimate"] },
    { key: "origAmount", label: "Original loan amount", type: "money", syn: ["originalamount", "origamount", "originalloanamount", "loanamount", "originalbalance", "amount"] },
    { key: "origDate", label: "Origination / close date", type: "date", syn: ["origdate", "originationdate", "closedate", "closingdate", "fundeddate", "fundingdate", "notedate", "loandate", "dateclosed", "firstpaymentdate"] },
    { key: "origTerm", label: "Original term (years)", type: "term", syn: ["term", "origterm", "originalterm", "loanterm", "termyears", "amortterm", "termmonths"] },
    { key: "monthsLeft", label: "Months remaining", type: "int", syn: ["monthsleft", "remainingterm", "monthsremaining", "remainingmonths", "termremaining"] },
    { key: "fico", label: "Credit score", type: "int", syn: ["fico", "creditscore", "score", "ficoscore", "credit", "midscore", "estimatedfico", "estfico"] },
    { key: "debtBalance", label: "Other debt balance", type: "money", syn: ["debt", "debts", "debtbalance", "totaldebt", "consumerdebt", "revolvingdebt", "revolvingbalance", "creditcarddebt", "ccdebt", "unsecureddebt", "otherdebt", "nonmortgagedebt"] },
    { key: "debtPayment", label: "Other debt payments / mo", type: "money", syn: ["debtpayment", "debtpayments", "monthlydebt", "monthlydebtpayment", "revolvingpayment", "debtmonthly", "otherdebtpayment", "minpayments"] },
    { key: "debtApr", label: "Other debt avg APR %", type: "percent", syn: ["debtapr", "debtrate", "avgapr", "averageapr", "revolvingapr", "ccapr", "blendedapr"] },
    { key: "banker", label: "Assigned banker", type: "text", syn: ["banker", "loanofficer", "lo", "owner", "assignedto", "assignedlo", "officer", "agent", "rep", "leadowner", "loname", "bankername", "owneremail", "loemail"] },
    { key: "servicer", label: "Current servicer", type: "text", syn: ["servicer", "currentservicer", "lender", "currentlender", "investor"] },
    { key: "occupancy", label: "Occupancy", type: "text", syn: ["occupancy", "occupancytype", "propertyuse"] },
    { key: "source", label: "Lead source", type: "text", syn: ["source", "leadsource", "list", "listname", "campaign", "vendor"] },
    { key: "optOut", label: "Opted out / DNE", type: "bool", syn: ["optout", "unsubscribed", "donotemail", "dne", "emailoptout", "hasoptedoutofemail", "unsub"] },
  ];
  const BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f]));

  const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };
  const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v.toLowerCase(), k]));
  /* U.S. Census regions — the default "Region" filter; custom regions can be defined in Settings */
  const CENSUS_REGIONS = {
    Northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
    Midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
    South: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX", "PR"],
    West: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
  };

  const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  /* guess a column map { fieldKey: headerName } from the CSV headers */
  function guessMap(headers) {
    const map = {}, used = new Set();
    const sq = headers.map(h => ({ h, s: squash(h) }));
    /* pass 1: exact synonym match; pass 2: header contains a synonym (longest synonyms first) */
    for (const f of FIELDS) {
      const hit = sq.find(x => !used.has(x.h) && (x.s === squash(f.key) || f.syn.includes(x.s)));
      if (hit) { map[f.key] = hit.h; used.add(hit.h); }
    }
    for (const f of FIELDS) {
      if (map[f.key]) continue;
      const syns = f.syn.filter(s => s.length >= 5).sort((a, b) => b.length - a.length);
      const hit = sq.find(x => !used.has(x.h) && !/ltv|loantovalue|percent|pct$/.test(x.s) && syns.some(s => x.s.includes(s)));
      if (hit) { map[f.key] = hit.h; used.add(hit.h); }
    }
    return map;
  }
  /* a stable signature for a header set, so a saved mapping preset re-applies to the same export format */
  function headerSignature(headers) { return headers.map(squash).sort().join("|"); }

  /* ---------- value cleaners ---------- */
  function money(v) {
    if (v == null) return null; let s = String(v).trim(); if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[()$,\s]/g, "").replace(/^-/, "").replace(/usd/i, "");
    let mult = 1; if (/k$/i.test(s)) { mult = 1e3; s = s.slice(0, -1); } else if (/m$/i.test(s)) { mult = 1e6; s = s.slice(0, -1); }
    const n = parseFloat(s); if (!isFinite(n)) return null;
    return Math.round((neg ? -n : n) * mult * 100) / 100;
  }
  function percent(v) {
    if (v == null) return null; const s = String(v).trim().replace(/[%\s]/g, ""); if (!s) return null;
    let n = parseFloat(s); if (!isFinite(n)) return null;
    if (n > 0 && n < 0.3) n = n * 100;          /* 0.065 → 6.5 */
    return Math.round(n * 10000) / 10000;
  }
  function int(v) { const n = money(v); return n == null ? null : Math.round(n); }
  function state(v) {
    const s = String(v || "").trim(); if (!s) return "";
    const up = s.toUpperCase(); if (STATES[up]) return up;
    return STATE_BY_NAME[s.toLowerCase()] || STATE_BY_NAME[s.toLowerCase().replace(/\./g, "")] || up.slice(0, 2);
  }
  function zip(v) { const m = String(v || "").match(/\d{3,5}/); return m ? m[0].padStart(5, "0") : ""; }
  function email(v) { return String(v || "").trim().toLowerCase().replace(/^mailto:/, ""); }
  function validEmail(e) { return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i.test(e || ""); }
  function phone(v) {
    const d = String(v || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(v || "").trim();
  }
  function loanType(v) {
    const s = String(v || "").toLowerCase();
    if (!s.trim()) return "";
    if (/\bva\b|veteran|irrrl/.test(s)) return "VA";
    if (/fha/.test(s)) return "FHA";
    if (/usda|rural/.test(s)) return "USDA";
    if (/jumbo|non.?conf/.test(s)) return "Jumbo";
    if (/conv|fannie|freddie|fnma|fhlmc|conforming|agency/.test(s)) return "Conventional";
    if (/heloc|home equity|2nd|second/.test(s)) return "HELOC / 2nd";
    return String(v).trim();
  }
  function date(v) {
    const s = String(v || "").trim(); if (!s) return "";
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += y > 50 ? 1900 : 2000; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
    m = s.match(/^(\d{1,2})[\/\-](\d{4})$/); if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
    const t = Date.parse(s); if (isFinite(t)) return new Date(t).toISOString().slice(0, 10);
    return "";
  }
  function term(v) { const n = int(v); if (n == null) return null; return n > 50 ? Math.round(n / 12) : n; }   /* 360 → 30 */
  function bool(v) { return /^(y|yes|true|1|x|opted ?out|unsubscribed)$/i.test(String(v || "").trim()); }
  const CLEAN = { text: v => String(v == null ? "" : v).trim(), email, phone, state, zip, loanType, percent, money, int, date, term, bool };

  function titleCase(s) { return String(s || "").toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase()); }

  function pmt(P, annualPct, n) { const r = annualPct / 1200; if (!n || n <= 0) return 0; if (r === 0) return P / n; return P * r / (1 - Math.pow(1 + r, -n)); }
  function monthsBetween(isoA, isoB) { const a = new Date(isoA + "T00:00:00"), b = new Date(isoB + "T00:00:00"); return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); }

  /* one CSV record + column map → clean lead. `today` is injectable for tests. */
  function normalizeLead(rec, map, opts) {
    opts = opts || {}; const today = opts.today || new Date().toISOString().slice(0, 10);
    const L = { _raw: rec, _warn: [] };
    for (const f of FIELDS) {
      const h = map[f.key]; const raw = h ? rec[h] : "";
      L[f.key] = CLEAN[f.type](raw);
      if (L[f.key] === "" && f.type !== "text" && f.type !== "email" && f.type !== "state" && f.type !== "zip" && f.type !== "phone" && f.type !== "loanType" && f.type !== "date") L[f.key] = null;
    }
    /* names: split a full name when first/last aren't mapped; tidy ALL CAPS exports */
    if (!L.firstName && L.fullName) {
      let fn = L.fullName;
      if (/,/.test(fn)) { const [last, first] = fn.split(",").map(s => s.trim()); L.firstName = (first || "").split(/\s+/)[0]; L.lastName = L.lastName || last; }
      else { const parts = fn.split(/\s+/).filter(Boolean); L.firstName = parts[0] || ""; L.lastName = L.lastName || (parts.length > 1 ? parts[parts.length - 1] : ""); }
    }
    for (const k of ["firstName", "lastName", "city"]) if (L[k] && (L[k] === L[k].toUpperCase() || L[k] === L[k].toLowerCase())) L[k] = titleCase(L[k]);
    L.name = [L.firstName, L.lastName].filter(Boolean).join(" ") || L.fullName || "";
    /* original term → months left, when the file has an origination date but no remaining term */
    if (L.origTerm == null && (L.origDate || L.origAmount)) L.origTerm = 30;
    if (L.monthsLeft == null && L.origDate && L.origTerm) {
      const used = Math.max(0, monthsBetween(L.origDate, today)); L.monthsLeft = Math.max(1, L.origTerm * 12 - used); L._monthsLeftEst = true;
    }
    if (L.monthsLeft != null && L.monthsLeft > 480) L.monthsLeft = null;
    /* a missing balance can be estimated from original amount + rate + months elapsed */
    if (L.balance == null && L.origAmount && L.rate && L.origTerm && L.origDate) {
      const n = L.origTerm * 12, k = Math.max(0, Math.min(n, monthsBetween(L.origDate, today))), r = L.rate / 1200;
      const p = pmt(L.origAmount, L.rate, n);
      L.balance = r ? Math.round(L.origAmount * Math.pow(1 + r, k) - p * (Math.pow(1 + r, k) - 1) / r) : Math.round(L.origAmount - p * k);
      L._balanceEst = true; L._warn.push("Balance estimated from original amount and close date");
    }
    if (L.payment == null && L.balance && L.rate) { L.payment = Math.round(pmt(L.balance, L.rate, L.monthsLeft || 360) * 100) / 100; L._paymentEst = true; }
    if (L.paymentTotal == null && L.payment && L.escrow) L.paymentTotal = L.payment + L.escrow;
    L.equity = L.value != null && L.balance != null ? Math.round(L.value - L.balance) : null;
    L.ltv = L.value > 0 && L.balance != null ? Math.round(L.balance / L.value * 1000) / 10 : null;
    L.cltv = L.ltv;
    L.region = regionOf(L.state, opts.regions);
    L.emailValid = validEmail(L.email);
    if (!L.email) L._warn.push("No email address"); else if (!L.emailValid) L._warn.push("Email address looks invalid");
    if (L.state && !STATES[L.state]) L._warn.push("Unrecognized state “" + L.state + "”");
    return L;
  }

  function regionOf(st, custom) {
    const sets = custom && Object.keys(custom).length ? custom : CENSUS_REGIONS;
    for (const [name, list] of Object.entries(sets)) if ((list || []).includes(st)) return name;
    return st ? "Other" : "";
  }

  return { FIELDS, BY_KEY, STATES, CENSUS_REGIONS, guessMap, headerSignature, normalizeLead, regionOf, validEmail, clean: CLEAN, titleCase, squash };
});

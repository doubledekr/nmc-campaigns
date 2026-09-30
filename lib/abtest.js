/* A/B testing: message variants per campaign, a stable split of leads between them, and the
   statistics for reading results (two-proportion z-test).
   campaign.variants = [{ id:"A", name, subject, preheader, body, ctaText, ctaUrl }, …]   (always at least one)
   campaign.ab = { on, mode:"split"|"winner", testPct, winner, results:{ [id]:{ opens, clicks, replies } } } */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NMC = root.NMC || {}).ab = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FIELDS = ["subject", "preheader", "body", "ctaText", "ctaUrl"];
  const IDS = ["A", "B", "C", "D"];
  const DEFAULT_AB = { on: false, mode: "split", testPct: 20, winner: null, metric: "clicks", results: {} };

  /* older campaigns kept one message on the campaign itself */
  function ensure(c) {
    if (!Array.isArray(c.variants) || !c.variants.length) {
      c.variants = [{ id: "A", name: "A" }]; for (const k of FIELDS) c.variants[0][k] = c[k] != null ? c[k] : "";
    }
    c.ab = Object.assign({}, DEFAULT_AB, c.ab || {}); c.ab.results = c.ab.results || {};
    return c;
  }
  const active = c => (c.ab && c.ab.on && c.variants.length > 1) ? c.variants : c.variants.slice(0, 1);
  const byId = (c, id) => c.variants.find(v => v.id === id) || c.variants[0];
  function nextId(c) { return IDS.find(id => !c.variants.some(v => v.id === id)) || null; }

  /* the campaign as the email builder sees it for one variant */
  function apply(c, id) { const v = byId(c, id); const out = Object.assign({}, c); for (const k of FIELDS) out[k] = v[k]; out.variantId = v.id; return out; }

  /* stable hash → the same lead always lands in the same bucket for a given campaign */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

  /* keys → { [key]: { variant, held } }. split: even across variants. winner: testPct% split evenly, the rest held. */
  function assign(c, keys) {
    const vs = active(c).map(v => v.id); const out = {};
    const winnerMode = c.ab && c.ab.on && vs.length > 1 && c.ab.mode === "winner";
    const testShare = Math.max(2, Math.min(100, +c.ab.testPct || 20)) / 100;
    /* order by hash so the test group is a random sample, then deal variants round-robin for exact balance */
    const ordered = keys.slice().sort((a, b) => hash(c.id + "|" + a) - hash(c.id + "|" + b));
    const nTest = winnerMode ? Math.max(vs.length, Math.round(ordered.length * testShare)) : ordered.length;
    ordered.forEach((k, i) => { out[k] = i < nTest ? { variant: vs[i % vs.length], held: false } : { variant: null, held: true }; });
    return out;
  }
  function plan(c, keys) {
    const a = assign(c, keys); const counts = {}; let held = 0;
    for (const x of Object.values(a)) { if (x.held) held++; else counts[x.variant] = (counts[x.variant] || 0) + 1; }
    return { counts, held };
  }

  /* results: sent from the send log; opens/clicks/replies typed in from the email service's report (or a webhook later) */
  function stats(c, sentByVariant, metric) {
    metric = metric || (c.ab && c.ab.metric) || "clicks";
    const rows = active(c).map(v => { const r = (c.ab.results || {})[v.id] || {}; const sent = sentByVariant[v.id] || 0;
      const x = Math.min(sent || Infinity, +r[metric] || 0); return { id: v.id, name: v.name || v.id, sent, opens: +r.opens || 0, clicks: +r.clicks || 0, replies: +r.replies || 0, x, rate: sent ? x / sent : 0 }; });
    const best = rows.slice().sort((a, b) => b.rate - a.rate)[0];
    for (const r of rows) {
      if (r === best || !r.sent || !best.sent) { r.p = null; continue; }
      r.p = pValue(best.x, best.sent, r.x, r.sent);
    }
    const others = rows.filter(r => r !== best && r.sent);
    const confident = others.length && others.every(r => r.p != null && r.p < 0.05);
    const enough = rows.every(r => r.sent >= 100);
    return { rows, metric, best: best && best.x ? best.id : null, confident: !!confident && best.x > 0, enough,
      verdict: !rows.some(r => r.x) ? "No results entered yet" :
        confident ? `${best.name} wins on ${metric} with 95% confidence` :
        `${best.name} is ahead on ${metric}, but the difference could still be chance${enough ? "" : " — small groups (under 100 sent each)"}` };
  }
  /* two-sided two-proportion z-test */
  function pValue(x1, n1, x2, n2) {
    const p = (x1 + x2) / (n1 + n2); const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); if (!se) return 1;
    const z = Math.abs(x1 / n1 - x2 / n2) / se; return 2 * (1 - normCdf(z));
  }
  function normCdf(z) { const t = 1 / (1 + 0.2316419 * z), d = 0.3989423 * Math.exp(-z * z / 2);
    return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); }

  return { FIELDS, IDS, DEFAULT_AB, ensure, active, byId, nextId, apply, assign, plan, stats, pValue, hash };
});

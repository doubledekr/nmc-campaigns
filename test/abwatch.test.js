/* A/B testing and watchlist logic */
const test = require("node:test"), assert = require("node:assert/strict");
const LM = require("../lib/loanmath"), AB = require("../lib/abtest"), W = require("../lib/watchlist"), C = require("../lib/campaign");

const RATES = { asOf: "2026-09-30", table: { Conventional: { 30: 6.125 }, FHA: { 30: 5.875 }, VA: { 30: 5.75 } } };
const fha = o => Object.assign({ leadId: "F1", name: "Pat Doe", firstName: "Pat", email: "pat@example.com", emailValid: true, state: "MI", loanType: "FHA", rate: 6.25, balance: 260000, monthsLeft: 340, value: 280000, origDate: "2025-01-10" }, o || {});

test("seasoning: FHA 210 days + 6 payments, VA 210 days after first payment", () => {
  assert.equal(LM.seasonedOn({ origDate: "2026-05-15" }, "fha_streamline"), "2026-12-11");
  assert.equal(LM.seasonedOn({ origDate: "2026-05-15" }, "va_irrrl"), "2027-01-27");
  const a = LM.analyze(fha({ rate: 7.25, origDate: "2026-05-15" }), { product: "refi" }, RATES, { today: "2026-09-30" });
  assert.match(a.reasons.join(), /Seasoning: FHA Streamline eligible Dec 11, 2026/); assert.equal(a.eligibleOn, "2026-12-11");
  assert.equal(LM.analyze(fha({ rate: 7.25, origDate: "2026-05-15" }), { product: "refi" }, RATES, { today: "2026-12-11" }).ok, true);
});

test("VA IRRRL: costs must be recouped within 36 months", () => {
  const va = fha({ loanType: "VA", rate: 6.3, balance: 200000 });
  const a = LM.analyze(va, { product: "refi", costs: 6000, rules: { minRateDrop: 0.5, minMonthlySave: 0 } }, RATES, { today: "2026-09-30" });
  assert.match(a.reasons.join(), /Recoupment \d+ months \(VA max 36\)/);
});

test("watchlist: needed rate is the highest rate that qualifies", () => {
  const L = fha(); const offer = W.PRESETS.streamline.offer;
  const need = W.neededRate(L, W.fullOffer(offer));
  assert.ok(need <= 5.75 && need > 5.5, "a 6.25% FHA needs about a 0.5% drop, got " + need);
  const at = r => LM.analyze(L, Object.assign({}, offer, { rateMode: "fixed", fixedRate: r }), null, { today: "2026-09-30" }).ok;
  assert.equal(at(need), true); assert.equal(at(need + 0.01), false);
});

test("watchlist: assess sorts leads into ready / near-miss / hard", () => {
  const o = W.PRESETS.streamline.offer;
  assert.equal(W.assess(fha({ rate: 7.0 }), o, RATES, "2026-09-30").ready, true);
  const nm = W.assess(fha(), o, RATES, "2026-09-30"); assert.equal(nm.ready, false); assert.deepEqual(nm.waitingOn, ["rate"]);
  const young = W.assess(fha({ rate: 7.0, origDate: "2026-06-01" }), o, RATES, "2026-09-30"); assert.deepEqual(young.waitingOn, ["time"]); assert.ok(young.eligibleOn > "2026-09-30");
  assert.equal(W.assess(fha({ balance: null }), o, RATES, "2026-09-30"), null, "missing data is a hard miss");
});

test("watchlist: evaluate flips to ready when the rate sheet drops", () => {
  const L = fha(); const o = W.fullOffer(W.PRESETS.streamline.offer); const r = W.assess(L, o, RATES, "2026-09-30");
  const e = { key: "id:F1", offer: o, need: r.need, eligibleOn: r.eligibleOn };
  assert.equal(W.evaluate(e, L, RATES, "2026-09-30").status, "rate");
  const lower = { table: { FHA: { 30: 5.5 } } };
  assert.equal(W.evaluate(e, L, lower, "2026-09-30").status, "ready");
  const sens = W.sensitivity([{ ev: W.evaluate(e, L, RATES, "2026-09-30") }]); assert.ok(sens.find(x => x.drop === 0.25).count === 1);
});

test("A/B: stable, balanced split; winner mode holds the rest", () => {
  const c = AB.ensure({ id: "c1", subject: "S", body: "B" }); c.variants.push({ id: "B", name: "B", subject: "S2", body: "B" }); c.ab.on = true;
  const keys = Array.from({ length: 1001 }, (_, i) => "k" + i);
  const a1 = AB.assign(c, keys), a2 = AB.assign(c, keys.slice().reverse());
  assert.deepEqual(a1, a2, "same lead, same variant, regardless of order");
  const p = AB.plan(c, keys); assert.ok(Math.abs(p.counts.A - p.counts.B) <= 1);
  c.ab.mode = "winner"; c.ab.testPct = 20; const w = AB.plan(c, keys); assert.equal(w.counts.A + w.counts.B, 200); assert.equal(w.held, 801);
  c.ab.on = false; assert.deepEqual(AB.plan(c, keys).counts, { A: 1001 });
});

test("A/B: stats verdict and variant-specific rendering", () => {
  const c = AB.ensure({ id: "c1", subject: "S", body: "B" }); c.variants.push({ id: "B", name: "B", subject: "Other {{first_name}}", body: "B" }); c.ab.on = true;
  c.ab.results = { A: { clicks: 20 }, B: { clicks: 45 } };
  const s = AB.stats(c, { A: 500, B: 500 }, "clicks"); assert.equal(s.best, "B"); assert.equal(s.confident, true);
  c.ab.results = { A: { clicks: 20 }, B: { clicks: 24 } }; assert.equal(AB.stats(c, { A: 500, B: 500 }, "clicks").confident, false);
  const state = { settings: { rates: RATES, licensedStates: ["MI"], from: { fromEmail: "x@nmc.test" } }, suppression: [] };
  c.offer = { product: "refi" };
  const p = C.prepare(fha({ rate: 7 }), c, state, { render: true, variant: "B" });
  assert.equal(p.message.subject, "Other Pat"); assert.equal(p.message.metadata.variant, "B"); assert.ok(p.message.tags.includes("variant-B"));
});

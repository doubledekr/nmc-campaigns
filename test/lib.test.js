/* Unit tests for the shared libraries. Run: npm test */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const csv = require("../lib/csv"), F = require("../lib/fields"), LM = require("../lib/loanmath"), M = require("../lib/merge");
const E = require("../lib/emailtpl"), D = require("../lib/deliverability"), FL = require("../lib/filters"), C = require("../lib/campaign");

const RATES = { asOf: "2026-09-29", table: { Conventional: { 30: 6.125, 15: 5.5 }, FHA: { 30: 5.875 }, VA: { 30: 5.75 }, Second: { 15: 8.25 } } };
const baseLead = (o) => Object.assign({ firstName: "Pat", lastName: "Doe", name: "Pat Doe", email: "pat@example.com", emailValid: true, state: "MI", city: "Detroit", loanType: "Conventional", rate: 7.5, balance: 300000, payment: null, monthsLeft: 340, value: 450000, debtBalance: 0, debtPayment: 0 }, o || {});

test("csv: quotes, embedded commas/newlines, BOM, CRLF, tabs", () => {
  const t = "﻿Name,Note,Amt\r\n\"Doe, Pat\",\"line1\nline2\",\"$1,200\"\r\nSam,\"He said \"\"hi\"\"\",5\r\n";
  const p = csv.parse(t);
  assert.deepEqual(p.headers, ["Name", "Note", "Amt"]);
  assert.equal(p.records[0].Name, "Doe, Pat"); assert.equal(p.records[0].Note, "line1\nline2"); assert.equal(p.records[1].Note, 'He said "hi"');
  assert.equal(csv.parse("a\tb\n1\t2\n").records[0].b, "2");
  const round = csv.parse(csv.stringify(p.headers, p.records)); assert.deepEqual(round.records, p.records);
});

test("fields: header guessing and value cleaning", () => {
  const map = F.guessMap(["Borrower First Name", "E-mail Address", "Property State", "Interest Rate", "Current UPB", "Est. Home Value", "LTV %", "Property Type"]);
  assert.equal(map.firstName, "Borrower First Name"); assert.equal(map.email, "E-mail Address"); assert.equal(map.state, "Property State");
  assert.equal(map.rate, "Interest Rate"); assert.equal(map.balance, "Current UPB"); assert.equal(map.value, "Est. Home Value");
  assert.equal(map.loanType, undefined, "Property Type must not map to loan type");
  assert.equal(F.clean.money("$245,000"), 245000); assert.equal(F.clean.money("(1,500)"), -1500); assert.equal(F.clean.money("250k"), 250000);
  assert.equal(F.clean.percent("6.875%"), 6.875); assert.equal(F.clean.percent("0.065"), 6.5);
  assert.equal(F.clean.state("Michigan"), "MI"); assert.equal(F.clean.state("oh"), "OH");
  assert.equal(F.clean.loanType("FHA 30 Year"), "FHA"); assert.equal(F.clean.loanType("VA IRRRL"), "VA"); assert.equal(F.clean.loanType("Conv 30yr"), "Conventional");
  assert.equal(F.clean.date("3/9/2021"), "2021-03-09"); assert.equal(F.clean.term("360"), 30);
});

test("fields: normalizeLead derives name, months left, equity, LTV, region", () => {
  const rec = { N: "SMITH, JOHN", E: "John@Example.com ", S: "Ohio", R: "7.25%", B: "$200,000", V: "$320,000", D: "1/15/2023", T: "360" };
  const L = F.normalizeLead(rec, { fullName: "N", email: "E", state: "S", rate: "R", balance: "B", value: "V", origDate: "D", origTerm: "T" }, { today: "2026-01-15" });
  assert.equal(L.firstName, "John"); assert.equal(L.lastName, "Smith"); assert.equal(L.email, "john@example.com"); assert.equal(L.state, "OH");
  assert.equal(L.monthsLeft, 360 - 36); assert.equal(L.equity, 120000); assert.equal(L.ltv, 62.5); assert.equal(L.region, "Midwest");
  assert.ok(L.payment > 1300 && L.payment < 1500);
});

test("loanmath: matches the toolkit's payment math", () => {
  assert.equal(Math.round(LM.pmt(300000, 6, 360) * 100) / 100, 1798.65);
  const a = LM.amort(300000, 6, 360); assert.equal(a.months, 360); assert.ok(Math.abs(a.interest - 347514) < 5);
});

test("loanmath: rate-and-term refi qualifies and computes savings", () => {
  const a = LM.analyze(baseLead(), { product: "refi", term: 30 }, RATES);
  assert.equal(a.ok, true, a.reasons.join(";")); assert.equal(a.rate, 6.125);
  assert.ok(a.saveMo > 100); assert.ok(a.apr > a.rate); assert.ok(a.pw.months < 360); assert.ok(a.interestSaved > 0);
});

test("loanmath: disqualifies small rate drops, high LTV, missing data", () => {
  assert.match(LM.analyze(baseLead({ rate: 6.3 }), { product: "refi" }, RATES).reasons.join(), /Rate drop/);
  assert.match(LM.analyze(baseLead({ value: 305000 }), { product: "refi" }, RATES).reasons.join(), /LTV/);
  assert.match(LM.analyze(baseLead({ balance: null }), { product: "refi" }, RATES).reasons.join(), /Missing/);
  assert.match(LM.analyze(baseLead({ loanType: "Jumbo" }), { product: "refi", rateMode: "table" }, { table: { Conventional: {} } }).reasons.join(), /No rate/);
});

test("loanmath: FHA streamline has no costs, MIP financed, no LTV check", () => {
  const a = LM.analyze(baseLead({ loanType: "FHA", value: 290000 }), { product: "refi", term: 30 }, RATES);
  assert.equal(a.fhaS, true); assert.equal(a.costs, 0); assert.equal(a.mipAmt, 5250); assert.equal(a.skipN, 0); assert.equal(a.ok, true, a.reasons.join(";"));
});

test("loanmath: consolidation and home equity use the debt", () => {
  const L = baseLead({ debtBalance: 30000, debtPayment: 900, debtApr: 22 });
  const c = LM.analyze(L, { product: "cashout", term: 30 }, RATES); assert.equal(c.dBal, 30000); assert.ok(c.saveMo > 0); assert.ok(c.blended > 7.5);
  const s = LM.analyze(L, { product: "second", term: 15 }, RATES); assert.equal(s.second, true); assert.ok(s.newP >= 30000); assert.ok(s.cltvNew > 70); assert.equal(s.ok, true, s.reasons.join(";"));
  assert.match(LM.analyze(baseLead(), { product: "second", term: 15 }, RATES).reasons.join(), /No other debt/);
});

test("merge: fields, fallbacks, escaping, missing report", () => {
  const ctx = { first_name: "Ann", city: "" , bad: "<b>" };
  assert.equal(M.fill("Hi {{first_name}}", ctx).text, "Hi Ann");
  assert.equal(M.fill("Hi {{city|there}}", ctx).text, "Hi there");
  assert.deepEqual(M.fill("{{city}} {{nope}}", ctx).missing, ["city", "nope (unknown field)"]);
  assert.equal(M.fill("{{bad}}", ctx, { html: true }).text, "&lt;b&gt;");
});

test("emailtpl: email-safe HTML with proposal, compliance footer and text part", () => {
  const L = baseLead(); const a = LM.analyze(L, { product: "refi", term: 30 }, RATES);
  const r = E.build({ lead: L, analysis: a, sender: { name: "Dave Maxwell", nmls: "2821756", phone: "(313) 555-0142" }, settings: { rates: RATES, address: "1 Main St, Dearborn, MI" },
    campaign: { subject: "{{first_name}}, a lower payment?", preheader: "Numbers inside", body: "Hi {{first_name}},\n\n- **{{monthly_savings}}** a month" }, unsubscribeUrl: "https://x.test/u?e=pat" });
  assert.equal(r.subject, "Pat, a lower payment?");
  assert.ok(r.bytes < 102 * 1024);
  assert.doesNotMatch(r.html, /<script|<svg|data:image/i);
  assert.match(r.html, /width="600"/); assert.match(r.html, /NMLS #2484730/); assert.match(r.html, /NMLS #2821756/); assert.match(r.html, /Equal Housing Opportunity/);
  assert.match(r.html, /APR/); assert.match(r.html, /Unsubscribe/); assert.match(r.html, /1 Main St/);
  assert.match(r.text, /Today vs\. proposed/); assert.match(r.text, /Unsubscribe: https:\/\/x\.test/);
  assert.deepEqual(r.missing, []);
});

test("deliverability: flags the classics", () => {
  const s = D.checkSubject("RE: FREE MONEY!!! Lowest rates 5.99%", null).map(i => i.msg).join(" | ");
  assert.match(s, /RE:/); assert.match(s, /ALL CAPS/); assert.match(s, /exclamation/i); assert.match(s, /APR/); assert.match(s, /lowest rate/i);
  assert.ok(D.checkSubject("{{first_name}}, your payment could drop", null).every(i => i.level !== "error"));
  const setup = D.checkSetup({ fromEmail: "me@gmail.com", fromName: "" }).map(i => i.msg).join(" | ");
  assert.match(setup, /free mailbox/); assert.match(setup, /No From name/);
  assert.match(D.complianceHits("You are pre-approved!").join(), /Pre-approved/);
  assert.equal(D.spamHits("free up $300 a month").length, 0, "“free up” is not the spam word “free”");
});

test("deliverability: lead blocks", () => {
  const lic = new Set(["MI"]);
  assert.equal(D.leadBlock(baseLead(), { licensed: lic }), "");
  assert.match(D.leadBlock(baseLead({ state: "NY" }), { licensed: lic }), /Not licensed/);
  assert.match(D.leadBlock(baseLead(), { suppressed: new Set(["pat@example.com"]) }), /suppression/);
  assert.match(D.leadBlock(baseLead({ email: "x", emailValid: false }), {}), /Invalid/);
  assert.match(D.leadBlock(baseLead({ optOut: true }), {}), /Opted out/);
});

test("filters: ranges, chips, qualified, custom raw columns", () => {
  const leads = [baseLead({ rate: 7.5, state: "MI", _raw: { Tier: "Gold" } }), baseLead({ rate: 6.0, state: "OH", email: "b@example.com", _raw: { Tier: "Silver" } })];
  const ctx = { analysisOf: l => LM.analyze(l, { product: "refi" }, RATES), blockedOf: () => "" };
  assert.equal(FL.apply(leads, Object.assign({}, FL.EMPTY, { qualifiedOnly: false, rateMin: 7 }), ctx).length, 1);
  assert.equal(FL.apply(leads, Object.assign({}, FL.EMPTY, { qualifiedOnly: false, states: ["OH"] }), ctx).length, 1);
  assert.equal(FL.apply(leads, Object.assign({}, FL.EMPTY), ctx).length, 1);
  assert.equal(FL.apply(leads, Object.assign({}, FL.EMPTY, { qualifiedOnly: false, custom: [{ field: "raw:Tier", op: "=", value: "gold" }] }), ctx).length, 1);
});

test("campaign: banker sender mode, reply-to, List-Unsubscribe", () => {
  const settings = { senderMode: "banker", defaultSender: { name: "Default", email: "d@nmc.test" }, bankers: [{ name: "Sarah Kim", email: "sarah@nmc.test", nmls: "1", states: ["MI"] }],
    licensedStates: ["MI", "OH"], rates: RATES, from: { fromEmail: "offers@nmc.test", fromNameTpl: "{{banker_name}} | NMC", replyToMode: "banker", listUnsubMailto: "unsub@nmc.test", oneClick: true },
    unsubscribeUrl: "https://nmc.test/u?e={{email}}&c={{campaign_id}}" };
  const camp = { id: "c1", offer: { product: "refi", term: 30 }, subject: "Hi {{first_name}}", body: "x" };
  const p = C.prepare(baseLead({ banker: "sarah kim" }), camp, { settings, suppression: [] }, { render: true });
  assert.equal(p.sender.name, "Sarah Kim"); assert.equal(p.message.fromName, "Sarah Kim | NMC"); assert.equal(p.message.replyTo, "sarah@nmc.test");
  assert.match(p.message.headers["List-Unsubscribe"], /mailto:unsub@nmc.test/); assert.match(p.message.headers["List-Unsubscribe"], /e=pat%40example.com&c=c1/);
  assert.equal(p.message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const q = C.prepare(baseLead({ banker: "sarah kim", state: "OH" }), camp, { settings, suppression: [] });
  assert.match(q.block, /Not licensed in OH/, "banker's own states limit who she can email");
  const r = C.prepare(baseLead({ banker: "Unknown", state: "OH" }), camp, { settings, suppression: [] });
  assert.equal(r.sender.name, "Default"); assert.equal(r.block, "");
});

test("sample CSV imports cleanly", () => {
  const p = csv.parse(fs.readFileSync(path.join(__dirname, "..", "samples", "sample-leads.csv"), "utf8"));
  const map = F.guessMap(p.headers); for (const k of ["email", "state", "rate", "balance", "value", "debtBalance", "loanType"]) assert.ok(map[k], k + " mapped");
  const leads = p.records.map(r => F.normalizeLead(r, map, { today: "2026-09-29" }));
  assert.equal(leads.length, 240); assert.ok(leads.filter(l => l.emailValid).length >= 237);
});

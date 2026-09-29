/* Send-queue tests: runs a real campaign through the Dry-run and Webhook providers against a local
   HTTP server — pacing, retries on 429, auth-failure pause, skips, no double sends, resume. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const { SendQueue } = require("../main/queue");
const LM = require("../lib/loanmath");
/* a stand-in email service that just says "sent" — counts toward the daily cap like a real one */
require("../main/providers").byId.fake = { id: "fake", send: async () => ({ ok: true, id: "x" }) };

const RATES = { asOf: "2026-09-29", table: { Conventional: { 30: 6.125 } } };
function lead(i, o) { return Object.assign({ leadId: "L" + i, firstName: "P" + i, name: "P" + i + " Doe", email: "p" + i + "@example.com", emailValid: true, state: "MI", loanType: "Conventional", rate: 7.5, balance: 300000, monthsLeft: 340, value: 450000 }, o || {}); }
function setup(provider, cfg, extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nmcq-"));
  const leads = [lead(1), lead(2), lead(3, { state: "NY" }), lead(4, { email: "p1@example.com", leadId: "L4" }), lead(5)];
  const state = { settings: Object.assign({ provider, providerCfg: { [provider]: cfg || {} }, licensedStates: ["MI"], rates: RATES, defaultSender: { name: "Dave" },
    from: { fromEmail: "offers@nmc.test", fromNameTpl: "{{banker_name}}", ratePerMinute: 600, dailyCap: 0 } }, extra || {}),
    campaigns: [{ id: "camp1", offer: Object.assign({}, LM.DEFAULT_OFFER, { product: "refi", term: 30 }), subject: "Hi {{first_name}}", body: "Hello", selected: leads.map(l => "id:" + l.leadId) }], suppression: ["p5@example.com"] };
  const q = new SendQueue({ dataDir: dir, loadState: () => state, loadLeads: () => leads, providerCreds: () => ({ cfg: cfg || {}, secrets: {} }) });
  return { q, dir, state };
}
const done = q => new Promise(res => q.once("done", res));

test("dry run: sends eligible leads once, skips the rest, writes .eml files", async () => {
  const { q, dir } = setup("dryrun");
  q.start("camp1"); const st = await done(q);
  assert.deepEqual([st.counts.sent, st.counts.skipped, st.counts.failed], [2, 3, 0]);
  const log = q.log("camp1"); const by = Object.fromEntries(log.map(x => [x.key, x]));
  assert.match(by["id:L3"].error, /Not licensed in NY/); assert.match(by["id:L4"].error, /Duplicate/); assert.match(by["id:L5"].error, /suppression/);
  const files = fs.readdirSync(path.join(dir, "outbox", "camp1")); assert.ok(files.includes("L1.eml") && files.includes("L1.html"));
  const eml = fs.readFileSync(path.join(dir, "outbox", "camp1", "L1.eml"), "utf8"); assert.match(eml, /^From: Dave <offers@nmc.test>/m); assert.match(eml, /multipart\/alternative/);
  /* a finished dry run can be run again (nobody was emailed) */
  q.start("camp1"); const again = await done(q); assert.equal(again.counts.sent, 2);
  assert.equal(q.sentToday(), 0, "dry runs don't count toward the daily cap");
});

test("a campaign sent for real can't be started again", async () => {
  const { q } = setup("fake");
  q.start("camp1"); await done(q);
  assert.throws(() => q.start("camp1"), /already been sent/);
});

test("webhook: retries 429, signs body, pauses on bad credentials, resumes without double-sending", async () => {
  const hits = []; let mode = "ok", n = 0;
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", d => b += d); req.on("end", () => { n++; hits.push({ h: req.headers, b: JSON.parse(b) });
    if (mode === "429once" && n === 1) { res.writeHead(429); return res.end("{\"message\":\"slow down\"}"); }
    if (mode === "auth") { res.writeHead(401); return res.end("{\"message\":\"bad key\"}"); }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ id: "m" + n })); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  /* webhook requires https — point it at the local server by swapping fetch for this test */
  const realFetch = global.fetch; global.fetch = (url, init) => realFetch(url.replace("https://hook.test", "http://127.0.0.1:" + port), init);
  try {
    const { q } = setup("webhook", { url: "https://hook.test/send" });
    q.o.providerCreds = () => ({ cfg: { url: "https://hook.test/send" }, secrets: { signingSecret: "s3cret" } });
    mode = "429once";
    q.start("camp1");
    /* shorten the 15s backoff: when the first item is waiting, pull its notBefore in */
    await new Promise(r => setTimeout(r, 300)); for (const it of Object.values(q.job.items)) if (it.notBefore) it.notBefore = Date.now(); q.schedule(0);
    const st = await done(q);
    assert.equal(st.counts.sent, 2); assert.equal(hits.length, 3, "one 429 + two successes");
    assert.match(hits[0].h["x-nmc-signature"], /^sha256=[0-9a-f]{64}$/);
    assert.equal(hits.filter(h => h.b.message.to === hits[0].b.message.to).length, 2, "the rate-limited lead is retried once");
    assert.ok(hits[1].b.message.html.includes("Mortgage Savings Proposal"));

    /* bad credentials → pause after two 401s; fix → resume; already-sent lead is never re-sent */
    const s2 = setup("webhook", { url: "https://hook.test/send" }); hits.length = 0; n = 0; mode = "auth";
    s2.q.start("camp1");
    await new Promise(r => { const t = setInterval(() => { const x = s2.q.status("camp1"); if (x.status === "paused" || x.counts.queued && Object.values(s2.q.job.items).some(i => i.notBefore)) { for (const it of Object.values(s2.q.job.items)) if (it.notBefore) it.notBefore = Date.now(); s2.q.schedule(0); } if (x.status === "paused") { clearInterval(t); r(); } }, 50); });
    assert.match(s2.q.status("camp1").reason, /rejected the credentials/);
    mode = "ok"; s2.q.start("camp1"); const st2 = await done(s2.q);
    assert.equal(st2.counts.sent, 2);
    const tos = hits.filter(h => h.b && h.b.message).map(h => h.b.message.to);
    assert.equal(new Set(tos.slice(-2)).size, 2, "each lead sent once after resume");
  } finally { global.fetch = realFetch; srv.close(); }
});

test("daily cap pauses the campaign", async () => {
  const { q, state } = setup("fake"); state.settings.from.dailyCap = 1;
  q.start("camp1");
  await new Promise(r => { const t = setInterval(() => { const s = q.status("camp1"); if (s.status === "paused") { clearInterval(t); r(); } }, 30); });
  const s = q.status("camp1"); assert.equal(s.counts.sent, 1); assert.match(s.reason, /Daily cap/);
});

test("recover: a campaign left running comes back paused", () => {
  const { q, dir } = setup("dryrun");
  fs.writeFileSync(path.join(dir, "sends", "camp1.json"), JSON.stringify({ campaignId: "camp1", status: "running", items: { "id:L1": { status: "queued", attempts: 0 } } }));
  q.recover(); assert.equal(q.load("camp1").status, "paused");
});

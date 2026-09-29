/* The send queue. Runs in the app's main process so API keys never touch the page.
   - One campaign at a time, paced to the per-minute rate and capped per day (Settings → Sending)
   - Every lead is re-checked and rendered right before it's sent, with the same code as the preview
   - Never emails the same address twice in a campaign, even across pauses, crashes and restarts
   - Retries temporary failures (rate limits, timeouts, 5xx) with backoff; stops on bad credentials
   - Progress is saved after every email, so a campaign resumes exactly where it stopped */
const fs = require("fs"), path = require("path"), { EventEmitter } = require("events");
const C = require("../lib/campaign");
const providers = require("./providers");

const BACKOFF = [15000, 60000, 300000];
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

class SendQueue extends EventEmitter {
  constructor(o) { super(); this.dir = path.join(o.dataDir, "sends"); fs.mkdirSync(this.dir, { recursive: true }); this.o = o; this.job = null; this.timer = null; this.busy = false; }

  file(id) { return path.join(this.dir, String(id).replace(/[^\w-]/g, "_") + ".json"); }
  load(id) { try { return JSON.parse(fs.readFileSync(this.file(id), "utf8")); } catch (e) { return null; } }
  persist() { if (!this.job) return; const f = this.file(this.job.campaignId); fs.writeFileSync(f + ".tmp", JSON.stringify(this.job)); fs.renameSync(f + ".tmp", f); }
  ledger() { try { return JSON.parse(fs.readFileSync(path.join(this.dir, "ledger.json"), "utf8")); } catch (e) { return {}; } }
  bump() { const l = this.ledger(), d = today(); l[d] = (l[d] || 0) + 1; for (const k of Object.keys(l)) if (k < d.slice(0, 4) + "-01-01" && Object.keys(l).length > 400) delete l[k]; fs.writeFileSync(path.join(this.dir, "ledger.json"), JSON.stringify(l)); return l[d]; }
  sentToday() { return this.ledger()[today()] || 0; }

  counts(job) { const c = { total: 0, queued: 0, sent: 0, failed: 0, skipped: 0 }; for (const it of Object.values(job.items)) { c.total++; c[it.status] = (c[it.status] || 0) + 1; } return c; }
  status(id) {
    const job = this.job && (!id || this.job.campaignId === id) ? this.job : id ? this.load(id) : null;
    if (!job) return null;
    return { campaignId: job.campaignId, status: job.status, reason: job.reason || "", provider: job.provider, startedAt: job.startedAt, finishedAt: job.finishedAt || null, counts: this.counts(job), sentToday: this.sentToday(), active: !!(this.job && this.job.campaignId === job.campaignId && this.job.status === "running") };
  }
  log(id) { const job = this.job && this.job.campaignId === id ? this.job : this.load(id); return job ? Object.entries(job.items).map(([key, it]) => Object.assign({ key }, it)) : []; }

  /* start or resume. Items are fixed when a campaign is first started; resuming keeps them. */
  start(campaignId) {
    if (this.job && this.job.status === "running") { if (this.job.campaignId === campaignId) return this.status(); throw new Error("Another campaign is sending — pause it first."); }
    const state = this.o.loadState(); const campaign = (state.campaigns || []).find(c => c.id === campaignId);
    if (!campaign) throw new Error("Campaign not found");
    const settings = state.settings || {};
    if (!providers.byId[settings.provider || "dryrun"]) throw new Error("Pick an email service in Settings → Sending");
    if (!(settings.from || {}).fromEmail) throw new Error("Set a From address in Settings → Sending");
    let job = this.load(campaignId);
    if (job && (job.status === "done" || job.status === "cancelled")) {
      if (job.provider === "dryrun") job = null;   /* a dry run emailed nobody, so it can be run again or followed by the real send */
      else throw new Error("This campaign has already been " + (job.status === "done" ? "sent" : "cancelled") + ". Duplicate it to send to a new audience.");
    }
    if (!job) {
      const leads = this.o.loadLeads(); const byKey = new Map(leads.map(l => [C.keyOf(l), l]));
      const items = {}; for (const k of campaign.selected || []) { const l = byKey.get(k); if (l) items[k] = { email: l.email, name: l.name, status: "queued", attempts: 0 }; }
      if (!Object.keys(items).length) throw new Error("No leads selected");
      job = { campaignId, items, startedAt: new Date().toISOString(), provider: settings.provider || "dryrun" };
    }
    job.status = "running"; job.reason = ""; job.provider = settings.provider || "dryrun";
    this.job = job; this.persist(); this.emitProgress(); this.schedule(0);
    return this.status();
  }
  pause(reason) { if (!this.job || this.job.status !== "running") return this.status(); this.job.status = "paused"; this.job.reason = reason || "Paused"; clearTimeout(this.timer); this.persist(); this.emitProgress(); return this.status(); }
  cancel(id) {
    const job = this.job && this.job.campaignId === id ? this.job : this.load(id); if (!job) return null;
    for (const it of Object.values(job.items)) if (it.status === "queued") { it.status = "skipped"; it.error = "Cancelled"; }
    job.status = "cancelled"; job.finishedAt = new Date().toISOString(); clearTimeout(this.timer);
    if (this.job && this.job.campaignId === id) { this.persist(); this.emitProgress(); this.job = null; } else fs.writeFileSync(this.file(id), JSON.stringify(job));
    return { campaignId: id, status: "cancelled" };
  }
  /* on app start: a campaign that was running when the app closed comes back paused, never auto-sends */
  recover() {
    for (const f of fs.readdirSync(this.dir)) { if (!/\.json$/.test(f) || f === "ledger.json") continue;
      try { const j = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")); if (j.status === "running") { j.status = "paused"; j.reason = "App was closed while sending — press Resume to continue"; fs.writeFileSync(path.join(this.dir, f), JSON.stringify(j)); } } catch (e) {} }
  }

  schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.tick().catch(e => this.pause("Error: " + e.message)), ms); }
  emitProgress(last) { this.emit("progress", Object.assign(this.status() || {}, { last: last || null })); }

  async tick() {
    const job = this.job; if (!job || job.status !== "running" || this.busy) return;
    const state = this.o.loadState(); const settings = state.settings || {}; const from = settings.from || {};
    const rate = Math.max(1, Math.min(600, +from.ratePerMinute || 30)), gap = Math.round(60000 / rate);
    const cap = +from.dailyCap || 0;
    if (cap && job.provider !== "dryrun" && this.sentToday() >= cap) { this.pause("Daily cap of " + cap + " reached — press Resume tomorrow (or raise the cap)"); return; }
    const now = Date.now();
    const entries = Object.entries(job.items).filter(([, it]) => it.status === "queued");
    if (!entries.length) { job.status = "done"; job.finishedAt = new Date().toISOString(); this.persist(); this.emitProgress(); this.emit("done", this.status()); this.job = null; return; }
    const ready = entries.find(([, it]) => !it.notBefore || it.notBefore <= now);
    if (!ready) { const next = Math.min(...entries.map(([, it]) => it.notBefore)); this.schedule(Math.max(500, next - now)); return; }
    const [key, it] = ready;

    this.busy = true;
    try {
      const campaign = (state.campaigns || []).find(c => c.id === job.campaignId);
      if (!campaign) { this.pause("Campaign was deleted"); return; }
      const lead = this.o.loadLeads().find(l => C.keyOf(l) === key);
      if (!lead) { it.status = "skipped"; it.error = "Lead no longer in the lead list"; }
      else if (Object.entries(job.items).some(([k, x]) => k !== key && x.status === "sent" && (x.email || "").toLowerCase() === (lead.email || "").toLowerCase())) { it.status = "skipped"; it.error = "Duplicate address — already sent in this campaign"; }
      else {
        const p = C.prepare(lead, campaign, state, { render: true });
        if (p.block) { it.status = "skipped"; it.error = p.block; }
        else if (!p.analysis.ok && campaign.requireQualified !== false) { it.status = "skipped"; it.error = "No longer qualifies: " + p.analysis.reasons.join("; "); }
        else {
          const prov = providers.byId[job.provider]; const creds = this.o.providerCreds(job.provider);
          it.attempts++; it.at = new Date().toISOString();
          const r = await prov.send(p.message, Object.assign({}, creds.cfg, { outbox: path.join(this.o.dataDir, "outbox", job.campaignId) }), creds.secrets);
          if (r.ok) { it.status = "sent"; it.id = r.id || ""; it.error = ""; delete it.notBefore; if (job.provider !== "dryrun") this.bump(); job.authFails = 0; }
          else if (r.status === 401 || r.status === 403) { job.authFails = (job.authFails || 0) + 1; it.error = r.error;
            if (job.authFails >= 2) { it.notBefore = 0; this.persist(); this.pause("The email service rejected the credentials (" + r.error + ") — fix them in Settings → Sending, then Resume"); return; }
            it.notBefore = Date.now() + BACKOFF[0]; }
          else if (r.retryable && it.attempts <= BACKOFF.length) { it.error = r.error + " — retrying"; it.notBefore = Date.now() + BACKOFF[it.attempts - 1]; }
          else { it.status = "failed"; it.error = r.error || "Failed"; }
        }
      }
      this.persist(); this.emitProgress({ key, email: it.email, status: it.status, error: it.error || "" });
    } finally { this.busy = false; }
    if (this.job && this.job.status === "running") this.schedule(it.status === "sent" ? gap : 50);
  }

  /* one email to the marketer's own inbox, rendered for a real lead; subject marked [TEST] */
  async testSend(campaignId, leadKey, to) {
    const state = this.o.loadState(); const settings = state.settings || {};
    const campaign = (state.campaigns || []).find(c => c.id === campaignId); if (!campaign) throw new Error("Campaign not found");
    const lead = this.o.loadLeads().find(l => C.keyOf(l) === leadKey); if (!lead) throw new Error("Pick a lead to preview first");
    const p = C.prepare(lead, campaign, state, { render: true });
    const msg = Object.assign({}, p.message, { to, toName: "", subject: "[TEST] " + p.message.subject, metadata: Object.assign({}, p.message.metadata, { test: "1" }) });
    const id = settings.provider || "dryrun"; const creds = this.o.providerCreds(id);
    return providers.byId[id].send(msg, Object.assign({}, creds.cfg, { outbox: path.join(this.o.dataDir, "outbox", campaignId + "-tests") }), creds.secrets);
  }
}

module.exports = { SendQueue };

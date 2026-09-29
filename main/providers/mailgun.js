/* Mailgun — Messages API. https://documentation.mailgun.com/docs/mailgun/api-reference/ */
const { http, result, netError, addr } = require("./util");

module.exports = {
  id: "mailgun",
  label: "Mailgun",
  help: "Use a sending API key and your verified sending domain. Pick EU if your Mailgun account is in the EU region.",
  fields: [
    { key: "apiKey", label: "API key", secret: true },
    { key: "domain", label: "Sending domain", placeholder: "mg.neighborhoodmc.com" },
    { key: "region", label: "Region", type: "select", options: ["US", "EU"] },
  ],
  base(cfg) { return (cfg.region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net") + "/v3/" + encodeURIComponent(cfg.domain || ""); },
  async send(msg, cfg, secrets) {
    const f = new URLSearchParams();
    f.append("from", addr(msg.from, msg.fromName)); f.append("to", addr(msg.to, msg.toName)); f.append("subject", msg.subject);
    f.append("html", msg.html); if (msg.text) f.append("text", msg.text);
    if (msg.replyTo) f.append("h:Reply-To", msg.replyTo);
    for (const [k, v] of Object.entries(msg.headers || {})) f.append("h:" + k, v);
    for (const t of (msg.tags || []).slice(0, 3)) f.append("o:tag", t);
    for (const [k, v] of Object.entries(msg.metadata || {})) f.append("v:" + k, String(v));
    const auth = "Basic " + Buffer.from("api:" + secrets.apiKey).toString("base64");
    try { const res = await http(this.base(cfg) + "/messages", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" }, body: f.toString() });
      return result(res, null, r => { try { return JSON.parse(r.body).id; } catch (e) { return undefined; } }); }
    catch (e) { return netError(e); }
  },
  async test(cfg, secrets) {
    const auth = "Basic " + Buffer.from("api:" + secrets.apiKey).toString("base64");
    try { const host = cfg.region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
      const res = await http(host + "/v3/domains/" + encodeURIComponent(cfg.domain || ""), { headers: { Authorization: auth } });
      if (res.status !== 200) return { ok: false, detail: "Mailgun said HTTP " + res.status + " — check the key, domain and region." };
      const d = JSON.parse(res.body).domain || {}; return { ok: d.state === "active", detail: "Domain " + d.name + " is " + d.state + "." }; }
    catch (e) { return { ok: false, detail: e.message }; }
  },
};

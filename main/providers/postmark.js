/* Postmark — Email API. https://postmarkapp.com/developer/api/email-api
   Marketing mail must go through a Broadcast message stream, not the transactional one. */
const { http, result, netError, addr } = require("./util");

module.exports = {
  id: "postmark",
  label: "Postmark",
  help: "Use a Server API token and a Broadcast message stream (Postmark requires marketing mail to use one).",
  fields: [
    { key: "token", label: "Server API token", secret: true },
    { key: "stream", label: "Message stream ID", placeholder: "broadcast" },
  ],
  async send(msg, cfg, secrets) {
    const body = {
      From: addr(msg.from, msg.fromName), To: addr(msg.to, msg.toName), ReplyTo: msg.replyTo || undefined, Subject: msg.subject,
      HtmlBody: msg.html, TextBody: msg.text, MessageStream: cfg.stream || "broadcast", Tag: (msg.tags || [])[0],
      Headers: Object.entries(msg.headers || {}).map(([Name, Value]) => ({ Name, Value })),
      Metadata: Object.fromEntries(Object.entries(msg.metadata || {}).map(([k, v]) => [k, String(v)])), TrackOpens: true,
    };
    try { const res = await http("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": secrets.token, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 200) { const j = JSON.parse(res.body); if (j.ErrorCode) return { ok: false, error: j.Message, retryable: false }; return { ok: true, id: j.MessageID }; }
      return result(res); }
    catch (e) { return netError(e); }
  },
  async test(cfg, secrets) {
    try { const res = await http("https://api.postmarkapp.com/server", { headers: { "X-Postmark-Server-Token": secrets.token, Accept: "application/json" } });
      return res.status === 200 ? { ok: true, detail: "Connected to server “" + JSON.parse(res.body).Name + "”." } : { ok: false, detail: "Postmark said HTTP " + res.status + " — check the token." }; }
    catch (e) { return { ok: false, detail: e.message }; }
  },
};

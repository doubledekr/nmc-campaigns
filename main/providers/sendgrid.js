/* SendGrid — v3 Mail Send API. https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send */
const { http, result, netError } = require("./util");

module.exports = {
  id: "sendgrid",
  label: "SendGrid",
  help: "Create an API key with Mail Send permission (Settings → API Keys). The From address must be a verified sender or on an authenticated domain.",
  fields: [
    { key: "apiKey", label: "API key", secret: true, placeholder: "SG.…" },
    { key: "asmGroupId", label: "Unsubscribe group ID", placeholder: "optional", help: "If set, SendGrid manages unsubscribes for this group and suppresses opted-out addresses automatically." },
    { key: "sandbox", label: "Sandbox mode (validate only, don't deliver)", type: "checkbox" },
  ],
  async send(msg, cfg, secrets) {
    const content = []; if (msg.text) content.push({ type: "text/plain", value: msg.text }); content.push({ type: "text/html", value: msg.html });
    const body = {
      personalizations: [{ to: [{ email: msg.to, name: msg.toName || undefined }], custom_args: Object.fromEntries(Object.entries(msg.metadata || {}).map(([k, v]) => [k, String(v)])) }],
      from: { email: msg.from, name: msg.fromName || undefined },
      reply_to: msg.replyTo ? { email: msg.replyTo } : undefined,
      subject: msg.subject, content, headers: Object.keys(msg.headers || {}).length ? msg.headers : undefined,
      categories: (msg.tags || []).slice(0, 10).map(t => String(t).slice(0, 255)),
      asm: cfg.asmGroupId ? { group_id: parseInt(cfg.asmGroupId, 10) } : undefined,
      mail_settings: cfg.sandbox ? { sandbox_mode: { enable: true } } : undefined,
      tracking_settings: { subscription_tracking: { enable: false } },
    };
    try { const res = await http("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: "Bearer " + secrets.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return result(res, [200, 202], r => r.headers.get("x-message-id") || undefined); }
    catch (e) { return netError(e); }
  },
  async test(cfg, secrets) {
    try { const res = await http("https://api.sendgrid.com/v3/scopes", { headers: { Authorization: "Bearer " + secrets.apiKey } });
      if (res.status !== 200) return { ok: false, detail: "SendGrid said HTTP " + res.status + " — check the API key." };
      const scopes = (JSON.parse(res.body).scopes || []); return scopes.includes("mail.send") ? { ok: true, detail: "Key works and can send mail." } : { ok: false, detail: "Key works but lacks Mail Send permission." }; }
    catch (e) { return { ok: false, detail: e.message }; }
  },
};

/* Brevo (formerly Sendinblue) — transactional email API. https://developers.brevo.com/reference/sendtransacemail */
const { http, result, netError } = require("./util");

module.exports = {
  id: "brevo",
  label: "Brevo (Sendinblue)",
  help: "Use an API v3 key. The From address must be a verified sender in Brevo.",
  fields: [{ key: "apiKey", label: "API key", secret: true, placeholder: "xkeysib-…" }],
  async send(msg, cfg, secrets) {
    const body = {
      sender: { email: msg.from, name: msg.fromName || undefined }, to: [{ email: msg.to, name: msg.toName || undefined }],
      replyTo: msg.replyTo ? { email: msg.replyTo } : undefined, subject: msg.subject, htmlContent: msg.html, textContent: msg.text,
      headers: Object.keys(msg.headers || {}).length ? msg.headers : undefined, tags: msg.tags, params: undefined,
    };
    try { const res = await http("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": secrets.apiKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      return result(res, [200, 201, 202], r => { try { return JSON.parse(r.body).messageId; } catch (e) { return undefined; } }); }
    catch (e) { return netError(e); }
  },
  async test(cfg, secrets) {
    try { const res = await http("https://api.brevo.com/v3/account", { headers: { "api-key": secrets.apiKey, Accept: "application/json" } });
      return res.status === 200 ? { ok: true, detail: "Connected to " + (JSON.parse(res.body).companyName || "account") + "." } : { ok: false, detail: "Brevo said HTTP " + res.status + " — check the key." }; }
    catch (e) { return { ok: false, detail: e.message }; }
  },
};

/* Generic webhook: POSTs each finished email as JSON to any URL — a Zapier/Make/n8n hook, an
   internal service, or an email platform's inbound API. Optional shared-secret signature so the
   receiver can verify the call came from this app. Payload shape is documented in docs/PROVIDERS.md. */
const crypto = require("crypto");
const { http, result, netError } = require("./util");

module.exports = {
  id: "webhook",
  label: "Webhook (any service / automation)",
  help: "POSTs one JSON object per email to your URL. Works with Zapier, Make, n8n, or an internal endpoint that hands mail to your service.",
  fields: [
    { key: "url", label: "Webhook URL", placeholder: "https://hooks.example.com/…" },
    { key: "headers", label: "Extra headers (JSON)", placeholder: '{"X-Api-Key":"…"} — optional', type: "textarea", secret: true },
    { key: "signingSecret", label: "Signing secret", secret: true, help: "Optional. Adds X-NMC-Signature: sha256=<HMAC of the body>." },
  ],
  async send(msg, cfg, secrets) {
    if (!/^https:\/\//i.test(cfg.url || "")) return { ok: false, error: "Webhook URL must start with https://" };
    const body = JSON.stringify({ type: "email.send", sentAt: new Date().toISOString(), message: msg });
    const headers = { "Content-Type": "application/json", "User-Agent": "NMC-Campaigns" };
    if (secrets.headers) { try { Object.assign(headers, JSON.parse(secrets.headers)); } catch (e) { return { ok: false, error: "Extra headers aren't valid JSON" }; } }
    if (secrets.signingSecret) headers["X-NMC-Signature"] = "sha256=" + crypto.createHmac("sha256", secrets.signingSecret).update(body).digest("hex");
    try { const res = await http(cfg.url, { method: "POST", headers, body });
      return result(res, null, r => { try { const j = JSON.parse(r.body); return j.id || j.messageId || j.message_id; } catch (e) { return undefined; } }); }
    catch (e) { return netError(e); }
  },
};

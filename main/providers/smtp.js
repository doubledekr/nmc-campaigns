/* SMTP — the universal fallback. Nearly every email service (and Microsoft 365 / Google Workspace)
   offers an SMTP relay, so this works even before a dedicated adapter exists. */
let nodemailer = null;
const transports = new Map();

function transport(cfg, secrets) {
  if (!nodemailer) nodemailer = require("nodemailer");
  const key = [cfg.host, cfg.port, cfg.user, cfg.secure].join("|");
  if (!transports.has(key)) transports.set(key, nodemailer.createTransport({
    host: cfg.host, port: parseInt(cfg.port || "587", 10), secure: cfg.secure === true || String(cfg.port) === "465",
    auth: cfg.user ? { user: cfg.user, pass: secrets.password } : undefined, pool: true, maxConnections: 2,
    connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000,
  }));
  return transports.get(key);
}

module.exports = {
  id: "smtp",
  label: "SMTP relay (any service)",
  help: "Works with almost any email service's SMTP settings. Port 587 with STARTTLS is the usual choice.",
  fields: [
    { key: "host", label: "SMTP host", placeholder: "smtp.yourservice.com" },
    { key: "port", label: "Port", placeholder: "587" },
    { key: "secure", label: "Use TLS from the start (port 465)", type: "checkbox" },
    { key: "user", label: "Username" },
    { key: "password", label: "Password / API key", secret: true },
  ],
  async send(msg, cfg, secrets) {
    try {
      const info = await transport(cfg, secrets).sendMail({
        from: msg.fromName ? { name: msg.fromName, address: msg.from } : msg.from, to: msg.toName ? { name: msg.toName, address: msg.to } : msg.to,
        replyTo: msg.replyTo || undefined, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers,
      });
      return { ok: true, id: info.messageId };
    } catch (e) {
      const code = e.responseCode || 0;
      return { ok: false, status: code, error: e.message, retryable: !code || code >= 400 && code < 500 || /ETIMEDOUT|ECONNRESET|ECONNREFUSED/.test(e.code || "") };
    }
  },
  async test(cfg, secrets) {
    try { await transport(cfg, secrets).verify(); return { ok: true, detail: "Connected and signed in to " + cfg.host + "." }; }
    catch (e) { return { ok: false, detail: e.message }; }
  },
};

/* Email providers. Each one turns a finished message into an API call for one service.
   Adding a service = one small file here + a line in the list below; nothing else changes.

   A provider exports:
     id, label, help                    shown in Settings → Sending
     fields: [{ key, label, secret?, placeholder?, help?, type? }]   what Settings asks for
     send(msg, cfg, secrets) → { ok, id?, status?, error?, retryable? }
     test(cfg, secrets)      → { ok, detail }                       optional credentials check

   msg = { to, toName, from, fromName, replyTo, subject, html, text, headers:{}, tags:[], metadata:{} } */
const PROVIDERS = [
  require("./dryrun"),
  require("./webhook"),
  require("./sendgrid"),
  require("./postmark"),
  require("./mailgun"),
  require("./brevo"),
  require("./smtp"),
];
const byId = Object.fromEntries(PROVIDERS.map(p => [p.id, p]));

/* what the settings screen needs (no functions, no secrets) */
function catalog() { return PROVIDERS.map(p => ({ id: p.id, label: p.label, help: p.help, fields: p.fields || [], canTest: !!p.test })); }

module.exports = { PROVIDERS, byId, catalog };

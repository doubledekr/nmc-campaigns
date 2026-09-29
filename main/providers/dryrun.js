/* Dry run: sends nothing. Writes each message as a .eml file (opens in Outlook / Apple Mail) plus
   an .html copy into the campaign's outbox folder, so the whole send can be rehearsed and inspected. */
const fs = require("fs"), path = require("path");

function eml(msg) {
  const b = "nmc-" + Math.random().toString(36).slice(2);
  const enc = s => /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + Buffer.from(s, "utf8").toString("base64") + "?=";
  const hdr = [
    "From: " + (msg.fromName ? enc(msg.fromName) + " <" + msg.from + ">" : msg.from),
    "To: " + (msg.toName ? enc(msg.toName) + " <" + msg.to + ">" : msg.to),
    msg.replyTo ? "Reply-To: " + msg.replyTo : null,
    "Subject: " + enc(msg.subject),
    "Date: " + new Date().toUTCString(),
    "MIME-Version: 1.0",
    ...Object.entries(msg.headers || {}).map(([k, v]) => k + ": " + v),
    "X-Unsent: 1",
    'Content-Type: multipart/alternative; boundary="' + b + '"',
  ].filter(Boolean);
  const part = (type, body) => "--" + b + "\r\nContent-Type: " + type + "; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" + Buffer.from(body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n") + "\r\n";
  return hdr.join("\r\n") + "\r\n\r\n" + part("text/plain", msg.text || "") + part("text/html", msg.html || "") + "--" + b + "--\r\n";
}

module.exports = {
  id: "dryrun",
  label: "Dry run (nothing is sent)",
  help: "Rehearse a campaign: every email is saved as a file you can open, instead of being sent. Use this until your email service is connected.",
  fields: [],
  async send(msg, cfg) {
    const dir = cfg.outbox; fs.mkdirSync(dir, { recursive: true });
    const base = String(msg.metadata && msg.metadata.leadId || msg.to).replace(/[^\w.@-]+/g, "_");
    fs.writeFileSync(path.join(dir, base + ".eml"), eml(msg));
    fs.writeFileSync(path.join(dir, base + ".html"), msg.html || "");
    return { ok: true, id: "dryrun:" + base };
  },
  eml,
};

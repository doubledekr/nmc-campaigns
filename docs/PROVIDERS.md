# Email service adapters

The app renders every email itself (HTML + plain text + headers). A provider's only job is to hand one finished message to a service and report what happened. That's why switching or adding services doesn't touch anything else.

## The message

```js
{
  to: "pat@example.com", toName: "Pat Doe",
  from: "dave@neighborhoodmc.com", fromName: "Dave Maxwell | Neighborhood Mortgage",
  replyTo: "dave@neighborhoodmc.com",
  subject: "Pat, your payment could drop by $249",
  html: "<!DOCTYPE html>…", text: "Hi Pat, …",
  headers: {
    "List-Unsubscribe": "<mailto:unsubscribe@…>, <https://…>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"   // only when one-click is enabled
  },
  tags: ["nmc-campaign", "<campaignId>"],
  metadata: { campaignId: "…", leadId: "L10001", banker: "Dave Maxwell" }
}
```

## Webhook payload

With **Webhook** selected, each email is one `POST` to your URL:

```http
POST /your-endpoint
Content-Type: application/json
User-Agent: NMC-Campaigns
X-NMC-Signature: sha256=<hex HMAC-SHA256 of the raw body with your signing secret>   (if a secret is set)
<any extra headers from Settings>

{ "type": "email.send", "sentAt": "2026-09-30T14:02:11.000Z", "message": { …the message above… } }
```

How the queue reads your response:

| Response | What the queue does |
|---|---|
| Any `2xx` | Sent. If the JSON body has `id` / `messageId` / `message_id`, that ID goes in the log. |
| `429` or `5xx` | Retried after 15 s, 1 min, then 5 min. |
| `401` / `403` twice in a row | Pauses the campaign with "credentials rejected". |
| Anything else | Failed for that lead. The campaign continues. |

To verify a request (Node):

```js
const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(req.headers["x-nmc-signature"]));
```

## Adding a service

1. Create `main/providers/<name>.js`:

```js
const { http, result, netError, addr } = require("./util");
module.exports = {
  id: "acme", label: "Acme Mail",
  help: "Where to find the API key…",
  fields: [                                    // rendered in Settings → Sending
    { key: "apiKey", label: "API key", secret: true },   // secret → encrypted, never shown again
    { key: "region", label: "Region", type: "select", options: ["US", "EU"] },
  ],
  async send(msg, cfg, secrets) {              // → { ok, id?, status?, error?, retryable? }
    try {
      const res = await http("https://api.acme.test/send", { method: "POST",
        headers: { Authorization: "Bearer " + secrets.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ to: msg.to, from: addr(msg.from, msg.fromName), subject: msg.subject, html: msg.html, text: msg.text }) });
      return result(res);                      // 2xx ok · 429/5xx retryable · else failed
    } catch (e) { return netError(e); }
  },
  async test(cfg, secrets) { /* optional: cheap credentials check → { ok, detail } */ },
};
```

2. Add `require("./acme")` to the list in `main/providers/index.js`.

That's all. The service appears in Settings, and the queue handles pacing, retries, logging and resume.

## Unsubscribes and bounces

The app blocks anyone on its **suppression list** (Leads → Suppression list), anyone marked opted-out in the CSV, and invalid or disposable addresses.

Bounces, complaints and unsubscribes happen at the email service, so import them into the suppression list before each send. (SendGrid: set an *unsubscribe group ID* and SendGrid also suppresses them itself.)

A later version can pull these automatically from the service's API once we know which one it is.

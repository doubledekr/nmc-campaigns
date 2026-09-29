# NMC Campaigns

Desktop app (Windows + Mac) for Neighborhood Mortgage Company's email campaigns. It imports a lead CSV, filters it down to an audience, builds a **personal savings proposal for every lead** (the same math and look as the NMC Banker Toolkit), checks deliverability and compliance, and sends through whichever email service the company uses.

Built for one marketing user. Leads, campaigns, and send logs stay on that person's computer.

## How it works

1. **Leads.** Drop in a CSV. Columns are matched automatically (First Name, Email, State, Interest Rate, UPB, Home Value, Revolving Debt, …). The mapping can be saved so the same export format imports in one click. A suppression list (unsubscribes, bounces, do-not-email) is checked before every send.
2. **Audience.** Filter by rate, loan type, region, state, equity, LTV, other debt, credit score, balance, banker, and lead source. You can also filter by offer results ("saves at least $200/mo", "rate drop ≥ 0.75%") or by any raw CSV column. Select everyone matching, or pick leads one by one.
3. **Offer.** Choose one of three offers:
   - Rate-and-term refi. FHA and VA leads are quoted as a Streamline or IRRRL.
   - Debt-consolidation refi.
   - Home equity loan.

   Set the term, closing costs, skipped payments, and "pay what you pay now". Qualification rules (min rate drop, min savings, max LTV/CLTV, min debt, min FICO) decide who gets the offer. The shared rate sheet is keyed by loan type.
4. **Message.** Write a master subject, preview text, and copy with merge fields (`{{first_name|there}}`, `{{monthly_savings}}`, `{{new_payment}}`, …). The proposal is appended below the copy. A live preview steps through real leads on desktop, phone, and plain text, with subject-line feedback as you type.
5. **Check.** You get a deliverability and compliance score (A–F) with specific fixes:
   - spam wording, caps, and punctuation
   - subject length
   - rates without APR
   - "pre-approved" and other mortgage-ad red flags
   - link shorteners and mismatched links
   - Gmail's 102 KB clipping limit
   - unsubscribe, address, and NMLS
   - From-domain problems
   - SPF/DKIM/DMARC and warm-up

   Leads that can't be emailed are counted and can be removed. That covers leads in unlicensed states, with invalid addresses, suppressed, or opted out.
6. **Send.** Send a test to your own inbox first. The main send is paced (per minute, with a daily cap), retries temporary failures, and stops on bad credentials. It never emails anyone twice and resumes where it left off after a pause or a crash. The full log exports to CSV.

## Email services

Sending goes through a small adapter per service in `main/providers/`. The rest of the app doesn't know or care which one is in use, and switching services is a setting.

| Service | Status |
|---|---|
| Dry run | Saves every email as `.eml` + `.html` files instead of sending. Default until the real service is connected. |
| Webhook | POSTs each email as JSON to any URL (Zapier / Make / n8n / internal endpoint), with optional HMAC signature. |
| SendGrid, Postmark, Mailgun, Brevo | Direct API adapters |
| SMTP | Fallback for any service with SMTP relay settings |

API keys are entered in **Settings → Sending**. They're encrypted with the OS keychain, stored in the app's data folder, and never visible to the page. See [docs/PROVIDERS.md](docs/PROVIDERS.md) for the webhook payload and for how to add a new service.

## Develop

```bash
npm install
npm start          # run the app
npm test           # library + send-queue tests
npm run sample     # regenerate samples/sample-leads.csv (fake leads, example.com addresses)
```

Opening `app/index.html` through any local web server also works (browser preview: build and check campaigns, no sending).

Layout:

```
main.js, preload.js      Electron shell: data files, encrypted keys, IPC
main/queue.js            the send queue (pacing, retries, resume, logs)
main/providers/          one file per email service
lib/                     shared by the app window, the queue and the tests
  csv.js fields.js       CSV parsing, column mapping, value cleaning
  loanmath.js            proposal math, ported from the Banker Toolkit
  emailtpl.js            the email-safe proposal (600px tables, inline CSS)
  merge.js               merge fields
  deliverability.js      scoring + compliance checks + lead blocks
  filters.js campaign.js audience filters; per-lead assembly (sender, block, message)
app/                     the interface
test/                    node --test suites
```

## Releases and updates

Every push to `main` that touches the app runs the tests. It then builds `NMC-Campaigns-Setup-x.y.z.exe` (Windows) and `NMC-Campaigns-x.y.z.dmg` (Mac) and publishes them as a GitHub Release. **Bump `version` in package.json** to cut a new release.

Installed copies check the latest release hourly and offer a "Restart to update" bar. Auto-update reads releases anonymously, so it needs this repo to be **public** (as with nmc-tookit), or a release mirror.

Builds are unsigned for now. On first run, Windows SmartScreen shows "More info → Run anyway", and on Mac you right-click → Open.

## Data

| | |
|---|---|
| Windows | `%APPDATA%\NMC Campaigns\` |
| macOS | `~/Library/Application Support/NMC Campaigns/` |

The folder holds:
- `leads.json`: client data; never share it
- `campaigns-data.json`: settings, campaigns, suppression list, mappings
- `secrets.json`: encrypted keys
- `sends/`: per-campaign logs
- `outbox/`: dry-run output

Settings → Data exports a settings backup (no leads, no keys).

## Before the first real send

- [ ] Compliance approves the footer disclaimer (Settings → Company & branding) and a test email
- [ ] Company mailing address and a hosted logo URL filled in
- [ ] Unsubscribe link (or the service's unsubscribe group) set up, plus a process for getting unsubscribes into the suppression list
- [ ] SPF, DKIM and DMARC set for the From domain with the email service
- [ ] Licensed states checked; bankers' states filled in if sending as each banker
- [ ] Rate sheet updated the day of the send
- [ ] Test sent to Gmail, Outlook and a phone

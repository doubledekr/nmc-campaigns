/* Deliverability + compliance checker. Scores a campaign's subject, preheader, copy and rendered
   email the way spam filters and mortgage-advertising rules look at them, and explains each
   finding with a specific fix. Also blocks individual leads that shouldn't be emailed.
   Issue levels: "error" (fix before sending), "warn" (hurts inbox placement), "tip" (nice to have). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NMC = root.NMC || {}).deliver = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* phrase → weight. Heavier = more likely to trip filters. Matched as whole words, case-insensitive. */
  const SPAM = {
    "act now": 3, "act immediately": 3, "apply now": 1, "as seen on": 2, "bargain": 2, "best price": 2, "big savings": 1, "billion": 2,
    "cash bonus": 3, "cheap": 2, "click below": 2, "click here": 2, "congratulations": 3, "dear friend": 3, "don't delete": 3, "don't miss": 1,
    "double your": 3, "earn money": 3, "eliminate debt": 3, "exclusive deal": 2, "expires today": 2, "extra cash": 3, "final notice": 3,
    "for only": 2, "free": 2, "free money": 4, "get out of debt": 3, "get paid": 3, "great offer": 2, "hurry": 2, "incredible deal": 3,
    "instant": 1, "last chance": 2, "limited time": 2, "lower your mortgage rate": 2, "lowest price": 2, "make money": 3, "miracle": 3,
    "money back": 2, "no catch": 3, "no cost": 2, "no fees": 1, "no hidden": 2, "no obligation": 1, "no strings attached": 3, "offer expires": 2,
    "once in a lifetime": 3, "only $": 2, "order now": 2, "please read": 2, "risk-free": 3, "risk free": 3, "save big": 2, "special promotion": 2,
    "this won't last": 3, "urgent": 3, "what are you waiting for": 3, "while supplies last": 2, "winner": 3, "you have been selected": 4,
    "you're a winner": 4, "100% free": 4, "100% satisfied": 3, "#1": 2, "$$$": 4, "cash": 1, "debt free": 1, "refinance now": 2, "consolidate your debt": 1,
  };
  /* mortgage advertising risk: Reg Z (§1026.24), the MAP rule (Reg N), UDAAP, CAN-SPAM. These are errors: take them to compliance. */
  const COMPLIANCE = [
    [/\bguarantee[ds]?\b.{0,20}\b(approv|rate|loan|lowest)/i, "“Guaranteed” approval/rate claims aren’t allowed — every loan is subject to credit approval."],
    [/\bpre-?approved\b/i, "“Pre-approved” implies a credit decision you haven’t made. Say “you may qualify” or “see what you qualify for.”"],
    [/\bpre-?qualified\b/i, "“Pre-qualified” implies a credit review happened. Use “you may qualify.”"],
    [/\bno credit check\b/i, "“No credit check” is inaccurate for mortgage lending."],
    [/\b(lowest|best) (rates?|price|pricing|payment)\b/i, "Superlatives like “lowest rate” must be substantiated — regulators treat unsupported ones as deceptive."],
    [/\b(government|federal|stimulus|obama|biden|trump|harp|hamp)\b.{0,25}\b(program|refi|refinance|relief|loan|plan)\b/i, "Implying a government program or affiliation is a MAP-rule violation (FHA/VA are fine to name as loan types)."],
    [/\b(your (current )?(lender|servicer)|loan servicing department|important notice (about|regarding) your (loan|mortgage))\b/i, "Wording that could read as coming from their current servicer is deceptive (MAP rule / UDAAP)."],
    [/\bfixed (rate )?for life\b/i, "“Fixed for life” needs care — only true of fixed-rate loans held to term; say “fixed-rate.”"],
    [/\bno closing costs\b|\bno[- ]cost refi/i, "“No closing costs” must be literally true for everyone who receives this (lender credits usually mean a higher rate). Verify or reword."],
    [/\bdebt[- ]free\b.{0,20}\b(guarantee|instantly|immediately)\b/i, "Don’t promise debt-free outcomes."],
  ];
  const ACRONYMS = new Set(["NMLS", "APR", "FHA", "VA", "USDA", "NMC", "HELOC", "HEL", "PITI", "LTV", "CLTV", "IRRRL", "FICO", "ARM", "PMI", "MIP", "USA", "US", "LLC", "OK", "ID", "TX", "FL", "CA", "MI", "OH", "GA", "NC", "SC", "TN", "IN", "AL", "AZ", "MD", "WA", "PM", "AM", "CEO", "FAQ", "HOA"]);
  const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|t\.co|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy)\b/i;
  const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|comcast|att|verizon)\.[a-z.]+$/i;
  const ROLE = /^(info|admin|support|sales|help|contact|office|noreply|no-reply|donotreply|postmaster|abuse|webmaster|billing|marketing|team|hello|service)@/i;
  const DISPOSABLE = /@(mailinator|guerrillamail|10minutemail|tempmail|temp-mail|throwawaymail|yopmail|trashmail|sharklasers|getnada|dispostable)\./i;

  const words = s => (String(s || "").match(/[A-Za-z0-9$%'#]+/g) || []);
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu;

  function spamHits(text) {
    const t = " " + String(text || "").toLowerCase().replace(/\s+/g, " ").replace(/\bfreed? up\b/g, " ") + " "; const hits = [];
    for (const [p, w] of Object.entries(SPAM)) {
      const re = /^[a-z0-9]/.test(p) ? new RegExp("(^|[^a-z0-9])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (/[a-z0-9]$/.test(p) ? "(?=[^a-z0-9]|$)" : ""), "i") : null;
      if (re ? re.test(t) : t.includes(p)) hits.push({ phrase: p, weight: w });
    }
    return hits;
  }
  function complianceHits(text) { return COMPLIANCE.filter(([re]) => re.test(text || "")).map(([, msg]) => msg); }
  function capsWords(text) { return words(text).filter(w => w.length >= 3 && /[A-Z]/.test(w) && w === w.toUpperCase() && !/^\d/.test(w) && !ACRONYMS.has(w.replace(/[^A-Z]/g, ""))); }

  /* ---------- subject line ---------- */
  function checkSubject(raw, rendered) {
    const out = []; const s = rendered != null ? rendered : raw || "";
    if (!String(raw || "").trim()) { out.push({ level: "error", area: "subject", msg: "No subject line.", fix: "Write a subject — 30–50 characters that says what’s inside." }); return out; }
    const len = [...s].length;
    if (len > 78) out.push({ level: "warn", area: "subject", msg: `Subject is ${len} characters — phones cut it off around 35–45 and desktop around 60.`, fix: "Put the point in the first 35 characters; aim for 30–50 total." });
    else if (len > 55) out.push({ level: "tip", area: "subject", msg: `Subject is ${len} characters — the end will be cut off on phones.`, fix: "Move the key words to the front, or trim to under 50." });
    else if (len < 12) out.push({ level: "tip", area: "subject", msg: "Very short subject — may read as vague or spammy.", fix: "Say what’s inside in a few more words." });
    if (/^\s*(re|fw|fwd)\s*:/i.test(raw)) out.push({ level: "error", area: "subject", msg: "“RE:” / “FW:” on a first-touch email is a deceptive subject under CAN-SPAM and a strong spam signal.", fix: "Remove it." });
    const caps = capsWords(raw); if (caps.length) out.push({ level: caps.length > 1 ? "warn" : "tip", area: "subject", msg: "ALL CAPS: " + caps.slice(0, 4).join(", "), fix: "Use normal capitalization — caps are one of the strongest spam signals." });
    const bang = (raw.match(/!/g) || []).length; if (bang > 1 || /!!|\?!|!\?/.test(raw)) out.push({ level: "warn", area: "subject", msg: "Multiple exclamation points.", fix: "Use none (or at most one)." }); else if (bang === 1) out.push({ level: "tip", area: "subject", msg: "Exclamation point in the subject.", fix: "Subjects without one tend to land better for financial offers." });
    if (/\$\$|\$\s*\d{1,3}(,\d{3})+|\b\d+%\s*off\b/i.test(s)) out.push({ level: "tip", area: "subject", msg: "Dollar amounts in subject lines raise spam scores.", fix: "Keep numbers for the body, or use one small, specific figure." });
    if (/\d+(\.\d+)?\s*%/.test(s) && !/apr/i.test(s)) out.push({ level: "error", area: "subject", msg: "A rate in the subject line without its APR.", fix: "Reg Z requires the APR as prominently as any rate you advertise. Keep rates out of the subject; the proposal shows rate and APR together." });
    const emo = (s.match(emojiRe) || []).length; if (emo > 1) out.push({ level: "warn", area: "subject", msg: emo + " emoji in the subject.", fix: "At most one, and none is safer for mortgage offers." });
    if (/[★☆✔✖➤►→]{1,}|\*{2,}|#{2,}/.test(s)) out.push({ level: "tip", area: "subject", msg: "Decorative symbols in the subject.", fix: "Plain words read as a real person wrote it." });
    const sh = spamHits(raw); if (sh.length) out.push({ level: sh.some(h => h.weight >= 3) ? "warn" : "tip", area: "subject", msg: "Spam-trigger wording: " + sh.map(h => "“" + h.phrase + "”").join(", "), fix: "Rephrase in plain, specific terms (e.g. “your payment could drop by {{monthly_savings}}”)." });
    for (const m of complianceHits(raw)) out.push({ level: "error", area: "subject", msg: m, fix: "Reword before sending." });
    if (!/\{\{/.test(raw)) out.push({ level: "tip", area: "subject", msg: "No personalization.", fix: "A first name or city ({{first_name}}, {{city}}) typically lifts opens and reads less like a blast." });
    return out;
  }

  function checkPreheader(pre, subject) {
    const out = []; const p = String(pre || "").trim();
    if (!p) { out.push({ level: "warn", area: "preheader", msg: "No preview text — inboxes will show the first words of the email instead.", fix: "Add 40–100 characters that continue the subject line." }); return out; }
    if (p.toLowerCase() === String(subject || "").trim().toLowerCase()) out.push({ level: "warn", area: "preheader", msg: "Preview text repeats the subject.", fix: "Use it to add the next thought." });
    if (p.length < 30) out.push({ level: "tip", area: "preheader", msg: "Short preview text.", fix: "40–100 characters fills the preview line." });
    if (p.length > 140) out.push({ level: "tip", area: "preheader", msg: "Preview text over 140 characters will be cut off.", fix: "Trim it." });
    const sh = spamHits(p); if (sh.length) out.push({ level: "tip", area: "preheader", msg: "Spam-trigger wording: " + sh.map(h => "“" + h.phrase + "”").join(", "), fix: "Rephrase." });
    for (const m of complianceHits(p)) out.push({ level: "error", area: "preheader", msg: m, fix: "Reword before sending." });
    return out;
  }

  /* ---------- copy + rendered email ---------- */
  function checkContent(bodyRaw, html, opts) {
    opts = opts || {}; const out = [];
    const copy = String(bodyRaw || "");
    const wc = words(copy.replace(/\{\{[^}]+\}\}/g, "x")).length;
    if (wc < 25) out.push({ level: "tip", area: "content", msg: `Intro copy is ${wc} words.`, fix: "A short, personal paragraph or two (50–150 words) above the proposal reads like a real note and helps inbox placement." });
    if (wc > 300) out.push({ level: "tip", area: "content", msg: `Intro copy is ${wc} words.`, fix: "Most people skim — the proposal carries the detail. Aim for under 150 words." });
    const bang = (copy.match(/!/g) || []).length; if (bang > 2) out.push({ level: "warn", area: "content", msg: bang + " exclamation points in the copy.", fix: "Cut to one or none." });
    const caps = capsWords(copy); if (caps.length > 2) out.push({ level: "warn", area: "content", msg: "ALL CAPS words: " + caps.slice(0, 5).join(", "), fix: "Use bold for emphasis instead." });
    const sh = spamHits(copy); const w = sh.reduce((s, h) => s + h.weight, 0);
    if (sh.length) out.push({ level: w >= 5 ? "warn" : "tip", area: "content", msg: "Spam-trigger wording: " + sh.map(h => "“" + h.phrase + "”").join(", "), fix: "Rewrite those phrases the way you’d say them on a call." });
    for (const m of complianceHits(copy)) out.push({ level: "error", area: "compliance", msg: m, fix: "Reword before sending." });
    if (/\d+(\.\d+)?\s*%/.test(copy.replace(/\{\{[^}]+\}\}/g, "")) && !/apr|\{\{\s*apr/i.test(copy)) out.push({ level: "warn", area: "compliance", msg: "The copy states a rate without its APR next to it.", fix: "Use {{new_rate}} ({{apr}} APR) together, or leave rates to the proposal section, which always shows both." });

    if (html) {
      const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ href: m[1].replace(/&amp;/g, "&"), text: m[2].replace(/<[^>]+>/g, "").trim() }));
      const content = links.filter(l => !/^(mailto:|tel:)/i.test(l.href) && !/nmlsconsumeraccess|unsub/i.test(l.href + l.text));
      if (content.length > 5) out.push({ level: "warn", area: "content", msg: content.length + " links.", fix: "Keep it to one clear call-to-action and a couple of links at most." });
      for (const l of links) {
        if (SHORTENERS.test(l.href)) out.push({ level: "error", area: "content", msg: "Link shortener (" + l.href + ").", fix: "Shortened links are heavily filtered — use the full link on your own domain." });
        if (/^http:\/\//i.test(l.href)) out.push({ level: "warn", area: "content", msg: "Non-secure link (" + l.href + ").", fix: "Use https://." });
        const shownDomain = (l.text.match(/(?:https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}/i) || [])[0];
        if (shownDomain && /^https?:/i.test(l.href)) { const host = (l.href.match(/^https?:\/\/([^/]+)/i) || [])[1] || ""; const shown = shownDomain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
          if (host && !host.toLowerCase().endsWith(shown.replace(/^www\./, ""))) out.push({ level: "error", area: "content", msg: `Link text shows ${shown} but goes to ${host}.`, fix: "Mismatched link text is a classic phishing signal — make them match." }); }
        if (/\{\{|\}\}/.test(l.href)) out.push({ level: "error", area: "content", msg: "A link still contains an unfilled merge field.", fix: "Fill in the link or its merge field in Settings." });
      }
      if (!opts.unsubscribe && !/unsubscribe/i.test(html)) out.push({ level: "error", area: "compliance", msg: "No unsubscribe link.", fix: "CAN-SPAM requires a working opt-out. Set the unsubscribe link in Settings → Sending (or your email service adds one)." });
      if (!opts.address) out.push({ level: "error", area: "compliance", msg: "No physical mailing address in the footer.", fix: "CAN-SPAM requires one. Add it in Settings → Company & branding." });
      if (!/NMLS\s*#?\s*\d/i.test(html)) out.push({ level: "error", area: "compliance", msg: "No NMLS number.", fix: "Add the company NMLS # in Settings." });
      const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
      if (imgs.some(i => !/\balt="[^"]+"/i.test(i))) out.push({ level: "warn", area: "content", msg: "An image has no alt text.", fix: "Add alt text — many inboxes block images by default." });
      if (imgs.some(i => /src="data:/i.test(i))) out.push({ level: "error", area: "content", msg: "Embedded (data:) image.", fix: "Gmail and Outlook strip these. Host the image and use its web address." });
      if (imgs.length > 3) out.push({ level: "warn", area: "content", msg: imgs.length + " images.", fix: "Image-heavy emails filter to Promotions/spam; keep text doing the work." });
      if (!opts.logo) out.push({ level: "tip", area: "content", msg: "No logo image — the header uses a text wordmark.", fix: "Add a hosted logo URL in Settings → Company & branding (a PNG on your website or your email service’s image library)." });
      const kb = (opts.bytes || html.length) / 1024;
      if (kb > 102) out.push({ level: "error", area: "content", msg: `Email is ${kb.toFixed(0)} KB — Gmail clips anything over 102 KB, hiding the footer and unsubscribe link.`, fix: "Shorten the copy or turn off a proposal section." });
      else if (kb > 85) out.push({ level: "warn", area: "content", msg: `Email is ${kb.toFixed(0)} KB, close to Gmail’s 102 KB clipping limit.`, fix: "Trim copy or a section." });
      const text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
      if (text.length < 400 && imgs.length) out.push({ level: "warn", area: "content", msg: "Very little text compared to images.", fix: "Add more text." });
    }
    return out;
  }

  /* ---------- sender / setup ---------- */
  function checkSetup(s) {
    s = s || {}; const out = [];
    const from = String(s.fromEmail || "").trim();
    if (!from) out.push({ level: "error", area: "setup", msg: "No From address.", fix: "Set it in Settings → Sending." });
    else {
      if (FREE_MAIL.test(from)) out.push({ level: "error", area: "setup", msg: "Sending from a free mailbox (" + from.split("@")[1] + ").", fix: "Gmail/Yahoo/Outlook.com publish DMARC policies that reject bulk mail sent “from” them through any service. Use an address on the company domain." });
      if (/^(no-?reply|donotreply|do-not-reply)@/i.test(from)) out.push({ level: "warn", area: "setup", msg: "No-reply From address.", fix: "Replies are a positive signal to inbox providers — and they’re leads. Use a real mailbox." });
    }
    if (s.noSender) out.push({ level: "warn", area: "setup", msg: "No default sender set up \u2014 emails have no person\u2019s name, phone or NMLS # in the signature.", fix: "Fill in Settings \u2192 Senders." });
    if (!String(s.fromName || "").trim()) out.push({ level: "warn", area: "setup", msg: "No From name.", fix: "Use a person’s name (“Dave Maxwell, NMC”) — people open email from people." });
    const dom = e => (String(e || "").split("@")[1] || "").toLowerCase();
    if (s.replyTo && from && dom(s.replyTo) !== dom(from)) out.push({ level: "tip", area: "setup", msg: "Reply-To is on a different domain than From.", fix: "Fine if intended; matching domains look more trustworthy." });
    if (!s.authConfirmed) out.push({ level: "warn", area: "setup", msg: "Domain authentication (SPF, DKIM, DMARC) not confirmed.", fix: "Have whoever manages the domain set these up for your email service, then tick the box in Settings → Sending. Since 2024 Gmail and Yahoo require them for bulk senders." });
    if (s.provider === "dryrun" || !s.provider) out.push({ level: "tip", area: "setup", msg: "Sending is set to Dry run — nothing will actually be sent.", fix: "Pick your email service in Settings → Sending when it’s ready." });
    if (s.volume > (s.warmCap || 500) && !s.warmedUp) out.push({ level: "warn", area: "setup", msg: `${s.volume.toLocaleString()} recipients in one campaign on a sending setup not marked as warmed up.`, fix: "New domains should ramp up over a few weeks (e.g. 200 → 500 → 1,000/day). Use the daily cap in Settings → Sending, or split this campaign." });
    return out;
  }

  /* ---------- per-lead: returns "" (ok) or a block reason; warnings via leadWarnings ---------- */
  function leadBlock(lead, ctx) {
    ctx = ctx || {};
    if (!lead.email) return "No email";
    if (!lead.emailValid) return "Invalid email";
    if (DISPOSABLE.test(lead.email)) return "Disposable email domain";
    if (lead.optOut) return "Opted out in the CSV";
    if (ctx.suppressed && ctx.suppressed.has(lead.email)) return "On suppression list";
    if (ctx.licensed && ctx.licensed.size && !ctx.licensed.has(lead.state)) return lead.state ? "Not licensed in " + lead.state : "No state on file";
    return "";
  }
  function leadWarnings(lead, rendered) {
    const w = [];
    if (ROLE.test(lead.email || "")) w.push("Role address (" + lead.email.split("@")[0] + "@) — often filtered and rarely a person");
    if (rendered && rendered.missing && rendered.missing.length) w.push("Empty merge field" + (rendered.missing.length > 1 ? "s" : "") + ": " + rendered.missing.join(", ") + " — add a fallback like {{first_name|there}}");
    if (lead._warn) w.push(...lead._warn.filter(x => !/email/i.test(x)));
    return w;
  }

  function score(issues) {
    let s = 100;
    for (const i of issues) s -= i.level === "error" ? 15 : i.level === "warn" ? 6 : 2;
    s = Math.max(0, Math.min(100, s));
    const grade = s >= 90 ? "A" : s >= 78 ? "B" : s >= 64 ? "C" : s >= 50 ? "D" : "F";
    return { score: s, grade, errors: issues.filter(i => i.level === "error").length, warns: issues.filter(i => i.level === "warn").length, tips: issues.filter(i => i.level === "tip").length };
  }

  function checkCampaign(c) {
    const issues = [
      ...checkSubject(c.subject, c.renderedSubject),
      ...checkPreheader(c.preheader, c.renderedSubject || c.subject),
      ...checkContent(c.body, c.html, { unsubscribe: !!c.unsubscribe, address: !!c.address, logo: !!c.logo, bytes: c.bytes }),
      ...checkSetup(c.setup),
    ];
    return { issues, ...score(issues) };
  }

  /* subject-line starters by offer, all compliance-safe (no rates, no superlatives, no urgency) */
  const IDEAS = {
    refi: ["{{first_name}}, your payment could drop by {{monthly_savings}}", "A lower payment on your {{city}} home?", "{{first_name}}, I ran the numbers on your mortgage", "Your refinance numbers, {{first_name}}", "What today’s rates could mean for your payment", "{{first_name}}, a quick look at your mortgage", "Could you keep {{monthly_savings}} a month?"],
    cashout: ["{{first_name}}, one payment instead of several?", "What consolidating could free up each month", "{{first_name}}, I ran the numbers on your debts", "Your home’s equity vs. your card balances", "A plan to pay off {{debt_balance}}, {{first_name}}"],
    second: ["{{first_name}}, keep your mortgage rate and lower your bills", "Your equity could pay off {{debt_balance}}", "One fixed payment for your other balances", "{{first_name}}, a home equity option to look at", "Leave your first mortgage alone — here’s another way"],
  };

  return { checkCampaign, checkSubject, checkPreheader, checkContent, checkSetup, leadBlock, leadWarnings, score, spamHits, complianceHits, IDEAS };
});

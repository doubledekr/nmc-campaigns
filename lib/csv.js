/* CSV reading and writing. Handles quoted fields, embedded commas/newlines, doubled quotes,
   a UTF-8 BOM, CRLF line endings, and comma / tab / semicolon / pipe delimiters (auto-detected).
   Shared by the app window and the tests (UMD: works as a <script> or a require()). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.NMC = root.NMC || {}).csv = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function detectDelimiter(text) {
    const sample = text.slice(0, 5000).split(/\r?\n/).slice(0, 5);
    const cands = [",", "\t", ";", "|"];
    let best = ",", bestScore = -1;
    for (const d of cands) {
      const counts = sample.map(l => countOutsideQuotes(l, d)).filter(n => n > 0);
      if (!counts.length) continue;
      const consistent = counts.every(n => n === counts[0]);
      const score = counts[0] * (consistent ? 2 : 1);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }
  function countOutsideQuotes(line, d) {
    let n = 0, q = false;
    for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') q = !q; else if (!q && ch === d) n++; }
    return n;
  }

  /* returns array of arrays of strings */
  function parseRows(text, delimiter) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const d = delimiter || detectDelimiter(text);
    const rows = []; let row = [], field = "", i = 0, q = false;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === "") { q = true; i++; continue; }
      if (ch === d) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ""));
  }

  /* first non-empty row is the header; duplicate / blank headers get suffixed so no column is lost */
  function parse(text, delimiter) {
    const rows = parseRows(text, delimiter);
    if (!rows.length) return { headers: [], records: [] };
    const seen = {};
    const headers = rows[0].map((h, i) => {
      let k = String(h || "").trim() || "Column " + (i + 1);
      if (seen[k]) { seen[k]++; k = k + " (" + seen[k] + ")"; } else seen[k] = 1;
      return k;
    });
    const records = rows.slice(1).map(r => { const o = {}; headers.forEach((h, i) => { o[h] = r[i] != null ? String(r[i]).trim() : ""; }); return o; });
    return { headers, records };
  }

  function cell(v) {
    if (v == null) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function stringify(headers, records) {
    const out = [headers.map(cell).join(",")];
    for (const r of records) out.push(headers.map(h => cell(r[h])).join(","));
    return out.join("\r\n") + "\r\n";
  }

  return { parse, parseRows, stringify, detectDelimiter };
});

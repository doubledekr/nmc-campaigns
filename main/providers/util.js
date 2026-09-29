/* shared helpers for the HTTP-based providers */
const addr = (email, name) => name ? `"${String(name).replace(/["\\]/g, "")}" <${email}>` : email;
async function http(url, init, timeoutMs) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs || 30000);
  try { const res = await fetch(url, Object.assign({}, init, { signal: ac.signal })); const body = await res.text(); return { status: res.status, headers: res.headers, body }; }
  finally { clearTimeout(t); }
}
function result(res, okStatuses, idFrom) {
  const ok = okStatuses ? okStatuses.includes(res.status) : res.status >= 200 && res.status < 300;
  if (ok) return { ok: true, status: res.status, id: idFrom ? idFrom(res) : undefined };
  let err = res.body; try { const j = JSON.parse(res.body); err = j.message || j.Message || (j.errors && j.errors.map(e => e.message || e).join("; ")) || res.body; } catch (e) {}
  return { ok: false, status: res.status, error: "HTTP " + res.status + ": " + String(err).slice(0, 300), retryable: res.status === 429 || res.status >= 500 };
}
function netError(e) { return { ok: false, error: e.name === "AbortError" ? "Timed out" : (e.message || String(e)), retryable: true }; }

module.exports = { addr, http, result, netError };

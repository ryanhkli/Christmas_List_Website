// Shared purchase storage for the wish list.
// One small JSON document, { purchased: { giftId: true }, ts: <ms> }, is kept in two free public stores
// (textdb.dev and restful-api.dev) so that losing one does not lose the list.
// The storage code in config.js is "dual:<textdb id>:<restful-api.dev object id>", or a Google Apps Script URL.
const WishStore = (() => {
  const TEXTDB = "https://textdb.dev/api/data/";
  const RESTFUL = "https://api.restful-api.dev/objects/";
  const ID_OK = /^[A-Za-z0-9-]{8,80}$/;
  const GIFT_OK = /^[a-z0-9-]{1,40}$/;

  function target(code) {
    code = (code || "").trim();
    if (/^https:\/\/script\.google\.com\//.test(code)) return { kind: "apps", url: code };
    const m = /^dual:([^:]+):([^:]+)$/.exec(code);
    if (m && ID_OK.test(m[1]) && ID_OK.test(m[2])) return { kind: "dual", a: TEXTDB + m[1], b: RESTFUL + m[2] };
    return null;
  }

  function clean(p) {
    const out = {};
    if (p && typeof p === "object") for (const k of Object.keys(p)) if (GIFT_OK.test(k) && p[k] === true) out[k] = true;
    return out;
  }
  function norm(d) {
    if (!d || typeof d !== "object") return null;
    return { purchased: clean(d.purchased), ts: typeof d.ts === "number" ? d.ts : 0 };
  }

  async function timed(url, opt) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
    try { return await fetch(url, { ...opt, signal: c.signal, cache: "no-store" }); } finally { clearTimeout(t); }
  }

  // textdb.dev: plain text in, plain text out. An id that was never written reads back empty.
  async function aRead(t) {
    const r = await timed(t.a, {});
    if (r.status === 404) return { purchased: {}, ts: 0 };
    if (!r.ok) throw new Error("read failed (HTTP " + r.status + ")");
    const txt = (await r.text()).trim();
    if (!txt) return { purchased: {}, ts: 0 };
    return norm(JSON.parse(txt)) || { purchased: {}, ts: 0 };
  }
  async function aWrite(t, doc) {
    const r = await timed(t.a, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(doc) });
    if (!r.ok) throw new Error("save failed (HTTP " + r.status + ")");
  }
  // restful-api.dev: a JSON object with our document under "data".
  async function bRead(t) {
    const r = await timed(t.b, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("read failed (HTTP " + r.status + ")");
    return norm((await r.json()).data) || { purchased: {}, ts: 0 };
  }
  async function bWrite(t, doc) {
    const r = await timed(t.b, {
      method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "ryan-christmas-list", data: doc }),
    });
    if (!r.ok) throw new Error("save failed (HTTP " + r.status + ")");
  }

  // deep = ask both stores and take the newer copy. Otherwise ask the first and fall back to the second.
  async function latest(t, deep) {
    if (!deep) {
      try { return await aRead(t); } catch (e) { return await bRead(t); }
    }
    const res = await Promise.allSettled([aRead(t), bRead(t)]);
    const good = res.filter(r => r.status === "fulfilled").map(r => r.value);
    if (!good.length) throw new Error("neither store answered");
    return good.sort((x, y) => y.ts - x.ts)[0];
  }

  async function appsCall(t, body) {
    const r = body
      ? await timed(t.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      : await timed(t.url + "?t=" + Date.now(), { redirect: "follow" });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "bad response");
    return clean(j.purchased);
  }

  async function read(code, deep) {
    const t = target(code);
    if (!t) throw new Error("storage code not recognised");
    if (t.kind === "apps") return appsCall(t);
    return (await latest(t, !!deep)).purchased;
  }

  async function set(code, giftId, want) {
    const t = target(code);
    if (!t) throw new Error("storage code not recognised");
    if (!GIFT_OK.test(giftId)) throw new Error("bad gift id");
    if (t.kind === "apps") return appsCall(t, { id: giftId, purchased: !!want });
    const cur = await latest(t, true);                 // re-read first so two people don't overwrite each other
    const p = cur.purchased;
    if (want) p[giftId] = true; else delete p[giftId];
    const doc = { purchased: p, ts: Math.max(Date.now(), cur.ts + 1) };
    const res = await Promise.allSettled([aWrite(t, doc), bWrite(t, doc)]);
    if (res.every(r => r.status === "rejected")) throw new Error("neither store saved it");
    return p;
  }

  // Saves and removes a test value, reporting what each store did.
  async function selfTest(code) {
    const t = target(code);
    if (!t) throw new Error("storage code not recognised");
    await set(code, "selftest", true);
    const log = [];
    if (t.kind === "dual") {
      for (const [name, fn] of [["textdb", aRead], ["restful-api", bRead]]) {
        try { log.push(name + ": " + ((await fn(t)).purchased.selftest ? "saved and read back" : "DID NOT read back")); }
        catch (e) { log.push(name + ": FAILED " + (e && e.message || e)); }
      }
    } else {
      log.push("apps script: " + ((await read(code)).selftest ? "saved and read back" : "DID NOT read back"));
    }
    const after = await set(code, "selftest", false);
    log.push(after.selftest ? "undo: FAILED" : "undo: ok");
    log.push("gifts currently marked: " + Object.keys(await read(code, true)).length);
    return log;
  }

  return { read, set, selfTest, valid: code => !!target(code) };
})();

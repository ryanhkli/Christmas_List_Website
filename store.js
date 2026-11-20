// Shared purchase storage for the wish list. One small JSON document holds { purchased: { giftId: true } }.
// The storage code in config.js looks like "jsonblob:<id>", "extendsclass:<id>", or a Google Apps Script URL.
const WishStore = (() => {
  const JSONBLOB = "https://jsonblob.com/api/jsonBlob";
  const EXTENDS = "https://json.extendsclass.com/bin";
  const ID_OK = /^[A-Za-z0-9-]{4,80}$/;
  const GIFT_OK = /^[a-z0-9-]{1,40}$/;

  function target(code) {
    code = (code || "").trim();
    if (/^https:\/\/script\.google\.com\//.test(code)) return { kind: "apps", url: code };
    const i = code.indexOf(":");
    const kind = code.slice(0, i), id = code.slice(i + 1);
    if (!ID_OK.test(id)) return null;
    if (kind === "jsonblob") return { kind, url: JSONBLOB + "/" + id };
    if (kind === "extendsclass") return { kind, url: EXTENDS + "/" + id };
    return null;
  }

  function clean(p) {
    const out = {};
    if (p && typeof p === "object") for (const k of Object.keys(p)) if (GIFT_OK.test(k) && p[k] === true) out[k] = true;
    return out;
  }

  async function getDoc(url) {
    const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error("read failed (HTTP " + r.status + ")");
    return r.json();
  }

  async function putDoc(url, doc) {
    const r = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(doc),
    });
    if (!r.ok) throw new Error("save failed (HTTP " + r.status + ")");
  }

  async function read(code) {
    const t = target(code);
    if (!t) throw new Error("storage code not recognised");
    if (t.kind === "apps") {
      const r = await fetch(t.url + "?t=" + Date.now(), { redirect: "follow" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "bad response");
      return clean(j.purchased);
    }
    return clean((await getDoc(t.url)).purchased);
  }

  async function set(code, giftId, want) {
    const t = target(code);
    if (!t) throw new Error("storage code not recognised");
    if (!GIFT_OK.test(giftId)) throw new Error("bad gift id");
    if (t.kind === "apps") {
      const r = await fetch(t.url, {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ id: giftId, purchased: !!want }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "bad response");
      return clean(j.purchased);
    }
    const p = clean((await getDoc(t.url)).purchased);     // re-read first so two people don't overwrite each other
    if (want) p[giftId] = true; else delete p[giftId];
    await putDoc(t.url, { purchased: p, updated: new Date().toISOString() });
    return p;
  }

  async function selfTest(code) {
    await set(code, "selftest", true);
    if (!(await read(code)).selftest) throw new Error("a saved value did not read back");
    await set(code, "selftest", false);
    if ((await read(code)).selftest) throw new Error("an undo did not read back");
  }

  // Creates a new empty store, trying each provider in turn. Returns { code, log }.
  async function create() {
    const log = [];
    const empty = JSON.stringify({ purchased: {}, updated: new Date().toISOString() });
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    try {
      const r = await fetch(JSONBLOB, { method: "POST", headers, body: empty });
      if (!r.ok) throw new Error("create failed (HTTP " + r.status + ")");
      const loc = r.headers.get("Location") || r.headers.get("x-jsonblob") || "";
      const id = loc.split("/").pop();
      if (!ID_OK.test(id)) throw new Error("no id came back");
      const code = "jsonblob:" + id;
      await selfTest(code);
      return { code, log };
    } catch (e) { log.push("jsonblob: " + (e && e.message || e)); }
    try {
      const r = await fetch(EXTENDS, { method: "POST", headers, body: empty });
      if (!r.ok) throw new Error("create failed (HTTP " + r.status + ")");
      const j = await r.json();
      const id = String(j.id || (j.uri || "").split("/").pop() || "");
      if (!ID_OK.test(id)) throw new Error("no id came back");
      const code = "extendsclass:" + id;
      await selfTest(code);
      return { code, log };
    } catch (e) { log.push("extendsclass: " + (e && e.message || e)); }
    return { code: null, log };
  }

  return { read, set, create, valid: code => !!target(code) };
})();

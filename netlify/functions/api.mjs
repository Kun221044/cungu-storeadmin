// Cungu Sport Store Manager - API (Netlify Functions v2 + Netlify Blobs)
// Admin routes need a session cookie (login with a name + password from ADMIN_USERS).
// Public routes: GET /api/feed/{sa|ke}.json|.csv and GET /api/img/{id} - these are what the two stores read.
// Store routes: POST /api/stores/{sa|ke}/movements with header X-Store-Key - the stores report sales back.
//               POST /api/stores/{sa|ke}/quotes (public) - quote requests from the storefront ("My list"); accepted in the admin.
import { getStore } from "@netlify/blobs";
import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import SEED from "../../data/seed.mjs";

export const config = { path: "/api/*" };

const STORES = {
  sa: { name: "Cungu Sport Store - South Africa", url: "https://sastore.cungusportracing.com/", currency: "ZAR" },
  ke: { name: "Cungu Sport Store - Kenya", url: "https://kestore.cungusportracing.com/", currency: "KES" },
};
const TYPES = ["receive", "sale", "return", "count", "damage", "transfer"];
const DEF_SETTINGS = { fxZarKes: 7.84, fxDate: "2026-10-26", vatSa: 0.15, vatKe: 0.16, keUplift: 0.25, kesRound: 50, importMarkup: 1.33, localMarkup: 1.15, deliveryMonths: [0, 3, 6, 9], leadDays: 45 };
const SESSION_DAYS = 30;

const data = () => getStore({ name: "storeadmin", consistency: "strong" });
const images = () => getStore({ name: "storeadmin-images", consistency: "strong" });

/* ---------------- helpers ---------------- */
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const fail = (status, message) => json({ error: message }, status);
const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
const int = (v) => Math.round(num(v));
const env = (k) => (typeof Netlify !== "undefined" && Netlify.env ? Netlify.env.get(k) : process.env[k]) || "";
const nowIso = () => new Date().toISOString();

function users() {
  // ADMIN_USERS="Cungu:long-password;Enos:another-password"  (or ADMIN_PASSWORD for a single "Admin" login)
  const out = {};
  env("ADMIN_USERS").split(";").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const i = pair.indexOf(":"); if (i > 0) out[pair.slice(0, i).trim().toLowerCase()] = { name: pair.slice(0, i).trim(), password: pair.slice(i + 1) };
  });
  if (!Object.keys(out).length && env("ADMIN_PASSWORD")) out.admin = { name: "Admin", password: env("ADMIN_PASSWORD") };
  return out;
}
const secret = () => env("SESSION_SECRET");
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
function makeSession(name) {
  const payload = Buffer.from(JSON.stringify({ n: name, e: Date.now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function readSession(req) {
  if (!secret()) return null;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)sa_session=([^;]+)/);
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig || !safeEq(sign(payload), sig)) return null;
  try { const s = JSON.parse(Buffer.from(payload, "base64url").toString()); return s.e > Date.now() ? { name: s.n } : null; } catch { return null; }
}
const cookie = (value, maxAge) => `sa_session=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/* ---------------- storage ---------------- */
async function ensureSeed() {
  const s = data();
  const meta = await s.getMetadata("catalog");
  if (!meta) {
    await s.setJSON("catalog", { products: SEED.products || {}, updatedAt: nowIso() }, { onlyIfNew: true });
    await s.setJSON("settings", { ...DEF_SETTINGS, ...(SEED.settings || {}) }, { onlyIfNew: true });
  }
}
async function readCatalog() {
  await ensureSeed();
  const r = await data().getWithMetadata("catalog", { type: "json" });
  return { cat: r?.data || { products: {} }, etag: r?.etag || "" };
}
async function mutateCatalog(fn) {
  await ensureSeed();
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await data().getWithMetadata("catalog", { type: "json" });
    const cat = r?.data || { products: {} };
    const result = await fn(cat); // may throw {status,message}
    cat.updatedAt = nowIso();
    const w = await data().setJSON("catalog", cat, r ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
    if (w.modified) return { result, etag: w.etag };
    await new Promise((res) => setTimeout(res, 60 + Math.random() * 120));
  }
  throw { status: 409, message: "Someone else saved at the same moment - try again." };
}
async function readSettings() { await ensureSeed(); return { ...DEF_SETTINGS, ...((await data().get("settings", { type: "json" })) || {}) }; }
async function appendMovements(recs) {
  if (!recs.length) return;
  const key = `movements/${recs[0].at.slice(0, 7)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await data().getWithMetadata(key, { type: "json" });
    const arr = r?.data || [];
    arr.push(...recs);
    const w = await data().setJSON(key, arr, r ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
    if (w.modified) return;
    await new Promise((res) => setTimeout(res, 60 + Math.random() * 120));
  }
  throw { status: 409, message: "Movement log busy - try again." };
}
async function readMovements(limit = 300) {
  const { blobs } = await data().list({ prefix: "movements/" });
  const keys = blobs.map((b) => b.key).sort().reverse();
  const out = [];
  for (const k of keys) { const arr = (await data().get(k, { type: "json" })) || []; out.push(...arr.slice().reverse()); if (out.length >= limit) break; }
  return out.slice(0, limit);
}
async function versionTag() {
  const [c, s, q] = await Promise.all([data().getMetadata("catalog"), data().getMetadata("settings"), data().getMetadata("quotes-index")]);
  const { blobs } = await data().list({ prefix: "movements/" });
  const last = blobs.map((b) => b.key).sort().pop();
  const m = last ? await data().getMetadata(last) : null;
  return [c?.etag, s?.etag, m?.etag, q?.etag].join("|");
}

/* ---------------- quotes (storefront "My list" requests) ---------------- */
// Each quote is its own blob quotes/<id>; "quotes-index" is a small list (newest first) used for listing and change detection.
async function updateQuoteIndex(entry) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await data().getWithMetadata("quotes-index", { type: "json" });
    const arr = (r?.data || []).filter((x) => x.id !== entry.id);
    arr.unshift(entry);
    const w = await data().setJSON("quotes-index", arr.slice(0, 2000), r ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
    if (w.modified) return;
    await new Promise((res) => setTimeout(res, 60 + Math.random() * 120));
  }
  throw { status: 409, message: "Quote list busy - try again." };
}
const quoteSummary = (q) => ({ id: q.id, number: q.number, store: q.store, status: q.status, at: q.at, name: q.customer.name, total: q.total, lines: q.lines.length });
async function rateLimited(req, bucket, max) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const key = `ratelimit/${bucket}/${createHash("sha256").update(ip + secret()).digest("hex").slice(0, 24)}/${new Date().toISOString().slice(0, 13)}`;
  const n = int(await data().get(key)) + 1;
  await data().set(key, String(n));
  return n > max;
}
async function notifyQuote(q) {
  // Optional e-mail via Resend (https://resend.com): set RESEND_API_KEY, QUOTE_EMAIL_FROM and QUOTE_EMAIL_TO (or QUOTE_EMAIL_TO_SA / QUOTE_EMAIL_TO_KE per store).
  const key = env("RESEND_API_KEY"), to = env(q.store === "ke" ? "QUOTE_EMAIL_TO_KE" : "QUOTE_EMAIL_TO_SA") || env("QUOTE_EMAIL_TO"), from = env("QUOTE_EMAIL_FROM");
  if (!key || !to || !from) return;
  const cur = STORES[q.store].currency, money = (v) => (cur === "KES" ? "KES " : "R") + Math.round(v).toLocaleString("en-ZA");
  const text = [`New quote request ${q.number} from the ${STORES[q.store].name}`, "",
    `Name: ${q.customer.name}`, `Email: ${q.customer.email}`, `Phone: ${q.customer.phone}`, q.customer.company ? `Team/company: ${q.customer.company}` : "", q.customer.message ? `Message: ${q.customer.message}` : "", "",
    ...q.lines.map((l) => `${l.qty} x ${l.sku} ${l.name}${l.option ? " (" + l.option + ")" : ""} @ ${money(l.price)} = ${money(l.qty * l.price)}  [stock ${l.stockAtRequest}]`), "",
    `Estimated total: ${money(q.total)} incl. VAT`, "", "Open the Store Manager to accept it: https://storeadmin.cungusportracing.com/#quotes"].filter((x) => x !== "").join("\n");
  try {
    await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: to.split(",").map((x) => x.trim()), reply_to: q.customer.email || undefined, subject: `Quote request ${q.number} - ${q.customer.name}`, text }) });
  } catch (e) { console.error("quote e-mail failed", e); }
}

/* ---------------- business rules ---------------- */
const st = (p, l) => int(p.stock && p.stock[l]);
function kesPrice(p, S) {
  if (p.priceKes != null && p.priceKes !== "") return num(p.priceKes);
  const k = (num(p.retailZar) / (1 + S.vatSa)) * (1 + S.keUplift) * S.fxZarKes * (1 + S.vatKe);
  const r = Math.max(1, num(S.kesRound, 1));
  return Math.ceil(k / r) * r;
}
function cleanProduct(input, existing) {
  const p = { ...(existing || {}), ...input };
  p.sku = String(p.sku || "").trim().toUpperCase();
  p.name = String(p.name || "").trim();
  if (!p.sku || !/^[A-Z0-9][A-Z0-9-]{1,30}$/.test(p.sku)) throw { status: 400, message: "SKU must be letters, numbers and dashes." };
  if (!p.name) throw { status: 400, message: "Product name is required." };
  p.status = ["active", "draft", "archived"].includes(p.status) ? p.status : "draft";
  p.sourcing = p.sourcing === "local" ? "local" : "import";
  p.cost = Math.max(0, num(p.cost)); p.retailZar = Math.max(0, num(p.retailZar));
  p.priceKes = p.priceKes === "" || p.priceKes == null ? null : Math.max(0, num(p.priceKes));
  p.stores = { sa: !!(p.stores && p.stores.sa), ke: !!(p.stores && p.stores.ke) };
  p.safety = Math.max(0, int(p.safety));
  p.demand = Array.from({ length: 12 }, (_, i) => Math.max(0, int((p.demand || [])[i])));
  p.images = (Array.isArray(p.images) ? p.images : []).filter((x) => x && x.url).slice(0, 12)
    .map((x) => ({ url: String(x.url), id: x.id ? String(x.id) : undefined, type: x.type || "", external: !!x.external, name: x.name || "" }));
  p.stock = existing ? { sa: st(existing, "sa"), ke: st(existing, "ke") } : { sa: Math.max(0, int(input.stock?.sa)), ke: Math.max(0, int(input.stock?.ke)) }; // stock changes only via movements
  for (const k of ["category", "supplier", "unit", "description", "options", "priceNote"]) p[k] = String(p[k] || "").slice(0, 4000);
  delete p.imageUrl;
  return p;
}
function applyMovement(cat, m, by) {
  const sku = String(m.sku || "").trim().toUpperCase(), p = cat.products[sku.toLowerCase()];
  if (!p) throw { status: 400, message: `Unknown SKU ${sku}` };
  const type = String(m.type || "").toLowerCase(), loc = String(m.loc || m.store || "").toLowerCase().slice(0, 2), qty = int(m.qty);
  if (!TYPES.includes(type)) throw { status: 400, message: `Unknown movement type "${type}"` };
  if (!STORES[loc]) throw { status: 400, message: "Store must be sa or ke" };
  if (qty < 0 || (qty === 0 && type !== "count")) throw { status: 400, message: `${sku}: quantity missing` };
  const stock = { sa: st(p, "sa"), ke: st(p, "ke") }, to = loc === "sa" ? "ke" : "sa";
  let delta = 0;
  if (type === "receive" || type === "return") delta = qty;
  else if (type === "sale" || type === "damage" || type === "transfer") delta = -qty;
  else if (type === "count") delta = qty - stock[loc];
  if (stock[loc] + delta < 0) throw { status: 400, message: `${sku}: only ${stock[loc]} on hand in ${loc === "sa" ? "South Africa" : "Kenya"}` };
  stock[loc] += delta; if (type === "transfer") stock[to] += qty;
  p.stock = stock; p.updatedAt = nowIso();
  return { sku: p.sku, name: p.name, type, loc, qty: delta, to: type === "transfer" ? to : null, after: stock[loc], ref: String(m.ref || "").slice(0, 120), note: String(m.note || "").slice(0, 300), at: nowIso(), by: by || "" };
}
function buildFeed(cat, S, store, origin) {
  const info = STORES[store], vat = store === "sa" ? S.vatSa : S.vatKe;
  const abs = (u) => (/^https?:\/\//i.test(u) ? u : origin + u);
  const products = Object.values(cat.products)
    .filter((p) => p.status === "active" && p.stores && p.stores[store])
    .sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name))
    .map((p) => {
      const price = store === "sa" ? Math.round(num(p.retailZar) * 100) / 100 : kesPrice(p, S);
      const s = Math.max(0, st(p, store)), saf = int(p.safety);
      const imgs = (p.images || []).map((x) => abs(x.url));
      return {
        sku: p.sku, name: p.name, category: p.category || "", description: p.description || "", imageUrl: imgs[0] || "", images: imgs,
        options: p.options || "", unit: p.unit || "each", price, priceExVat: Math.round((price / (1 + vat)) * 100) / 100, vatRate: vat, stock: s,
        availability: s <= 0 ? "on_order" : saf && s < saf ? "low_stock" : "in_stock", leadTimeDays: s > 0 ? 0 : p.sourcing === "import" ? int(S.leadDays) : 7, updatedAt: p.updatedAt || "",
      };
    });
  return { store, storeName: info.name, url: info.url, currency: info.currency, generatedAt: nowIso(), products };
}
const FCOLS = ["sku", "name", "category", "description", "imageUrl", "images", "options", "unit", "price", "priceExVat", "vatRate", "stock", "availability", "leadTimeDays", "updatedAt"];
const csvCell = (v) => { const s = Array.isArray(v) ? v.join(" ") : String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const PUBLIC_CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" };
const storeCors = (req) => {
  const o = req.headers.get("origin") || "";
  const ok = Object.values(STORES).some((s) => s.url.startsWith(o)) || /^http:\/\/localhost(:\d+)?$/.test(o);
  return { "access-control-allow-origin": ok ? o : STORES.sa.url.slice(0, -1), "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, x-store-key", "access-control-max-age": "86400", vary: "origin" };
};

/* ---------------- router ---------------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method.toUpperCase();
  const seg = path.split("/").slice(2); // after /api
  try {
    /* ---- public: store feeds & images ---- */
    if (seg[0] === "feed") {
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
      const m = (seg[1] || "").match(/^(sa|ke)\.(json|csv)$/);
      if (!m || method !== "GET") return fail(404, "Use /api/feed/sa.json, /api/feed/ke.json, /api/feed/sa.csv or /api/feed/ke.csv");
      const [{ cat }, S] = await Promise.all([readCatalog(), readSettings()]);
      const feed = buildFeed(cat, S, m[1], url.origin);
      const cache = { "cache-control": "public, max-age=60, s-maxage=60", ...PUBLIC_CORS };
      if (m[2] === "json") return json(feed, 200, cache);
      const csv = [FCOLS.join(","), ...feed.products.map((p) => FCOLS.map((k) => csvCell(p[k])).join(","))].join("\n");
      return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", ...cache } });
    }
    if (seg[0] === "img" && seg[1]) {
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
      const r = await images().getWithMetadata(seg[1], { type: "arrayBuffer" });
      if (!r) return new Response("Not found", { status: 404 });
      return new Response(r.data, { headers: { "content-type": r.metadata?.contentType || "image/jpeg", "cache-control": "public, max-age=31536000, immutable", ...PUBLIC_CORS } });
    }

    /* ---- stores report sales back ---- */
    if (seg[0] === "stores" && STORES[seg[1]] && seg[2] === "movements") {
      const cors = storeCors(req);
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (method !== "POST") return fail(405, "POST only");
      const key = env(seg[1] === "sa" ? "STORE_KEY_SA" : "STORE_KEY_KE");
      if (!key || !safeEq(req.headers.get("x-store-key") || "", key)) return json({ error: "Store key missing or wrong" }, 401, cors);
      const body = await req.json().catch(() => ({}));
      const lines = Array.isArray(body.lines) ? body.lines.slice(0, 200) : [];
      if (!lines.length) return json({ error: "Send {lines:[{sku, qty, type?, ref?}]}" }, 400, cors);
      const { result } = await mutateCatalog((cat) => lines.map((l) => {
        const type = ["sale", "return"].includes(String(l.type || "sale").toLowerCase()) ? String(l.type || "sale").toLowerCase() : null;
        if (!type) throw { status: 400, message: "Stores may only send sale or return lines" };
        return applyMovement(cat, { ...l, type, loc: seg[1] }, `${seg[1].toUpperCase()} store`);
      }));
      await appendMovements(result);
      return json({ ok: true, applied: result.length, stock: result.map((m) => ({ sku: m.sku, stock: m.after })) }, 200, cors);
    }

    /* ---- storefront quote requests (public) ---- */
    if (seg[0] === "stores" && STORES[seg[1]] && seg[2] === "quotes") {
      // Public form endpoint (no cookies or keys), so any origin may post - this also covers the stores' *.netlify.app addresses.
      const cors = { ...storeCors(req), "access-control-allow-origin": req.headers.get("origin") || "*" }, store = seg[1];
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (method !== "POST") return fail(405, "POST only");
      const body = await req.json().catch(() => ({}));
      if (body.website) return json({ ok: true, number: "Q-0" }, 200, cors); // honeypot field filled = bot
      const t = (v, n) => String(v || "").trim().slice(0, n);
      const customer = { name: t(body.name, 120), email: t(body.email, 160), phone: t(body.phone, 40), company: t(body.company, 120), message: t(body.message, 2000) };
      if (!customer.name) return json({ error: "Please give your name." }, 400, cors);
      if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return json({ error: "That e-mail address does not look right." }, 400, cors);
      if (!customer.email && !customer.phone) return json({ error: "Please give an e-mail address or phone number so we can reply." }, 400, cors);
      const raw = Array.isArray(body.lines) ? body.lines.slice(0, 60) : [];
      if (!raw.length) return json({ error: "Your list is empty." }, 400, cors);
      if (await rateLimited(req, "quote", 12)) return json({ error: "Too many requests from this connection - please try again in an hour or contact us directly." }, 429, cors);
      const [{ cat }, S] = await Promise.all([readCatalog(), readSettings()]);
      const feed = buildFeed(cat, S, store, url.origin), bySku = Object.fromEntries(feed.products.map((p) => [p.sku, p]));
      const lines = [];
      for (const l of raw) {
        const p = bySku[String(l.sku || "").trim().toUpperCase()];
        if (!p) continue; // product removed from the store since it was added to the list
        const qty = Math.min(999, Math.max(1, int(l.qty)));
        lines.push({ sku: p.sku, name: p.name, option: t(l.option, 80), qty, price: p.price, stockAtRequest: p.stock });
      }
      if (!lines.length) return json({ error: "The items in your list are no longer available. Please refresh the page." }, 400, cors);
      const at = nowIso(), id = at.replace(/\D/g, "").slice(2, 14) + "-" + randomUUID().slice(0, 6);
      const number = `Q-${store.toUpperCase()}-${at.slice(2, 4)}${at.slice(5, 7)}${at.slice(8, 10)}-${id.slice(-4).toUpperCase()}`;
      const q = { id, number, store, currency: feed.currency, status: "new", at, customer, lines, total: Math.round(lines.reduce((a, l) => a + l.qty * l.price, 0) * 100) / 100, page: t(body.page, 300), history: [{ at, by: "customer", action: "requested" }] };
      await data().setJSON(`quotes/${id}`, q);
      await updateQuoteIndex(quoteSummary(q));
      await notifyQuote(q);
      return json({ ok: true, number, total: q.total, currency: q.currency, lines: lines.length, dropped: raw.length - lines.length }, 200, cors);
    }

    /* ---- login ---- */
    if (path === "/api/login" && method === "POST") {
      if (!secret() || secret().length < 24) return fail(500, "SESSION_SECRET is not set (needs 24+ characters) - see README.");
      const body = await req.json().catch(() => ({}));
      const U = users(), name = String(body.name || "").trim().toLowerCase(), pw = String(body.password || "");
      const u = U[name] || (Object.keys(U).length === 1 && !name ? Object.values(U)[0] : null);
      if (!u || !safeEq(pw, u.password)) { await new Promise((r) => setTimeout(r, 700)); return fail(401, "Name or password not recognised."); }
      return json({ name: u.name }, 200, { "set-cookie": cookie(makeSession(u.name), SESSION_DAYS * 86400) });
    }
    if (path === "/api/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });

    /* ---- everything below needs a session ---- */
    const me = readSession(req);
    if (!me) return fail(401, "Please sign in.");
    if (method !== "GET" && req.headers.get("x-requested-with") !== "storeadmin") return fail(403, "Missing request header.");

    if (path === "/api/me") return json({ name: me.name, users: Object.values(users()).length });
    if (path === "/api/version") return json({ v: await versionTag() });
    if (path === "/api/bootstrap") {
      const [{ cat }, S, mv, v] = await Promise.all([readCatalog(), readSettings(), readMovements(300), versionTag()]);
      return json({ me: me.name, products: Object.values(cat.products), settings: S, movements: mv, v });
    }
    if (seg[0] === "products" && seg[1]) {
      const id = decodeURIComponent(seg[1]).toLowerCase();
      if (method === "PUT") {
        const body = await req.json();
        const { result } = await mutateCatalog((cat) => {
          const ex = cat.products[id];
          if (body.isNew && ex) throw { status: 409, message: `SKU ${id.toUpperCase()} is already used.` };
          const p = cleanProduct({ ...body.product, sku: id }, ex);
          p.updatedAt = nowIso(); p.updatedBy = me.name; if (!ex) p.createdAt = nowIso();
          cat.products[id] = p; return p;
        });
        return json({ product: result });
      }
      if (method === "DELETE") {
        const { result } = await mutateCatalog((cat) => {
          const ex = cat.products[id]; if (!ex) throw { status: 404, message: "Not found" };
          if (ex.status !== "draft") throw { status: 400, message: "Only draft products can be deleted - archive it instead." };
          delete cat.products[id]; return ex;
        });
        return json({ deleted: result.sku });
      }
    }
    if (path === "/api/movements") {
      if (method === "GET") return json({ movements: await readMovements(Math.min(2000, int(url.searchParams.get("limit") || 300))) });
      if (method === "POST") {
        const body = await req.json();
        const lines = Array.isArray(body.lines) ? body.lines.slice(0, 500) : [body];
        const { result } = await mutateCatalog((cat) => lines.map((l) => applyMovement(cat, l, me.name)));
        await appendMovements(result);
        const { cat } = await readCatalog();
        return json({ movements: result, products: [...new Set(result.map((m) => m.sku.toLowerCase()))].map((k) => cat.products[k]) });
      }
    }
    if (path === "/api/quotes" && method === "GET") {
      const idx = (await data().get("quotes-index", { type: "json" })) || [];
      const want = url.searchParams.get("status");
      const pick = idx.filter((x) => !want || x.status === want).slice(0, Math.min(500, int(url.searchParams.get("limit") || 200)));
      const full = await Promise.all(pick.map((x) => data().get(`quotes/${x.id}`, { type: "json" })));
      return json({ quotes: full.filter(Boolean), counts: idx.reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {}) });
    }
    if (seg[0] === "quotes" && seg[1] && method === "PUT") {
      const id = seg[1].replace(/[^0-9a-z-]/gi, "");
      const r = await data().getWithMetadata(`quotes/${id}`, { type: "json" });
      if (!r) return fail(404, "Quote not found");
      const q = r.data, b = await req.json().catch(() => ({}));
      const action = String(b.action || "");
      if (Array.isArray(b.lines) && q.status === "new") { // edit quantities before accepting
        q.lines = q.lines.map((l) => { const n = b.lines.find((x) => String(x.sku).toUpperCase() === l.sku); return n ? { ...l, qty: Math.max(0, int(n.qty)) } : l; }).filter((l) => l.qty > 0);
        q.total = Math.round(q.lines.reduce((a, l) => a + l.qty * l.price, 0) * 100) / 100;
      }
      if (typeof b.note === "string") q.note = b.note.slice(0, 2000);
      let movements = [];
      if (action === "accept") {
        if (q.status === "accepted") return fail(400, "This quote was already accepted - stock has been taken off.");
        if (!q.lines.length) return fail(400, "No lines left on this quote.");
        const { result } = await mutateCatalog((cat) => q.lines.map((l) => applyMovement(cat, { sku: l.sku, qty: l.qty, type: "sale", loc: q.store, ref: q.number, note: `Quote accepted - ${q.customer.name}` }, me.name)));
        await appendMovements(result); movements = result;
        q.status = "accepted";
      } else if (action === "decline") {
        if (q.status === "accepted") return fail(400, "Accepted quotes cannot be declined - record a return under Stock instead.");
        q.status = "declined";
      } else if (action === "reopen") {
        if (q.status === "accepted") return fail(400, "Accepted quotes cannot be reopened - record a return under Stock instead.");
        q.status = "new";
      } else if (action && action !== "save") return fail(400, "Unknown action");
      q.history = [...(q.history || []), { at: nowIso(), by: me.name, action: action || "save" }];
      const w = await data().setJSON(`quotes/${id}`, q, { onlyIfMatch: r.etag });
      if (!w.modified) return fail(409, "Someone else changed this quote at the same moment - reload and try again.");
      await updateQuoteIndex(quoteSummary(q));
      const { cat } = movements.length ? await readCatalog() : { cat: null };
      return json({ quote: q, movements, products: cat ? [...new Set(movements.map((m) => m.sku.toLowerCase()))].map((k) => cat.products[k]) : [] });
    }
    if (path === "/api/settings" && method === "PUT") {
      const b = await req.json(); const S = await readSettings();
      const next = { ...S };
      for (const k of ["fxZarKes", "vatSa", "vatKe", "keUplift", "kesRound", "importMarkup", "localMarkup", "leadDays"]) if (b[k] != null) next[k] = Math.max(0, num(b[k], S[k]));
      if (typeof b.fxDate === "string") next.fxDate = b.fxDate.slice(0, 10);
      if (Array.isArray(b.deliveryMonths)) next.deliveryMonths = [...new Set(b.deliveryMonths.map(int).filter((m) => m >= 0 && m < 12))].sort((a, c) => a - c);
      next.kesRound = Math.max(1, next.kesRound); next.updatedAt = nowIso(); next.updatedBy = me.name;
      await data().setJSON("settings", next);
      return json({ settings: next });
    }
    if (path === "/api/images/import" && method === "POST") {
      // Copy a photo from another site (e.g. a supplier's product photo) into the Store Manager's own storage.
      const body = await req.json().catch(() => ({}));
      const src = String(body.url || "").trim();
      let u; try { u = new URL(src); } catch { return fail(400, "That is not a web address."); }
      if (u.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return fail(400, "Use a public https:// photo address.");
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; CunguStoreManager/1.0; +https://storeadmin.cungusportracing.com)", accept: "image/webp,image/jpeg,image/png,image/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!r || !r.ok) return fail(502, `The photo could not be downloaded (${r ? "the site answered " + r.status : "no answer"}).`);
      const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return fail(415, `That address is not a JPG, PNG or WebP photo (${type || "unknown type"}).`);
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 5 * 1024 * 1024) return fail(413, "Photo larger than 5 MB.");
      const id = randomUUID().replace(/-/g, "");
      await images().set(id, buf, { metadata: { contentType: type, size: buf.byteLength, name: u.pathname.split("/").pop().slice(0, 120), source: src.slice(0, 500), by: me.name, at: nowIso() } });
      return json({ id, url: `/api/img/${id}`, contentType: type, sizeBytes: buf.byteLength, source: src });
    }
    if (path === "/api/images" && method === "POST") {
      const type = (req.headers.get("content-type") || "").split(";")[0];
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return fail(415, "Use JPG, PNG or WebP images.");
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 5 * 1024 * 1024) return fail(413, "Image too large (5 MB limit after resizing).");
      const id = randomUUID().replace(/-/g, "");
      await images().set(id, buf, { metadata: { contentType: type, size: buf.byteLength, name: (req.headers.get("x-file-name") || "").slice(0, 120), by: me.name, at: nowIso() } });
      return json({ id, url: `/api/img/${id}`, contentType: type, sizeBytes: buf.byteLength });
    }
    if (seg[0] === "images" && seg[1] && method === "DELETE") { await images().delete(seg[1]); return json({ deleted: true }); }
    if (path === "/api/backup" && method === "GET") {
      const [{ cat }, S, mv] = await Promise.all([readCatalog(), readSettings(), readMovements(100000)]);
      const idx = (await data().get("quotes-index", { type: "json" })) || [];
      const quotes = (await Promise.all(idx.map((x) => data().get(`quotes/${x.id}`, { type: "json" })))).filter(Boolean);
      return json({ exportedAt: nowIso(), products: cat.products, settings: S, movements: mv, quotes }, 200, { "content-disposition": `attachment; filename="storeadmin-backup-${nowIso().slice(0, 10)}.json"` });
    }
    if (path === "/api/restore" && method === "POST") {
      const b = await req.json();
      if (!b || typeof b.products !== "object") return fail(400, "That is not a Store Manager backup file.");
      await mutateCatalog((cat) => { cat.products = {}; for (const [k, p] of Object.entries(b.products)) { const c = cleanProduct(p, null); c.stock = { sa: Math.max(0, int(p.stock?.sa)), ke: Math.max(0, int(p.stock?.ke)) }; cat.products[k.toLowerCase()] = c; } });
      if (b.settings) await data().setJSON("settings", { ...DEF_SETTINGS, ...b.settings });
      return json({ ok: true, products: Object.keys(b.products).length });
    }
    return fail(404, "Not found");
  } catch (e) {
    if (e && e.status) return fail(e.status, e.message);
    console.error(e);
    return fail(500, "Server error - " + (e && e.message ? e.message : "unknown"));
  }
};

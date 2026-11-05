/*
  Cungu Sport storefront - live catalogue, "My list" and quote requests, all from the Store Manager.

  Add to sastore / kestore (one line, anywhere in the page):
    <script src="https://storeadmin.cungusportracing.com/shop.js" data-store="sa" defer></script>      (data-store="ke" on kestore)

  Optional:
    <div id="cungu-shop"></div>          where the shop should appear (otherwise it goes into <main>, or the end of <body>)
    data-replace="#products, #my-list"   CSS selectors of the store's old product/list sections to hide
    data-email="info@cungusportracing.com" data-whatsapp="27830000000"   contact shown after a quote is sent
    data-title="Parts & equipment"       heading above the shop (data-title="" for none)

  Products, prices (incl. VAT, store currency), stock and photos refresh from
  https://storeadmin.cungusportracing.com/api/feed/{sa|ke}.json. Quote requests go to the Store Manager
  (Quotes page); stock comes off when the team accepts the quote there.
*/
(function () {
  "use strict";
  var me = document.currentScript;
  var ds = (me && me.dataset) || {};
  var API = me && me.src ? new URL(me.src, location.href).origin : "https://storeadmin.cungusportracing.com";
  var STORE = (ds.store || (/^ke|kenya|\/ke(\/|$)/i.test(location.hostname + " " + location.pathname) ? "ke" : "sa")).toLowerCase() === "ke" ? "ke" : "sa";
  var CONTACT = {
    sa: { email: "info@cungusportracing.com", whatsapp: "27830000000" },
    ke: { email: "kenya@cungusportracing.com", whatsapp: "254700000000" },
  }[STORE];
  if (ds.email != null) CONTACT.email = ds.email;
  if (ds.whatsapp != null) CONTACT.whatsapp = ds.whatsapp.replace(/\D/g, "");
  var FEED_KEY = "cungu-feed-" + STORE, LIST_KEY = "cungu-list-" + STORE, FORM_KEY = "cungu-quote-form";

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  var state = { feed: null, cat: "", q: "", sort: "name", list: lsGet(LIST_KEY, []), error: "" };
  function money(v) {
    var n = Math.round(v || 0).toLocaleString("en-ZA").replace(/[\s, ]/g, " ");
    return (state.feed && state.feed.currency === "KES") || STORE === "ke" ? "KES " + n : "R" + n;
  }
  function avail(p) {
    if (p.availability === "in_stock") return { cls: "in", txt: "In stock" };
    if (p.availability === "low_stock") return { cls: "low", txt: "Only " + p.stock + " left" };
    var w = Math.max(1, Math.round((p.leadTimeDays || 7) / 7));
    return { cls: "out", txt: "On order · about " + w + " week" + (w === 1 ? "" : "s") };
  }
  function bySku(sku) { return state.feed && state.feed.products.filter(function (p) { return p.sku === sku; })[0]; }
  function opts(p) { return String(p.options || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean); }
  function initials(name) { return String(name).split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ""; }).join("").toUpperCase(); }

  /* ---------- styles (scoped to .cgs) ---------- */
  var css = "" +
    ".cgs{--cg-acc:#c2560f;--cg-acc-ink:#fff;--cg-ink:inherit;--cg-mut:rgba(127,127,127,.95);--cg-line:rgba(127,127,127,.28);--cg-soft:rgba(127,127,127,.09);--cg-bg:transparent;--cg-panel:#fff;--cg-pink:#1c2225;--cg-ok:#2e7a4a;--cg-warn:#9a6200;--cg-bad:#b83227;font:inherit;color:inherit;box-sizing:border-box;margin:24px 0}" +
    "@media (prefers-color-scheme:dark){.cgs{--cg-panel:#1e2326;--cg-pink:#e6eae8;--cg-acc:#f08a43;--cg-acc-ink:#1b1209;--cg-ok:#6cc08b;--cg-warn:#e6b450;--cg-bad:#f07b70}}" +
    ".cgs *,.cgs *::before,.cgs *::after{box-sizing:border-box}" +
    ".cgs h2.cgs-h{font-size:1.6em;margin:0 0 14px;line-height:1.15}" +
    ".cgs-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}" +
    ".cgs-bar .cgs-grow{flex:1 1 220px;min-width:0}" +
    ".cgs input,.cgs select,.cgs textarea,.cgs button{font:inherit;font-size:15px;color:inherit}" +
    ".cgs input,.cgs select,.cgs textarea{background:transparent;border:1px solid var(--cg-line);border-radius:8px;padding:9px 11px;min-width:0}" +
    ".cgs select option{color:#111}" +
    ".cgs button{cursor:pointer;border-radius:8px;border:1px solid var(--cg-line);background:transparent;padding:9px 14px;font-weight:600}" +
    ".cgs button.cgs-pri{background:var(--cg-acc);border-color:var(--cg-acc);color:var(--cg-acc-ink)}" +
    ".cgs button:disabled{opacity:.5;cursor:not-allowed}" +
    ".cgs :focus-visible{outline:2px solid var(--cg-acc);outline-offset:2px}" +
    ".cgs-cats{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:14px;scrollbar-width:thin}" +
    ".cgs-cats button{white-space:nowrap;border-radius:999px;padding:6px 13px;font-size:14px;font-weight:500}" +
    ".cgs-cats button[aria-pressed=true]{background:var(--cg-acc);border-color:var(--cg-acc);color:var(--cg-acc-ink)}" +
    ".cgs-cats small{opacity:.7;margin-left:4px}" +
    ".cgs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:14px}" +
    ".cgs-card{border:1px solid var(--cg-line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-width:0;background:var(--cg-bg)}" +
    ".cgs button.cgs-img{all:unset;cursor:pointer;display:block;aspect-ratio:4/3;background:var(--cg-soft);position:relative}" +
    ".cgs-img img{width:100%;height:100%;object-fit:contain;display:block;background:#fff}" +
    ".cgs-ph{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:700;opacity:.35;letter-spacing:.05em}" +
    ".cgs-body{padding:12px;display:flex;flex-direction:column;gap:6px;flex:1}" +
    ".cgs-cat{font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}" +
    ".cgs button.cgs-name{all:unset;cursor:pointer;font-weight:600;line-height:1.3;display:block}" +
    ".cgs button.cgs-name:hover{text-decoration:underline}" +
    ".cgs-price{font-size:1.15em;font-weight:700;font-variant-numeric:tabular-nums}" +
    ".cgs-price small{font-size:12px;font-weight:400;opacity:.7;margin-left:4px}" +
    ".cgs-av{font-size:12.5px;font-weight:600}.cgs-av.in{color:var(--cg-ok)}.cgs-av.low{color:var(--cg-warn)}.cgs-av.out{color:var(--cg-bad)}" +
    ".cgs-add{display:flex;gap:6px;margin-top:auto;padding-top:6px;flex-wrap:wrap}" +
    ".cgs-add select{flex:1 1 100%}" +
    ".cgs-add input{width:64px;text-align:center}" +
    ".cgs-add button{flex:1}" +
    ".cgs-empty{padding:40px 10px;text-align:center;opacity:.75}" +
    ".cgs-fab{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:999px!important;padding:12px 18px!important}" +
    ".cgs-badge{display:inline-block;min-width:22px;padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.25);margin-left:6px;font-variant-numeric:tabular-nums}" +
    "dialog.cgs-dlg{border:0;padding:0;max-width:min(760px,calc(100% - 24px));width:100%;max-height:calc(100% - 24px);border-radius:12px;background:var(--cg-panel);color:var(--cg-pink);box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
    "dialog.cgs-dlg::backdrop{background:rgba(10,14,16,.55)}" +
    "dialog.cgs-side{margin:0 0 0 auto;height:100%;max-height:100%;max-width:min(520px,100%);border-radius:0}" +
    ".cgs-dh{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--cg-line);position:sticky;top:0;background:var(--cg-panel);z-index:1}" +
    ".cgs-dh h3{flex:1;margin:0;font-size:1.2em;min-width:0}" +
    ".cgs-db{padding:16px 18px;display:flex;flex-direction:column;gap:14px}" +
    ".cgs-gal{display:grid;gap:8px}.cgs-gal img{width:100%;max-height:420px;object-fit:contain;background:#fff;border-radius:8px}" +
    ".cgs-thumbs{display:flex;gap:6px;overflow-x:auto}.cgs-thumbs button{padding:0;border-radius:6px;overflow:hidden;flex:none}.cgs-thumbs img{width:64px;height:64px;object-fit:cover;display:block}" +
    ".cgs-desc{white-space:pre-line;line-height:1.5}" +
    ".cgs-line{display:grid;grid-template-columns:56px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--cg-line)}" +
    ".cgs-line img,.cgs-line .cgs-lph{width:56px;height:56px;object-fit:cover;border-radius:6px;background:var(--cg-soft);display:grid;place-items:center;font-weight:700;opacity:.9}" +
    ".cgs-line .cgs-ln{min-width:0}.cgs-line .cgs-ln b{display:block;font-weight:600;line-height:1.3}.cgs-line .cgs-ln span{font-size:13px;opacity:.75}" +
    ".cgs-step{display:flex;align-items:center;gap:4px}.cgs-step button{padding:4px 10px}.cgs-step input{width:52px;text-align:center;padding:6px}" +
    ".cgs-tot{display:flex;justify-content:space-between;font-weight:700;font-size:1.1em}" +
    ".cgs-note{font-size:13px;opacity:.8;margin:0}" +
    ".cgs-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cgs-form label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600}.cgs-form .cgs-w{grid-column:1/-1}" +
    "@media (max-width:520px){.cgs-form{grid-template-columns:1fr}.cgs-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cgs-body{padding:10px;gap:4px}.cgs-add input{width:46px;padding:8px 4px}.cgs-add button{padding:8px 6px;font-size:14px}.cgs button.cgs-name{font-size:14px}}" +
    ".cgs-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}" +
    ".cgs-err{color:var(--cg-bad);font-weight:600;margin:0}" +
    ".cgs-ok{border:1px solid var(--cg-ok);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".cgs-ok a{color:var(--cg-acc);font-weight:600}" +
    ".cgs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}";
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- mount ---------- */
  var root;
  function mount() {
    if (ds.replace) document.querySelectorAll(ds.replace).forEach(function (el) { el.style.display = "none"; el.setAttribute("aria-hidden", "true"); });
    root = document.querySelector(ds.target || "#cungu-shop, [data-cungu-shop]");
    if (!root) {
      root = document.createElement("section");
      root.id = "cungu-shop";
      var first = ds.replace && document.querySelector(ds.replace);
      if (first && first.parentNode) first.parentNode.insertBefore(root, first);
      else (document.querySelector("main") || document.body).appendChild(root);
    }
    root.classList.add("cgs");
    root.setAttribute("aria-label", "Shop");
    var title = ds.title != null ? ds.title : "Parts & equipment";
    root.innerHTML =
      (title ? '<h2 class="cgs-h">' + esc(title) + "</h2>" : "") +
      '<div class="cgs-bar"><input class="cgs-grow" type="search" placeholder="Search parts, SKU…" aria-label="Search products" data-cg="q">' +
      '<select aria-label="Sort" data-cg="sort"><option value="name">Name A–Z</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="stock">In stock first</option></select>' +
      '<button type="button" data-cg="open-list">My list <span class="cgs-badge" data-cg="count">0</span></button></div>' +
      '<div class="cgs-cats" role="group" aria-label="Categories" data-cg="cats"></div>' +
      '<p class="cgs-note" data-cg="meta" aria-live="polite"></p>' +
      '<div class="cgs-grid" data-cg="grid"><div class="cgs-empty">Loading products…</div></div>';
    // floating list button for long pages
    var fab = document.createElement("button");
    fab.type = "button"; fab.className = "cgs-pri cgs-fab"; fab.hidden = true; fab.setAttribute("data-cg", "open-list");
    fab.innerHTML = 'My list <span class="cgs-badge" data-cg="count">0</span>';
    var fabWrap = document.createElement("div"); fabWrap.className = "cgs"; fabWrap.style.margin = "0"; fabWrap.appendChild(fab);
    document.body.appendChild(fabWrap);
    // dialogs
    var dlgWrap = document.createElement("div"); dlgWrap.className = "cgs"; dlgWrap.style.margin = "0";
    dlgWrap.innerHTML = '<dialog class="cgs-dlg" data-cg="detail" aria-labelledby="cgs-dt"></dialog><dialog class="cgs-dlg cgs-side" data-cg="list" aria-labelledby="cgs-lt"></dialog>';
    document.body.appendChild(dlgWrap);

    root.addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-cg");
      if (k === "q") { state.q = e.target.value; renderGrid(); }
      if (k === "sort") { state.sort = e.target.value; renderGrid(); }
    });
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { fab.hidden = en[0].isIntersecting || !state.list.length; }).observe($('[data-cg="open-list"]', root));
    }
  }

  /* ---------- feed ---------- */
  function load() {
    return fetch(API + "/api/feed/" + STORE + ".json", { mode: "cors", cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("Feed " + r.status); return r.json(); })
      .then(function (f) { lsSet(FEED_KEY, f); state.error = ""; return f; })
      .catch(function (err) { var c = lsGet(FEED_KEY, null); if (c) { state.error = "offline"; return c; } throw err; })
      .then(function (f) { state.feed = f; pruneList(); renderAll(); return f; })
      .catch(function () {
        $('[data-cg="grid"]', root).innerHTML = '<div class="cgs-empty">The product list could not be loaded right now. Please refresh the page, or contact us on ' +
          esc(CONTACT.email) + ".</div>";
      });
  }
  function pruneList() { state.list = state.list.filter(function (l) { return bySku(l.sku); }); saveList(); }
  function saveList() { lsSet(LIST_KEY, state.list); renderCount(); }

  /* ---------- render ---------- */
  function renderAll() { renderCats(); renderGrid(); renderCount(); }
  function renderCats() {
    var counts = {}, ps = state.feed.products;
    ps.forEach(function (p) { var c = p.category || "Other"; counts[c] = (counts[c] || 0) + 1; });
    var cats = Object.keys(counts).sort();
    if (state.cat && !counts[state.cat]) state.cat = "";
    $('[data-cg="cats"]', root).innerHTML = ['<button type="button" data-cat="" aria-pressed="' + !state.cat + '">All<small>' + ps.length + "</small></button>"]
      .concat(cats.map(function (c) { return '<button type="button" data-cat="' + esc(c) + '" aria-pressed="' + (state.cat === c) + '">' + esc(c) + "<small>" + counts[c] + "</small></button>"; })).join("");
  }
  function visible() {
    var q = state.q.trim().toLowerCase();
    var ps = state.feed.products.filter(function (p) {
      return (!state.cat || (p.category || "Other") === state.cat) && (!q || (p.sku + " " + p.name + " " + p.category + " " + p.description).toLowerCase().indexOf(q) >= 0);
    });
    var rank = { in_stock: 0, low_stock: 1, on_order: 2 };
    ps.sort(function (a, b) {
      if (state.sort === "low") return a.price - b.price;
      if (state.sort === "high") return b.price - a.price;
      if (state.sort === "stock") return rank[a.availability] - rank[b.availability] || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return ps;
  }
  function card(p) {
    var a = avail(p), o = opts(p);
    return '<article class="cgs-card">' +
      '<button type="button" class="cgs-img" data-detail="' + esc(p.sku) + '" aria-label="View ' + esc(p.name) + '">' +
      (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="" loading="lazy" decoding="async">' : '<span class="cgs-ph">' + esc(initials(p.name)) + "</span>") + "</button>" +
      '<div class="cgs-body"><span class="cgs-cat">' + esc(p.category) + "</span>" +
      '<button type="button" class="cgs-name" data-detail="' + esc(p.sku) + '">' + esc(p.name) + "</button>" +
      '<span class="cgs-price">' + money(p.price) + "<small>incl. VAT" + (p.unit && p.unit !== "each" ? " · per " + esc(p.unit) : "") + "</small></span>" +
      '<span class="cgs-av ' + a.cls + '">' + a.txt + "</span>" +
      '<div class="cgs-add" data-row="' + esc(p.sku) + '">' +
      (o.length ? '<select aria-label="Option for ' + esc(p.name) + '" data-opt>' + o.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select>" : "") +
      '<input type="number" min="1" max="999" value="1" inputmode="numeric" aria-label="Quantity of ' + esc(p.name) + '" data-qty>' +
      '<button type="button" class="cgs-pri" data-add="' + esc(p.sku) + '">Add to list</button></div></div></article>';
  }
  function renderGrid() {
    if (!state.feed) return;
    var ps = visible();
    $('[data-cg="grid"]', root).innerHTML = ps.length ? ps.map(card).join("") : '<div class="cgs-empty">No products match. Try another search or category.</div>';
    $('[data-cg="meta"]', root).textContent = ps.length + " of " + state.feed.products.length + " products · prices in " + state.feed.currency + " incl. VAT" +
      (state.error ? " · showing the last saved list (offline)" : "");
  }
  function listCount() { return state.list.reduce(function (a, l) { return a + l.qty; }, 0); }
  function listTotal() { return state.list.reduce(function (a, l) { var p = bySku(l.sku); return a + (p ? p.price * l.qty : 0); }, 0); }
  function renderCount() {
    var n = listCount();
    document.querySelectorAll('[data-cg="count"]').forEach(function (e) { e.textContent = n; });
    var fab = $(".cgs-fab"); if (fab && !n) fab.hidden = true;
  }

  /* ---------- product detail ---------- */
  function openDetail(sku) {
    var p = bySku(sku); if (!p) return;
    var d = $('dialog[data-cg="detail"]'), a = avail(p), o = opts(p), im = p.images && p.images.length ? p.images : p.imageUrl ? [p.imageUrl] : [];
    d.innerHTML = '<div class="cgs-dh"><h3 id="cgs-dt">' + esc(p.name) + '</h3><button type="button" data-close aria-label="Close">✕</button></div><div class="cgs-db">' +
      (im.length ? '<div class="cgs-gal"><img src="' + esc(im[0]) + '" alt="' + esc(p.name) + '" data-main>' +
        (im.length > 1 ? '<div class="cgs-thumbs">' + im.map(function (u, i) { return '<button type="button" data-thumb="' + esc(u) + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'; }).join("") + "</div>" : "") + "</div>" : "") +
      '<div><span class="cgs-cat">' + esc(p.category) + " · " + esc(p.sku) + '</span><div class="cgs-price" style="margin-top:4px">' + money(p.price) + "<small>incl. VAT · " + money(p.priceExVat) + ' excl.</small></div><span class="cgs-av ' + a.cls + '">' + a.txt + "</span></div>" +
      (p.description ? '<div class="cgs-desc">' + esc(p.description) + "</div>" : "") +
      '<div class="cgs-add" data-row="' + esc(p.sku) + '">' +
      (o.length ? '<select aria-label="Option" data-opt>' + o.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select>" : "") +
      '<input type="number" min="1" max="999" value="1" inputmode="numeric" aria-label="Quantity" data-qty><button type="button" class="cgs-pri" data-add="' + esc(p.sku) + '" data-andclose>Add to list</button></div></div>';
    showModal(d);
  }
  function showModal(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute("open", ""); }
  function closeModal(d) { if (d.close) d.close(); else d.removeAttribute("open"); }

  /* ---------- list & quote ---------- */
  function addToList(sku, row) {
    var qty = Math.max(1, Math.min(999, parseInt(row && $("[data-qty]", row) ? $("[data-qty]", row).value : 1, 10) || 1));
    var opt = row && $("[data-opt]", row) ? $("[data-opt]", row).value : "";
    var ex = state.list.filter(function (l) { return l.sku === sku && (l.option || "") === opt; })[0];
    if (ex) ex.qty = Math.min(999, ex.qty + qty); else state.list.push({ sku: sku, qty: qty, option: opt });
    saveList();
    var fab = $(".cgs-fab"); var top = $('[data-cg="open-list"]', root);
    if (fab && top && top.getBoundingClientRect().bottom < 0) fab.hidden = false;
  }
  function renderList(sent) {
    var d = $('dialog[data-cg="list"]'), f = lsGet(FORM_KEY, {});
    var head = '<div class="cgs-dh"><h3 id="cgs-lt">My list</h3><button type="button" data-close aria-label="Close">✕</button></div>';
    if (sent) {
      var wa = CONTACT.whatsapp ? "https://wa.me/" + CONTACT.whatsapp + "?text=" + encodeURIComponent("Hi, I sent quote request " + sent.number + " on the website.") : "";
      d.innerHTML = head + '<div class="cgs-db"><div class="cgs-ok" role="status"><strong>Thank you - your quote request is in.</strong><span>Reference <b>' + esc(sent.number) + "</b> · " + sent.lines + " item" + (sent.lines === 1 ? "" : "s") + ", estimated " + money(sent.total) + " incl. VAT.</span>" +
        "<span>We reply by email or phone with availability, the final price and how to pay. No payment is taken here.</span>" +
        (sent.dropped ? "<span>" + sent.dropped + " item(s) were no longer available and were left out.</span>" : "") +
        '<span>' + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener">WhatsApp us</a> · ' : "") + (CONTACT.email ? '<a href="mailto:' + esc(CONTACT.email) + "?subject=" + encodeURIComponent("Quote " + sent.number) + '">' + esc(CONTACT.email) + "</a>" : "") + "</span></div>" +
        '<button type="button" data-close>Continue browsing</button></div>';
      return;
    }
    if (!state.list.length) { d.innerHTML = head + '<div class="cgs-db"><p class="cgs-empty">Your list is empty. Add parts with <b>Add to list</b>, then request a quote here.</p></div>'; return; }
    d.innerHTML = head + '<div class="cgs-db"><div>' + state.list.map(function (l, i) {
      var p = bySku(l.sku), a = avail(p);
      return '<div class="cgs-line">' + (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="">' : '<span class="cgs-lph">' + esc(initials(p.name)) + "</span>") +
        '<div class="cgs-ln"><b>' + esc(p.name) + "</b><span>" + esc(p.sku) + (l.option ? " · " + esc(l.option) : "") + " · " + money(p.price) + " each · " + a.txt + "</span>" +
        '<div class="cgs-step" style="margin-top:6px"><button type="button" data-step="' + i + '" data-d="-1" aria-label="One fewer">−</button><input type="number" min="1" max="999" value="' + l.qty + '" data-lq="' + i + '" aria-label="Quantity of ' + esc(p.name) + '"><button type="button" data-step="' + i + '" data-d="1" aria-label="One more">+</button><button type="button" data-rm="' + i + '" style="margin-left:6px">Remove</button></div></div>' +
        '<b style="font-variant-numeric:tabular-nums">' + money(p.price * l.qty) + "</b></div>";
    }).join("") + "</div>" +
      '<div class="cgs-tot"><span>Estimated total</span><span>' + money(listTotal()) + '</span></div><p class="cgs-note">Prices include VAT. No payment is taken here. We reply by email with availability, the final price and how to pay.</p>' +
      '<form class="cgs-form" data-cg="quote" novalidate>' +
      '<label class="cgs-w">Name *<input name="name" autocomplete="name" required value="' + esc(f.name) + '"></label>' +
      '<label>Email<input name="email" type="email" autocomplete="email" value="' + esc(f.email) + '"></label>' +
      '<label>Phone / WhatsApp<input name="phone" type="tel" autocomplete="tel" value="' + esc(f.phone) + '"></label>' +
      '<label class="cgs-w">Team or company<input name="company" autocomplete="organization" value="' + esc(f.company) + '"></label>' +
      '<label class="cgs-w">Message<textarea name="message" rows="3" placeholder="Kart, engine, when you need it, delivery address…"></textarea></label>' +
      '<label class="cgs-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
      '<p class="cgs-err cgs-w" data-cg="qerr" role="alert"></p>' +
      '<button type="submit" class="cgs-pri cgs-w">Request a quote</button></form></div>';
  }
  function openList() { var d = $('dialog[data-cg="list"]'); renderList(); showModal(d); }
  function submitQuote(form) {
    var fd = {}; ["name", "email", "phone", "company", "message", "website"].forEach(function (k) { fd[k] = form.elements[k].value.trim(); });
    var err = $('[data-cg="qerr"]', form);
    if (!fd.name) { err.textContent = "Please give your name."; form.elements.name.focus(); return; }
    if (!fd.email && !fd.phone) { err.textContent = "Please give an email address or phone number so we can reply."; form.elements.email.focus(); return; }
    lsSet(FORM_KEY, { name: fd.name, email: fd.email, phone: fd.phone, company: fd.company });
    var btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = "Sending…"; err.textContent = "";
    fd.lines = state.list.map(function (l) { return { sku: l.sku, qty: l.qty, option: l.option || "" }; });
    fd.page = location.href.slice(0, 300);
    fetch(API + "/api/stores/" + STORE + "/quotes", { method: "POST", mode: "cors", headers: { "content-type": "application/json" }, body: JSON.stringify(fd) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || "The request could not be sent (" + r.status + ")."); return b; }); })
      .then(function (b) { state.list = []; saveList(); renderList(b); })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = "Request a quote";
        err.innerHTML = esc(e.message || "Could not send.") + (CONTACT.email ? ' You can also email <a href="mailto:' + esc(CONTACT.email) + "?subject=Quote%20request&body=" + encodeURIComponent(state.list.map(function (l) { return l.qty + " x " + l.sku + (l.option ? " (" + l.option + ")" : ""); }).join("\n")) + '">' + esc(CONTACT.email) + "</a>." : "");
      });
  }

  /* ---------- events ---------- */
  function onClick(e) {
    var t = e.target.closest ? e.target.closest("button,a") : null;
    if (!t || !t.closest(".cgs")) return;
    if (t.hasAttribute("data-cat")) { state.cat = t.getAttribute("data-cat"); renderCats(); renderGrid(); return; }
    if (t.hasAttribute("data-detail")) { openDetail(t.getAttribute("data-detail")); return; }
    if (t.hasAttribute("data-add")) {
      addToList(t.getAttribute("data-add"), t.closest("[data-row]"));
      var old = t.textContent; t.textContent = "Added ✓"; setTimeout(function () { t.textContent = old; }, 1200);
      if (t.hasAttribute("data-andclose")) closeModal($('dialog[data-cg="detail"]'));
      return;
    }
    if (t.getAttribute("data-cg") === "open-list") { openList(); return; }
    if (t.hasAttribute("data-close")) { closeModal(t.closest("dialog")); return; }
    if (t.hasAttribute("data-thumb")) { var m = $("[data-main]", t.closest("dialog")); if (m) m.src = t.getAttribute("data-thumb"); return; }
    if (t.hasAttribute("data-step")) { var l = state.list[+t.getAttribute("data-step")]; if (l) { l.qty = Math.max(1, Math.min(999, l.qty + +t.getAttribute("data-d"))); saveList(); renderList(); } return; }
    if (t.hasAttribute("data-rm")) { state.list.splice(+t.getAttribute("data-rm"), 1); saveList(); renderList(); return; }
  }
  function onChange(e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-lq")) { var l = state.list[+t.getAttribute("data-lq")]; if (l) { l.qty = Math.max(1, Math.min(999, parseInt(t.value, 10) || 1)); saveList(); renderList(); } }
  }
  document.addEventListener("submit", function (e) { if (e.target.getAttribute && e.target.getAttribute("data-cg") === "quote") { e.preventDefault(); submitQuote(e.target); } });
  document.addEventListener("click", function (e) { if (e.target.tagName === "DIALOG" && e.target.classList.contains("cgs-dlg")) closeModal(e.target); }); // click on backdrop

  /* ---------- start ---------- */
  function start() {
    mount();
    load();
    setInterval(function () { if (!document.hidden) load(); }, 5 * 60 * 1000);
    window.CunguShop = { store: STORE, reload: load, openList: openList, add: function (sku, qty) { addToList(String(sku).toUpperCase(), null); if (qty > 1) { var l = state.list[state.list.length - 1]; l.qty = qty; saveList(); } }, get feed() { return state.feed; } };
    window.CunguStore = window.CunguStore || { store: STORE, load: function () { return state.feed ? Promise.resolve(state.feed) : load(); } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

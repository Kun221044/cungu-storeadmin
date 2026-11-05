/*
  Cungu Sport store app - replaces /app.js on sastore and kestore.
  Fills the store's own page (#cats, #grid, #pager, #count, #q, #sort, #cartBtn, #drawer, #modal)
  from the Store Manager's live feed, using the store's own styles.css classes
  (.grid .card .shot .body .brand .price .stock .add, .pager, .cats .n, .drawer/.scrim/.modal .open,
  .line, .detail, .field, .two, .err, .done, .state), and sends quote requests to the Store Manager.

  In each store's index.html, replace   <script src="/app.js"></script>   with
    <script src="https://storeadmin.cungusportracing.com/store-app.js" data-store="sa"></script>   (data-store="ke" on kestore)
*/
(function () {
  "use strict";
  var me = document.currentScript, ds = (me && me.dataset) || {};
  var API = me && me.src ? new URL(me.src, location.href).origin : "https://storeadmin.cungusportracing.com";
  var STORE = (ds.store || (/kestore|kenya/i.test(location.hostname) ? "ke" : "sa")) === "ke" ? "ke" : "sa";
  var SITES = { sa: "https://sastore.cungusportracing.com/", ke: "https://kestore.cungusportracing.com/" };
  var CONTACT = { sa: { email: "info@cungusportracing.com", wa: "27830000000" }, ke: { email: "kenya@cungusportracing.com", wa: "254700000000" } }[STORE];
  if (ds.email) CONTACT.email = ds.email;
  if (ds.whatsapp) CONTACT.wa = ds.whatsapp.replace(/\D/g, "");
  var PER_PAGE = Math.max(6, parseInt(ds.perPage || "24", 10));
  var FEED_KEY = "cungu-feed-" + STORE, LIST_KEY = "cungu-list-" + STORE, FORM_KEY = "cungu-quote-form";

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var S = { feed: null, cat: "", q: "", sort: "name", page: 1, list: lsGet(LIST_KEY, []), offline: false };
  function money(v) { var n = Math.round(v || 0).toLocaleString("en-ZA").replace(/[\s, ]/g, " "); return STORE === "ke" ? "KES " + n : "R " + n; }
  function bySku(sku) { if (!S.feed) return null; for (var i = 0; i < S.feed.products.length; i++) if (S.feed.products[i].sku === sku) return S.feed.products[i]; return null; }
  function opts(p) { return String(p.options || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); }
  function avail(p) {
    if (p.availability === "in_stock") return { c: "", t: "In stock" };
    if (p.availability === "low_stock") return { c: "low", t: "Only " + p.stock + " left" };
    var w = Math.max(1, Math.round((p.leadTimeDays || 7) / 7));
    return { c: "out", t: "On order · about " + w + " week" + (w === 1 ? "" : "s") };
  }
  function initials(n) { return String(n).split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ""; }).join("").toUpperCase(); }
  function shot(p, big) { return p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="' + (big ? esc(p.name) : "") + '"' + (big ? "" : ' loading="lazy" decoding="async"') + ">" : '<span class="ph">' + esc(initials(p.name)) + "</span>"; }

  /* ---------- the few extras styles.css has no rule for (all in the store's own palette) ---------- */
  var css =
    ".card button.shot{border:0;padding:0;width:100%;font:inherit;color:inherit}" +
    ".card h4 button{all:unset;cursor:pointer}.card h4 button:focus-visible,.card button.shot:focus-visible{outline:2px solid var(--gold);outline-offset:2px}" +
    ".card .stock.low{color:var(--warn)}" +
    ".card .csx-opt{margin-top:10px;width:100%;height:36px;border:1px solid var(--line);border-radius:9px;padding:0 10px;font:inherit;font-size:13.5px;background:#fff;color:var(--text)}" +
    ".detail .stock{font-size:13px;font-weight:600;color:var(--ok)}.detail .stock.low{color:var(--warn)}.detail .stock.out{color:var(--muted)}" +
    ".detail .brand{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}" +
    ".detail .csx-desc{white-space:pre-line;font-size:14px;color:var(--text);margin:12px 0 16px;line-height:1.55}" +
    ".detail .csx-incl{font-size:12.5px;color:var(--muted);margin-bottom:4px}" +
    ".csx-thumbs{display:flex;gap:8px;overflow-x:auto;margin-top:10px}" +
    ".csx-thumbs button{flex:0 0 60px;height:60px;padding:0;border:1px solid var(--line);border-radius:8px;background:var(--wash);overflow:hidden}" +
    ".csx-thumbs button.on{border-color:var(--gold)}.csx-thumbs img{width:100%;height:100%;object-fit:contain}" +
    ".detail .shot .ph{font:800 48px 'Space Grotesk',system-ui,sans-serif;color:#cbd5e1;letter-spacing:.06em}" +
    ".line .thumb .ph{display:grid;place-items:center;height:100%;font:800 15px 'Space Grotesk',system-ui,sans-serif;color:#cbd5e1}" +
    ".csx-sum{background:var(--wash);border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:16px}" +
    ".csx-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}" +
    ".done a{color:var(--gold-lo);font-weight:600}.done .btn-primary{margin-top:16px}" +
    ".drawer .items .state{padding:40px 0}" +
    ".shell>.side,.shell>main{min-width:0}" +
    "@media (prefers-reduced-motion:reduce){.card,.drawer,.scrim{transition:none!important}.card:hover{transform:none}}";
  var st = document.createElement("style"); st.id = "csx-style"; st.textContent = css; document.head.appendChild(st);

  /* ---------- feed ---------- */
  function skeleton() {
    var g = $("grid"); g.classList.add("grid");
    var h = ""; for (var i = 0; i < 8; i++) h += '<div class="sk-card skeleton"></div>';
    g.innerHTML = h;
  }
  function load() {
    return fetch(API + "/api/feed/" + STORE + ".json", { mode: "cors", cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("feed " + r.status); return r.json(); })
      .then(function (f) { lsSet(FEED_KEY, f); S.offline = false; return f; })
      .catch(function (e) { var c = lsGet(FEED_KEY, null); if (c) { S.offline = true; return c; } throw e; })
      .then(function (f) { S.feed = f; S.list = S.list.filter(function (l) { return bySku(l.sku); }); saveList(); renderAll(); })
      .catch(function () {
        if (S.feed) return; // keep showing what we have
        $("count").textContent = "Catalogue unavailable";
        $("pager").innerHTML = "";
        $("grid").innerHTML = '<div class="state" style="grid-column:1/-1"><h3>The catalogue could not be loaded</h3><p>Check your connection and try again, or email <a href="mailto:' + esc(CONTACT.email) + '">' + esc(CONTACT.email) + '</a>.</p><button type="button" class="retry" data-retry>Try again</button></div>';
      });
  }

  /* ---------- catalogue ---------- */
  function renderAll() { renderCats(); renderGrid(); renderCount(); }
  function renderCats() {
    var counts = {}, ps = S.feed.products;
    ps.forEach(function (p) { var c = p.category || "Other"; counts[c] = (counts[c] || 0) + 1; });
    if (S.cat && !counts[S.cat]) S.cat = "";
    var cats = Object.keys(counts).sort();
    function b(val, label, n) { var on = S.cat === val; return '<li><button type="button" data-cat="' + esc(val) + '" class="' + (on ? "on" : "") + '" aria-pressed="' + on + '"><span>' + esc(label) + '</span><span class="n">' + n + "</span></button></li>"; }
    $("cats").innerHTML = b("", "All products", ps.length) + cats.map(function (c) { return b(c, c, counts[c]); }).join("");
  }
  function filtered() {
    var q = S.q.trim().toLowerCase(), rank = { in_stock: 0, low_stock: 1, on_order: 2 };
    var ps = S.feed.products.filter(function (p) {
      return (!S.cat || (p.category || "Other") === S.cat) && (!q || (p.sku + " " + p.name + " " + p.category + " " + p.description + " " + p.options).toLowerCase().indexOf(q) >= 0);
    });
    ps.sort(function (a, b) {
      if (S.sort === "price-asc") return a.price - b.price;
      if (S.sort === "price-desc") return b.price - a.price;
      if (S.sort === "stock") return rank[a.availability] - rank[b.availability] || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return ps;
  }
  function optSelect(p, cls) {
    var o = opts(p);
    return o.length ? '<select class="' + cls + '" aria-label="Size or option for ' + esc(p.name) + '" data-opt>' + o.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select>" : "";
  }
  function card(p) {
    var a = avail(p);
    return '<article class="card" data-row="' + esc(p.sku) + '">' +
      '<button type="button" class="shot" data-detail="' + esc(p.sku) + '" aria-label="View ' + esc(p.name) + '">' + shot(p) + "</button>" +
      '<div class="body"><div class="brand">' + esc(p.category) + "</div>" +
      '<h4><button type="button" data-detail="' + esc(p.sku) + '">' + esc(p.name) + "</button></h4>" +
      '<div class="price">' + money(p.price) + "</div>" +
      '<div class="stock ' + a.c + '">' + a.t + "</div>" +
      optSelect(p, "csx-opt") +
      '<div style="flex:1"></div><button type="button" class="add" data-add="' + esc(p.sku) + '">Add to list</button></div></article>';
  }
  function renderGrid() {
    if (!S.feed) return;
    var ps = filtered(), pages = Math.max(1, Math.ceil(ps.length / PER_PAGE));
    if (S.page > pages) S.page = pages;
    var grid = $("grid"); grid.classList.add("grid");
    grid.innerHTML = ps.length ? ps.slice((S.page - 1) * PER_PAGE, S.page * PER_PAGE).map(card).join("")
      : '<div class="state" style="grid-column:1/-1"><h3>No products match</h3><p>Try another search or category.</p></div>';
    var from = ps.length ? (S.page - 1) * PER_PAGE + 1 : 0, to = Math.min(ps.length, S.page * PER_PAGE);
    $("count").textContent = (pages > 1 ? from + "–" + to + " of " : "") + ps.length + " product" + (ps.length === 1 ? "" : "s") + (S.cat ? " in " + S.cat : "") + " · prices incl. VAT" + (S.offline ? " · offline copy" : "");
    var pg = $("pager");
    if (pages < 2) { pg.innerHTML = ""; return; }
    var b = ['<button type="button" data-page="' + (S.page - 1) + '" aria-label="Previous page"' + (S.page === 1 ? " disabled" : "") + ">‹</button>"];
    for (var i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - S.page) <= 1) b.push('<button type="button" data-page="' + i + '" class="' + (i === S.page ? "on" : "") + '"' + (i === S.page ? ' aria-current="page"' : "") + ">" + i + "</button>");
      else if (b[b.length - 1] !== "…") b.push("…");
    }
    b.push('<button type="button" data-page="' + (S.page + 1) + '" aria-label="Next page"' + (S.page === pages ? " disabled" : "") + ">›</button>");
    pg.innerHTML = b.map(function (x) { return x === "…" ? '<span style="color:var(--muted)">…</span>' : x; }).join("");
  }

  /* ---------- list (drawer) ---------- */
  function saveList() { lsSet(LIST_KEY, S.list); renderCount(); if ($("drawer").classList.contains("open")) renderList(); }
  function listQty() { return S.list.reduce(function (a, l) { return a + l.qty; }, 0); }
  function listTotal() { return S.list.reduce(function (a, l) { var p = bySku(l.sku); return a + (p ? p.price * l.qty : 0); }, 0); }
  function renderCount() {
    var n = listQty(), c = $("cartCount");
    c.textContent = n; c.style.display = n ? "" : "none";
    $("cartBtn").setAttribute("aria-label", "My list, " + n + " item" + (n === 1 ? "" : "s"));
  }
  function renderList() {
    var box = $("cartItems");
    if (!S.list.length) box.innerHTML = '<div class="state"><h3>Your list is empty</h3><p>Add parts and kit with <b>Add to list</b>, then request a quote here.</p></div>';
    else box.innerHTML = S.list.map(function (l, i) {
      var p = bySku(l.sku), a = avail(p);
      return '<div class="line"><div class="thumb">' + shot(p) + '</div><div class="meta"><b>' + esc(p.name) + '</b><div class="sub">' + esc(p.sku) + (l.option ? " · " + esc(l.option) : "") + " · " + money(p.price) + " each · " + a.t + "</div>" +
        '<div class="qty"><button type="button" data-step="' + i + '" data-d="-1" aria-label="One fewer">−</button><input type="number" min="1" max="999" value="' + l.qty + '" data-lq="' + i + '" aria-label="Quantity of ' + esc(p.name) + '"><button type="button" data-step="' + i + '" data-d="1" aria-label="One more">+</button></div>' +
        '<button type="button" class="rm" data-rm="' + i + '">Remove</button></div><div class="lt">' + money(p.price * l.qty) + "</div></div>";
    }).join("");
    $("cartTotal").textContent = S.list.length ? money(listTotal()) : "—";
    $("toQuote").disabled = !S.list.length;
  }
  function addToList(sku, qty, opt) {
    qty = Math.max(1, Math.min(999, qty || 1)); opt = opt || "";
    var ex = S.list.filter(function (l) { return l.sku === sku && (l.option || "") === opt; })[0];
    if (ex) ex.qty = Math.min(999, ex.qty + qty); else S.list.push({ sku: sku, qty: qty, option: opt });
    saveList();
  }
  var lastFocus = null;
  function syncScrim() { $("scrim").classList.toggle("open", $("drawer").classList.contains("open") || $("modal").classList.contains("open")); }
  function openDrawer() { lastFocus = document.activeElement; renderList(); $("drawer").classList.add("open"); syncScrim(); $("closeCart").focus(); }
  function closeDrawer() { $("drawer").classList.remove("open"); syncScrim(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }

  /* ---------- modal: product detail, quote form, confirmation ---------- */
  function openModal(title, html) { if (!$("modal").classList.contains("open")) lastFocus = document.activeElement; $("modalTitle").textContent = title; $("modalBody").innerHTML = html; $("modal").classList.add("open"); syncScrim(); $("closeModal").focus(); }
  function closeModal() { $("modal").classList.remove("open"); syncScrim(); if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus(); }
  function openDetail(sku) {
    var p = bySku(sku); if (!p) return;
    var a = avail(p), im = p.images && p.images.length ? p.images : p.imageUrl ? [p.imageUrl] : [];
    openModal(p.name,
      '<div class="detail" data-row="' + esc(p.sku) + '"><div><div class="shot">' + (im.length ? '<img src="' + esc(im[0]) + '" alt="' + esc(p.name) + '" data-main>' : '<span class="ph">' + esc(initials(p.name)) + "</span>") + "</div>" +
      (im.length > 1 ? '<div class="csx-thumbs">' + im.map(function (u, i) { return '<button type="button" data-thumb="' + esc(u) + '" class="' + (i ? "" : "on") + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'; }).join("") + "</div>" : "") + "</div>" +
      '<div><div class="brand">' + esc(p.category) + " · " + esc(p.sku) + '</div><div class="price">' + money(p.price) + '</div><div class="csx-incl">incl. VAT · ' + money(p.priceExVat) + " excl. VAT" + (p.unit && p.unit !== "each" ? " · per " + esc(p.unit) : "") + "</div>" +
      '<div class="stock ' + a.c + '">' + a.t + "</div>" +
      (p.description ? '<div class="csx-desc">' + esc(p.description) + "</div>" : '<div style="height:16px"></div>') +
      (opts(p).length ? '<div class="field"><label for="csxOpt">Size / option</label>' + optSelect(p, "").replace("<select ", '<select id="csxOpt" ') + "</div>" : "") +
      '<div class="field"><label for="csxQty">Quantity</label><input id="csxQty" type="number" min="1" max="999" value="1" inputmode="numeric" data-qty style="max-width:110px"></div>' +
      '<button type="button" class="btn-primary" data-add="' + esc(p.sku) + '" data-close-after>Add to list</button></div></div>');
  }
  function openQuote() {
    if (!S.list.length) return;
    var f = lsGet(FORM_KEY, {});
    $("drawer").classList.remove("open");
    openModal("Request a quote",
      '<div class="csx-sum">' + S.list.length + " line" + (S.list.length === 1 ? "" : "s") + " · " + listQty() + " item" + (listQty() === 1 ? "" : "s") + " · estimated <b>" + money(listTotal()) + "</b> incl. VAT</div>" +
      '<form id="csxQuote" novalidate><div class="err" id="csxErr" role="alert" hidden></div>' +
      '<div class="field"><label for="csxName">Name *</label><input id="csxName" name="name" autocomplete="name" required value="' + esc(f.name) + '"></div>' +
      '<div class="two"><div class="field"><label for="csxEmail">Email</label><input id="csxEmail" name="email" type="email" autocomplete="email" value="' + esc(f.email) + '"></div>' +
      '<div class="field"><label for="csxPhone">Phone / WhatsApp</label><input id="csxPhone" name="phone" type="tel" autocomplete="tel" value="' + esc(f.phone) + '"></div></div>' +
      '<div class="field"><label for="csxCo">Team or company</label><input id="csxCo" name="company" autocomplete="organization" value="' + esc(f.company) + '"></div>' +
      '<div class="field"><label for="csxMsg">Message</label><textarea id="csxMsg" name="message" rows="3" placeholder="Sizes, kart and engine, when you need it, collection or courier address…"></textarea><div class="hint">Give an email address or phone number so we can reply.</div></div>' +
      '<div class="csx-hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<button type="submit" class="btn-primary">Send quote request</button>' +
      '<p class="note">No payment is taken here. We reply by email with availability, the final price and how to pay.</p></form>');
  }
  function showErr(msg, html) { var e = $("csxErr"); e.hidden = false; if (html) e.innerHTML = html; else e.textContent = msg; }
  function submitQuote(form) {
    var d = {}; ["name", "email", "phone", "company", "message", "website"].forEach(function (k) { d[k] = form.elements[k].value.trim(); });
    if (!d.name) { showErr("Please give your name."); form.elements.name.focus(); return; }
    if (!d.email && !d.phone) { showErr("Please give an email address or phone number so we can reply."); form.elements.email.focus(); return; }
    lsSet(FORM_KEY, { name: d.name, email: d.email, phone: d.phone, company: d.company });
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…"; $("csxErr").hidden = true;
    d.lines = S.list.map(function (l) { return { sku: l.sku, qty: l.qty, option: l.option || "" }; });
    d.page = location.href.slice(0, 300);
    fetch(API + "/api/stores/" + STORE + "/quotes", { method: "POST", mode: "cors", headers: { "content-type": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || "The request could not be sent (" + r.status + ")."); return b; }); })
      .then(function (b) {
        S.list = []; saveList();
        var wa = CONTACT.wa ? "https://wa.me/" + CONTACT.wa + "?text=" + encodeURIComponent("Hi, I sent quote request " + b.number + " on the website.") : "";
        openModal("Quote request sent", '<div class="done" role="status"><div class="tick" aria-hidden="true">✓</div><div>Thank you - we have your list. Your reference is</div><div class="ref">' + esc(b.number) + "</div>" +
          '<p class="note" style="margin-top:4px">' + b.lines + " line" + (b.lines === 1 ? "" : "s") + " · estimated " + money(b.total) + " incl. VAT</p>" +
          "<p>We reply by email or phone with availability, the final price and how to pay.</p>" + (b.dropped ? '<p class="note">' + b.dropped + " item(s) were no longer available and were left out.</p>" : "") +
          "<p>" + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener">WhatsApp us</a> · ' : "") + '<a href="mailto:' + esc(CONTACT.email) + "?subject=" + encodeURIComponent("Quote " + b.number) + '">' + esc(CONTACT.email) + "</a></p>" +
          '<button type="button" class="btn-primary" data-close-modal>Continue shopping</button></div>');
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = "Send quote request";
        var body = S.list.map(function (l) { var p = bySku(l.sku); return l.qty + " x " + l.sku + " " + (p ? p.name : "") + (l.option ? " (" + l.option + ")" : ""); }).join("\n");
        showErr(null, esc(e.message) + ' You can also email your list to <a href="mailto:' + esc(CONTACT.email) + "?subject=Quote%20request&body=" + encodeURIComponent(body) + '">' + esc(CONTACT.email) + "</a>.");
      });
  }

  /* ---------- market switch and footer link ---------- */
  function markets() {
    var za = $("linkZA"), ke = $("linkKE"), other = $("otherStore"), sw = $("marketSwitch");
    if (za) za.href = SITES.sa;
    if (ke) ke.href = SITES.ke;
    if (sw) sw.style.visibility = "visible";
    if (other) { other.href = SITES[STORE === "sa" ? "ke" : "sa"]; other.style.display = ""; }
  }

  /* ---------- events ---------- */
  function bind() {
    var qt;
    $("q").addEventListener("input", function (e) { clearTimeout(qt); qt = setTimeout(function () { S.q = e.target.value; S.page = 1; renderGrid(); }, 120); });
    var sort = $("sort");
    if (!sort.querySelector('option[value="stock"]')) sort.insertAdjacentHTML("beforeend", '<option value="stock">In stock first</option>');
    sort.addEventListener("change", function (e) { S.sort = e.target.value; S.page = 1; renderGrid(); });
    $("cartBtn").addEventListener("click", openDrawer);
    $("closeCart").addEventListener("click", closeDrawer);
    $("closeModal").addEventListener("click", closeModal);
    $("scrim").addEventListener("click", function () { closeModal(); closeDrawer(); });
    $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
    $("toQuote").addEventListener("click", openQuote);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if ($("modal").classList.contains("open")) closeModal(); else if ($("drawer").classList.contains("open")) closeDrawer(); } });
    document.addEventListener("submit", function (e) { if (e.target.id === "csxQuote") { e.preventDefault(); submitQuote(e.target); } });
    document.addEventListener("change", function (e) { var t = e.target; if (t.hasAttribute && t.hasAttribute("data-lq")) { var l = S.list[+t.getAttribute("data-lq")]; if (l) { l.qty = Math.max(1, Math.min(999, parseInt(t.value, 10) || 1)); saveList(); } } });
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("button"); if (!t) return;
      if (t.hasAttribute("data-cat")) { S.cat = t.getAttribute("data-cat"); S.page = 1; renderCats(); renderGrid(); var tb = document.querySelector(".toolbar"); if (tb && tb.getBoundingClientRect().top < 0) tb.scrollIntoView({ behavior: "smooth" }); return; }
      if (t.hasAttribute("data-page")) { if (t.disabled) return; S.page = +t.getAttribute("data-page"); renderGrid(); var tb2 = document.querySelector(".toolbar"); if (tb2 && tb2.getBoundingClientRect().top < 0) tb2.scrollIntoView({ behavior: "smooth" }); return; }
      if (t.hasAttribute("data-retry")) { skeleton(); load(); return; }
      if (t.hasAttribute("data-detail")) { openDetail(t.getAttribute("data-detail")); return; }
      if (t.hasAttribute("data-add")) {
        var row = t.closest("[data-row]"), q = row && row.querySelector("[data-qty]"), o = row && row.querySelector("[data-opt]");
        addToList(t.getAttribute("data-add"), q ? parseInt(q.value, 10) || 1 : 1, o ? o.value : "");
        if (t.hasAttribute("data-close-after")) { closeModal(); return; }
        var old = t.textContent; t.classList.add("added"); t.textContent = "Added ✓";
        setTimeout(function () { t.classList.remove("added"); t.textContent = old; }, 1200);
        return;
      }
      if (t.hasAttribute("data-thumb")) { var m = $("modalBody").querySelector("[data-main]"); if (m) m.src = t.getAttribute("data-thumb"); t.parentNode.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === t); }); return; }
      if (t.hasAttribute("data-step")) { var l = S.list[+t.getAttribute("data-step")]; if (l) { l.qty = Math.max(1, Math.min(999, l.qty + +t.getAttribute("data-d"))); saveList(); } return; }
      if (t.hasAttribute("data-rm")) { S.list.splice(+t.getAttribute("data-rm"), 1); saveList(); return; }
      if (t.hasAttribute("data-close-modal")) { closeModal(); return; }
    });
  }

  function start() {
    var need = ["cats", "grid", "pager", "count", "q", "sort", "cartBtn", "cartCount", "drawer", "cartItems", "cartTotal", "toQuote", "closeCart", "scrim", "modal", "modalTitle", "modalBody", "closeModal"];
    var missing = need.filter(function (id) { return !$(id); });
    if (missing.length) { console.error("Cungu store app: page is missing #" + missing.join(", #")); return; }
    $("drawer").setAttribute("role", "dialog"); $("drawer").setAttribute("aria-modal", "true");
    markets(); bind(); renderCount(); skeleton(); load();
    setInterval(function () { if (!document.hidden) load(); }, 5 * 60 * 1000);
    window.CunguShop = { store: STORE, reload: load, openList: openDrawer, get feed() { return S.feed; } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

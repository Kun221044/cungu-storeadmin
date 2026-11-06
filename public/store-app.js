/*
  Cungu Sport store app (v3) - runs sastore and kestore.
  Builds the whole storefront (header, category menu, home page, category and product pages, My list and quotes)
  from the Store Manager's live feed. The store's index.html only needs this one line:
    <script src="https://storeadmin.cungusportracing.com/store-app.js" data-store="sa"></script>   (data-store="ke" on kestore)

  Categories: products are placed in departments (Karts, Engines, Engine parts, Kart parts, Clothing, Data loggers,
  Oil / Spray, Universal parts, Tyres) by the table below. A product whose category in the Store Manager is written
  "Department > Sub-category" (e.g. "Kart parts > Brakes") goes exactly there, so new products can be placed without
  changing this file. Anything else is placed by keywords, or under its own Store Manager category.
*/
(function () {
  "use strict";
  var me = document.currentScript, ds = (me && me.dataset) || {};
  var API = me && me.src ? new URL(me.src, location.href).origin : "https://storeadmin.cungusportracing.com";
  var STORE = (ds.store || (/kestore|kenya/i.test(location.hostname) ? "ke" : "sa")) === "ke" ? "ke" : "sa";
  var SITES = { sa: "https://sastore.cungusportracing.com/", ke: "https://kestore.cungusportracing.com/" };
  var INFO = {
    sa: { country: "South Africa", city: "Pretoria", email: "info@cungusportracing.com", phone: "+27 83 000 0000", wa: "27830000000", vat: "15%", ship: "Courier nationwide", collect: "Collection from the Pretoria workshop" },
    ke: { country: "Kenya", city: "Nairobi", email: "kenya@cungusportracing.com", phone: "+254 700 000 000", wa: "254700000000", vat: "16%", ship: "Courier countrywide", collect: "Collection in Nairobi" },
  }[STORE];
  if (ds.email) INFO.email = ds.email;
  if (ds.whatsapp) INFO.wa = ds.whatsapp.replace(/\D/g, "");
  if (ds.phone) INFO.phone = ds.phone;
var LOGO = API + "/brand/csr-kart-parts-logo-480.webp", LOGO2X = API + "/brand/csr-kart-parts-logo-960.webp";
  function logoImg(h) { return '<img src="' + LOGO + '" srcset="' + LOGO + " 480w, " + LOGO2X + ' 960w" sizes="' + Math.round(h * 1.77) + 'px" alt="CSR Kart Parts" width="' + Math.round(h * 1.77) + '" height="' + h + '">'; }
  var PER_PAGE = 24;
  var K = { feed: "cungu-feed-" + STORE, list: "cungu-list-" + STORE, form: "cungu-quote-form", vat: "cungu-vat" };

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function slug(s) { return String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  var S = { feed: null, products: [], list: lsGet(K.list, []), incl: lsGet(K.vat, true) !== false, offline: false, sort: "name", stockOnly: false, page: 1 };
  function money(v) { var n = Math.round(v || 0).toLocaleString("en-ZA").replace(/[\s, ]/g, " "); return STORE === "ke" ? "KES " + n : "R " + n; }
  function priceOf(p) { return S.incl ? p.price : p.priceExVat; }
  function vatLabel() { return S.incl ? "incl. VAT" : "excl. VAT"; }
  function bySku(sku) { for (var i = 0; i < S.products.length; i++) if (S.products[i].sku === sku) return S.products[i]; return null; }
  function opts(p) { return String(p.options || "").split(",").map(clean).filter(Boolean); }
  function avail(p) {
    if (p.availability === "in_stock") return { c: "in", t: "In stock" };
    if (p.availability === "low_stock") return { c: "low", t: "Only " + p.stock + " left" };
    var w = Math.max(1, Math.round((p.leadTimeDays || 7) / 7));
    return { c: "out", t: "On order · about " + w + " week" + (w === 1 ? "" : "s") };
  }
  function initials(n) { return clean(n).split(" ").slice(0, 2).map(function (w) { return w[0] || ""; }).join("").toUpperCase(); }

  /* ---------------- departments ---------------- */
  var DEPTS = [
    { id: "karts", name: "Karts", sub: "Complete karts & chassis", icon: "kart" },
    { id: "engines", name: "Engines", sub: "Rotax Max & E10", icon: "engine" },
    { id: "engine-parts", name: "Engine parts", sub: "Rotax, KZ & Comer", icon: "piston" },
    { id: "kart-parts", name: "Kart parts", sub: "Keep your kart race ready", icon: "wheel" },
    { id: "clothing", name: "Clothing", sub: "Helmets, suits & teamwear", icon: "helmet" },
    { id: "data", name: "Data loggers", sub: "MyChron & sensors", icon: "gauge" },
    { id: "tools", name: "Tools", sub: "Workshop, tyre & Rotax tools", icon: "wrench" },
    { id: "oil", name: "Oil / Spray", sub: "Lubes & fluids", icon: "oil" },
    { id: "universal", name: "Universal parts", sub: "Clamps, ties & springs", icon: "box" },
    { id: "tyres", name: "Tyres", sub: "Slicks & wets", icon: "tyre" },
  ];
  var DEPT_BY_ID = {}; DEPTS.forEach(function (d) { DEPT_BY_ID[d.id] = d; });
  var MAP = {}; // sku -> [dept, sub]
  function put(dept, sub, skus) { skus.split(" ").forEach(function (s) { MAP[s] = [dept, sub]; }); }
  put("karts", "Complete karts", "KART-001");
  put("karts", "Chassis", "EQP-002");
  put("engines", "Rotax Max", "EQP-001");
  put("engine-parts", "Carburettors", "CRB-001 CRB-002 ENG-005 ENG-009 ENG-010 ENG-011 ENG-013");
  put("engine-parts", "Ignition & electrics", "ENG-003 ENG-006 ENG-015 ENG-016 ENG-017 ROT-002");
  put("engine-parts", "Engine internals", "ENG-007 ENG-018 ENG-019 ENG-020 ENG-021 ENG-022 ENG-023 ENG-024 ENG-025 ENG-026 ENG-027 ENG-028");
  put("engine-parts", "Clutch & sprockets", "ENG-029 ENG-030 ENG-031 ENG-032 ENG-033 ENG-034");
  put("engine-parts", "Exhaust", "ENG-004 ENG-035 ENG-037 ENG-038 ROT-001");
  put("engine-parts", "Filters, fuel & cooling", "ENG-001 ENG-002 ENG-012 ENG-039");
  put("engine-parts", "KZ / Vortex", "KZM-001 KZM-002 KZM-003 KZM-004 KZM-005 KZM-006 KZM-007 KZA-001 KZA-002 KZA-003 KZA-004 KZA-010");
  put("kart-parts", "Brakes", "KRT-003 KRT-005 KRT-020 KRT-021 KRT-022");
  put("kart-parts", "Wheels, axles & hubs", "KRT-008 KRT-009 KRT-010 KRT-011 KRT-012 KRT-013 KRT-036 KRT-039 KRT-040");
  put("kart-parts", "Chain & sprockets", "KRT-001 KRT-002 KRT-007");
  put("kart-parts", "Bodywork & stickers", "KRT-019 KRT-024 KRT-025 KRT-026 KRT-027 KRT-028 KRT-029 KRT-035 DAT-014 GEAR-020 GEAR-021");
  put("kart-parts", "Chassis parts", "KRT-006 KRT-014 KRT-015 KRT-016 KRT-017 KRT-018 DAT-015");
  put("kart-parts", "Fuel & cables", "KRT-004 KRT-023 KRT-030 KRT-031");
  put("kart-parts", "Radiators & cooling", "KRT-032 KRT-033 KZA-005 KZA-006 KZA-007 KZA-008 KZA-009");
  put("clothing", "Helmets", "SAF-001 SAF-002 SAF-003");
  put("clothing", "Race suits", "SAF-004 GEAR-001");
  put("clothing", "Rib & neck protection", "SAF-005 SAF-006 SAF-007 SAF-008");
  put("clothing", "Gloves & boots", "GEAR-003 GEAR-004");
  put("clothing", "Underwear & balaclavas", "GEAR-002 GEAR-011 GEAR-012");
  put("clothing", "Teamwear", "GEAR-005 GEAR-006 GEAR-007 GEAR-008 GEAR-009 GEAR-010 GEAR-013 GEAR-014 GEAR-015 GEAR-016 GEAR-017 GEAR-019 GEAR-022 GEAR-023");
  put("clothing", "Bags", "GEAR-018 GEAR-024 GEAR-025");
  put("data", "Laptimers", "DAT-001 DAT-013");
  put("data", "Sensors", "DAT-002 DAT-003 DAT-004 DAT-005 DAT-006 DAT-007 DAT-008 DAT-012");
  put("data", "Cables & mounts", "DAT-009 DAT-010 DAT-011 KRT-034");
  put("oil", "Lubes & fluids", "KRT-037 KRT-038 ENG-008");
  put("universal", "Clamps, ties & tape", "ENG-014 ENG-040 ENG-041");
  put("universal", "Springs", "ENG-036");
  put("tyres", "Slicks", "TYR-001 TYR-002 TYR-003");
  put("tyres", "Wets", "TYR-004");
  var RULES = [ // fallback for products added later: [regex on name+category, dept, sub]
    [/\b(complete kart|bambino|kart\b.*complete)/i, "karts", "Complete karts"], [/\bchassis\b/i, "karts", "Chassis"],
    [/\bengine,? complete|complete engine/i, "engines", "Engines"],
    [/tyre|tire|mojo|vega|komet/i, "tyres", "Tyres"],
    [/helmet|arai|bell\b|stilo/i, "clothing", "Helmets"], [/suit\b|overall/i, "clothing", "Race suits"], [/rib|neck/i, "clothing", "Rib & neck protection"],
    [/glove|boot|shoe/i, "clothing", "Gloves & boots"], [/shirt|hoodie|jacket|cap\b|trouser|short|polo|vest|tracksuit/i, "clothing", "Teamwear"], [/bag\b|backpack/i, "clothing", "Bags"],
    [/mychron|alfano|laptimer|lap timer/i, "data", "Laptimers"], [/sensor|probe|lambda/i, "data", "Sensors"], [/aim\b|data hub/i, "data", "Cables & mounts"],
    [/lube|oil\b|fluid|spray|grease|distilled/i, "oil", "Lubes & fluids"],
    [/tie wrap|cable tie|hose clamp|tape\b/i, "universal", "Clamps, ties & tape"], [/spring/i, "universal", "Springs"],
    [/dellorto|carbur|jet\b|vhs|ibea|tillotson/i, "engine-parts", "Carburettors"], [/spark|ngk|battery|charger|coil|cdi|stator|wiring|loom/i, "engine-parts", "Ignition & electrics"],
    [/vortex|kz\b|mikuni|reed/i, "engine-parts", "KZ / Vortex"], [/piston|crank|bearing|seal|gasket|balance/i, "engine-parts", "Engine internals"],
    [/clutch|drum|pinion/i, "engine-parts", "Clutch & sprockets"], [/exhaust|muffler|silencer/i, "engine-parts", "Exhaust"],
    [/brake/i, "kart-parts", "Brakes"], [/rim|wheel|axle|hub/i, "kart-parts", "Wheels, axles & hubs"], [/chain|sprocket/i, "kart-parts", "Chain & sprockets"],
    [/nose|bumper|panel|nassau|number plate|pod|sticker|floor tray|spoiler/i, "kart-parts", "Bodywork & stickers"],
    [/torsion|seat|stay|steering/i, "kart-parts", "Chassis parts"], [/fuel|throttle|cable/i, "kart-parts", "Fuel & cables"], [/radiator|curtain|water pump|hose/i, "kart-parts", "Radiators & cooling"],
    [/engine/i, "engine-parts", "Universal engine parts"], [/kart/i, "kart-parts", "Other kart parts"],
  ];
  function place(p) {
    var cat = clean(p.category);
    if (cat.indexOf(">") > 0) {
      var parts = cat.split(">").map(clean), d = DEPTS.filter(function (x) { return x.name.toLowerCase() === parts[0].toLowerCase() || x.id === slug(parts[0]); })[0];
      if (d) return [d.id, parts[1] || "Other"];
    }
    if (MAP[p.sku]) return MAP[p.sku];
    var hay = p.name + " " + cat;
    for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(hay)) return [RULES[i][1], RULES[i][2]];
    return ["universal", cat || "Other"];
  }
  var BRANDS = [
    [/mychron|\baim\b|lcu|data hub/i, "AiM"], [/rotax/i, "Rotax"], [/dellorto|vhs[bhc]/i, "Dell'Orto"], [/\bngk\b/i, "NGK"], [/vortex/i, "Vortex"],
    [/\botk\b|tony/i, "OTK"], [/\bkg\b|kc c3/i, "KG"], [/new ?-?line|newl line|newline/i, "New-Line"], [/righetti|\brr\b/i, "Righetti Ridolfi"],
    [/arai|gpv-r|skv-r|ck6/i, "Arai"], [/alpinestars|kmx/i, "Alpinestars"], [/sparco/i, "Sparco"], [/mojo/i, "Mojo"], [/\bdid\b/i, "DID"],
    [/ipk|praga/i, "IPK"], [/birel/i, "Birel"], [/\bcrg\b/i, "CRG"], [/mikuni/i, "Mikuni"], [/\bpvl\b/i, "PVL"], [/top-?kart/i, "Top-Kart"],
    [/tillett/i, "Tillett"], [/\bcomer\b|\bc5[02]\b|cx52/i, "Comer"], [/bambino|blue boy/i, "Top-Kart"], [/\bkg\b/i, "KG"],
    [/formula k/i, "Formula K"], [/mondo ?kart/i, "Mondokart"], [/nike/i, "Nike"], [/chisu|csr\b|cungu/i, "CSR"], [/freem/i, "Freem"],
  ];
  function brandOf(p) { var h = p.name + " " + (p.description || ""); for (var i = 0; i < BRANDS.length; i++) if (BRANDS[i][0].test(h)) return BRANDS[i][1]; return ""; }

  function index(products) {
    var tree = {};
    products.forEach(function (p) {
      var pl = place(p); p._dept = pl[0]; p._sub = pl[1]; p._subSlug = slug(pl[1]); p._brand = brandOf(p);
      var t = tree[p._dept] = tree[p._dept] || { count: 0, subs: {} };
      t.count++; t.subs[p._sub] = (t.subs[p._sub] || 0) + 1;
    });
    S.tree = tree;
  }
  function deptsWithStock() { return DEPTS.filter(function (d) { return S.tree && S.tree[d.id]; }); }
  function subsOf(id) { var t = S.tree[id]; return t ? Object.keys(t.subs).sort(function (a, b) { return t.subs[b] - t.subs[a] || a.localeCompare(b); }) : []; }

  /* ---------------- icons (simple line drawings) ---------------- */
  var ICON = {
    kart: '<path d="M6 34h40l6-8H30l-4-6h-8l-4 6H8z"/><circle cx="14" cy="38" r="5"/><circle cx="44" cy="38" r="5"/><path d="M26 20l3-6h6"/>',
    engine: '<rect x="14" y="16" width="26" height="22" rx="2"/><path d="M10 22h4M10 32h4M40 24h6v8h-6M20 16v-5h14v5M20 44v-6M34 44v-6"/><circle cx="27" cy="27" r="5"/>',
    piston: '<path d="M18 10h20v14H18z"/><path d="M18 15h20M18 19h20"/><path d="M24 24l-4 18M32 24l4 18"/><circle cx="28" cy="44" r="5"/>',
    wheel: '<circle cx="28" cy="28" r="17"/><circle cx="28" cy="28" r="7"/><path d="M28 11v10M28 35v10M11 28h10M35 28h10"/>',
    helmet: '<path d="M10 34c0-13 8-22 20-22 9 0 16 6 16 16v8H24l-4 6h-8z"/><path d="M26 22h18v8H28z"/>',
    gauge: '<rect x="8" y="14" width="40" height="28" rx="4"/><path d="M14 36a14 14 0 0 1 28 0"/><path d="M28 36l7-9"/>',
    oil: '<path d="M14 22h20v20H14z"/><path d="M20 22v-6h8v6M34 26l10-6 2 3-12 9"/><path d="M46 28c0 3-2 5-2 5s-2-2-2-5 2-5 2-5 2 2 2 5z"/>',
    wrench: '<path d="M40 10a9 9 0 0 0-10 12L12 40l4 4 18-18a9 9 0 0 0 12-10l-6 6-5-1-1-5z"/>',
    tyre: '<ellipse cx="22" cy="28" rx="10" ry="16"/><path d="M22 12h14c6 0 10 7 10 16s-4 16-10 16H22"/><ellipse cx="22" cy="28" rx="4" ry="7"/>',
    search: '<circle cx="24" cy="24" r="13"/><path d="M34 34l10 10"/>',
    list: '<path d="M16 18h28l-3 22H19z"/><path d="M22 18c0-5 3-8 6-8s6 3 6 8"/>',
    truck: '<path d="M6 16h26v20H6zM32 22h9l7 7v7H32"/><circle cx="14" cy="38" r="4"/><circle cx="40" cy="38" r="4"/>',
    box: '<path d="M10 18l18-8 18 8v20l-18 8-18-8z"/><path d="M10 18l18 8 18-8M28 26v20"/>',
    quote: '<path d="M14 10h20l8 8v28H14z"/><path d="M20 24h16M20 30h16M20 36h10"/>',
    phone: '<path d="M18 10l6 8-4 4a24 24 0 0 0 12 12l4-4 8 6-4 6C26 42 14 30 12 14z"/>',
    menu: '<path d="M10 16h36M10 28h36M10 40h36"/>', close: '<path d="M14 14l28 28M42 14L14 42"/>', arrow: '<path d="M12 28h30M32 18l10 10-10 10"/>',
    left: '<path d="M44 28H14M24 18L14 28l10 10"/>', plus: '<path d="M28 12v32M12 28h32"/>', minus: '<path d="M12 28h32"/>',
  };
  function icon(n, cls) { return '<svg class="' + (cls || "cs-i") + '" viewBox="0 0 56 56" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + (ICON[n] || "") + "</svg>"; }

  /* ---------------- styles ---------------- */
  var CSS = [
    ":root{--cs-ink:#1d2125;--cs-text:#16191c;--cs-muted:#6b7177;--cs-line:#e4e6e8;--cs-panel:#f3f4f5;--cs-bg:#fff;--cs-gold:#fd7a03;--cs-gold-hi:#ff9433;--cs-gold-lo:#b45309;--cs-black:#000;--cs-green:#0f8a43;--cs-green-hi:#0c7539;--cs-warn:#b86e00;--cs-max:1440px}",
    "html{-webkit-text-size-adjust:100%}",
    "body.cs{margin:0;background:var(--cs-bg);color:var(--cs-text);font:15px/1.5 'Open Sans',system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".cs *,.cs *::before,.cs *::after{box-sizing:border-box}",
    ".cs img{max-width:100%;display:block}",
    ".cs a{color:inherit;text-decoration:none}",
    ".cs button{font:inherit;cursor:pointer;color:inherit}",
    ".cs :focus-visible{outline:2px solid var(--cs-gold);outline-offset:2px}",
    ".cs-w{max-width:var(--cs-max);margin:0 auto;padding:0 40px}",
    "@media (max-width:900px){.cs-w{padding:0 16px}}",
    ".cs-i{width:22px;height:22px;flex:none}",
    ".cs [hidden]{display:none!important}",
    ".cs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    /* top strip */
    ".cs-strip{background:#151617;color:#e9ebec;font-size:13px;border-bottom:1px solid #26282a}",
    ".cs-strip .cs-w{display:flex;align-items:center;gap:28px;height:38px}",
    ".cs-strip span{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}",
    ".cs-strip .cs-i{width:18px;height:18px}",
    ".cs-strip .cs-r{margin-left:auto;display:flex;gap:16px;align-items:center}",
    ".cs-mk{display:inline-flex;gap:4px}.cs-mk a{padding:2px 10px;border-radius:3px;border:1px solid rgba(255,255,255,.2);font-weight:600}.cs-mk a.on{background:var(--cs-gold);border-color:var(--cs-gold);color:#140a00}",
    "@media (max-width:900px){.cs-strip .cs-hide{display:none}.cs-strip .cs-w{gap:14px}}",
    /* header */
    ".cs-head{background:var(--cs-black);color:#fff;border-bottom:3px solid var(--cs-gold);position:sticky;top:0;z-index:50}",
    ".cs-head>.cs-w{display:flex;align-items:center;gap:40px;height:112px}",
    ".cs-logo{display:flex;align-items:center;gap:16px;flex:none;line-height:1}",
    ".cs-logo img{height:98px;width:auto;display:block}",
    ".cs-logo small{font-size:10.5px;font-weight:800;letter-spacing:.2em;color:#e6e6e6;text-transform:uppercase;border-left:1px solid rgba(255,255,255,.3);padding-left:14px;line-height:1.5;white-space:nowrap}",
    ".cs-search{flex:1;display:flex;align-items:center;background:#1b1c1e;border:1px solid #33363a;border-radius:4px;height:50px;max-width:780px;color:#fff}",
    ".cs-search input{flex:1;border:0;background:transparent;height:100%;padding:0 18px;font:inherit;font-size:15px;color:#fff;min-width:0}.cs-search input::placeholder{color:#9aa0a6}",
    ".cs-search input:focus{outline:none}.cs-search:focus-within{border-color:var(--cs-gold);background:#232427}",
    ".cs-search button{border:0;background:none;padding:0 16px;height:100%;display:grid;place-items:center}",
    ".cs-tools{display:flex;align-items:center;gap:22px;margin-left:auto;flex:none}",
    ".cs-vat{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12.5px;color:#b5babf}",
    ".cs-vat div{display:flex}.cs-vat button{border:1px solid #3a3d41;background:transparent;color:#d8dbde;padding:5px 9px;font-size:12px;font-weight:700}",
    ".cs-vat button[aria-pressed=true]{background:var(--cs-gold);border-color:var(--cs-gold);color:#140a00}",
    ".cs-tool{display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;font-size:12.5px;position:relative;padding:0}",
    ".cs-tool .cs-i{width:28px;height:28px}",
    ".cs-badge{position:absolute;top:-6px;right:-2px;background:var(--cs-gold);color:#140a00;font-size:11px;font-weight:800;min-width:20px;height:20px;border-radius:10px;display:grid;place-items:center;padding:0 5px}",
    ".cs-burger{display:none}",
    "@media (max-width:1100px){.cs-vat{display:none}.cs-head>.cs-w{gap:20px}}",
    "@media (max-width:900px){.cs-head>.cs-w{flex-wrap:wrap;height:auto;padding-top:12px;padding-bottom:12px;gap:12px}.cs-search{order:3;flex:1 1 100%;height:44px}.cs-burger{display:flex}.cs-logo img{height:56px}.cs-logo small{display:none}}",
    /* category bar */
    ".cs-nav{background:#fff;border-bottom:1px solid var(--cs-line);position:relative;z-index:40}",
    ".cs-nav>.cs-w{display:flex;align-items:stretch;height:56px}",
    ".cs-all{display:flex;align-items:center;gap:12px;border:0;border-right:1px solid var(--cs-line);background:none;font-weight:700;padding:0 28px 0 0;margin-right:24px;min-width:210px}",
    ".cs-all .cs-i{width:20px;height:20px}.cs-all .cs-plus{margin-left:auto}",
    ".cs-cats{display:flex;align-items:center;gap:28px;overflow:hidden;flex:1;list-style:none;margin:0;padding:0}",
    ".cs-cats a{font-weight:700;font-size:14.5px;white-space:nowrap;padding:16px 0;border-bottom:2px solid transparent}",
    ".cs-cats a:hover,.cs-cats a[aria-current=page]{border-bottom-color:var(--cs-gold)}",
    ".cs-nav .cs-instock{margin-left:auto;font-weight:700;font-size:14.5px;display:flex;align-items:center;color:var(--cs-green);white-space:nowrap;padding-left:24px}",
    "@media (max-width:900px){.cs-nav{display:none}}",
    /* mega menu */
    ".cs-mega{position:absolute;left:0;right:0;top:100%;background:#fff;border-bottom:1px solid var(--cs-line);box-shadow:0 18px 30px rgba(0,0,0,.08);z-index:49;display:none}",
    ".cs-mega.open{display:block}",
    ".cs-mega .cs-w{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:28px 40px;padding-top:28px;padding-bottom:32px}",
    ".cs-mega h4{margin:0 0 10px;font-size:15px;font-weight:800}.cs-mega h4 a:hover{color:var(--cs-gold-lo)}",
    ".cs-mega ul{list-style:none;margin:0;padding:0}.cs-mega li a{display:flex;justify-content:space-between;font-size:14px;color:#3a3f44;padding:4px 0}.cs-mega li a:hover{color:var(--cs-text);text-decoration:underline}",
    ".cs-mega li small{color:var(--cs-muted)}",
    /* mobile menu */
    ".cs-mob{position:fixed;inset:0;z-index:90;display:none}.cs-mob.open{display:block}",
    ".cs-mob .cs-scrim{position:absolute;inset:0;background:rgba(15,18,20,.5)}",
    ".cs-mob nav{position:absolute;left:0;top:0;bottom:0;width:min(360px,88%);background:#fff;overflow-y:auto;padding:16px 0}",
    ".cs-mob nav{padding-top:0!important}.cs-mob nav header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#000;color:#fff;border-bottom:3px solid var(--cs-gold)}.cs-mob nav header img{height:52px;width:auto}",
    ".cs-mob details{border-bottom:1px solid var(--cs-line)}.cs-mob summary{list-style:none;padding:14px 16px;font-weight:700;display:flex;justify-content:space-between;cursor:pointer}",
    ".cs-mob summary::-webkit-details-marker{display:none}.cs-mob details a{display:block;padding:9px 28px;font-size:14px}",
    /* hero */
    ".cs-hero{margin-top:24px;background:var(--cs-panel);display:grid;grid-template-columns:1.05fr 1fr;align-items:center;min-height:420px;overflow:hidden;position:relative}",
    ".cs-hero .cs-copy{padding:56px 48px}",
    ".cs-eyebrow{display:flex;align-items:center;gap:12px;font-size:11.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#3a3f44}",
    ".cs-eyebrow::before{content:'';width:24px;height:3px;background:var(--cs-gold)}",
    ".cs-hero h1{font-size:clamp(36px,5.2vw,72px);line-height:1;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;margin:22px 0 22px}",
    ".cs-hero h1 em{font-style:normal;color:var(--cs-gold)}",
    ".cs-hero p{margin:0;color:#4a5056;font-size:16px;max-width:42ch}",
    ".cs-ctas{display:flex;flex-wrap:wrap;align-items:center;gap:24px;margin-top:30px}",
    ".cs-btn{display:inline-flex;align-items:center;justify-content:center;gap:14px;border:0;border-radius:3px;padding:15px 22px;font-weight:700;font-size:15px}",
    ".cs-btn .cs-i{width:18px;height:18px}",
    ".cs-btn.gold{background:var(--cs-gold);color:#140a00}.cs-btn.gold:hover{background:var(--cs-gold-hi)}",
    ".cs-btn.dark{background:var(--cs-ink);color:#fff}.cs-btn.dark:hover{background:#000}",
    ".cs-btn.light{background:#fff;color:var(--cs-ink)}",
    ".cs-btn.green{background:var(--cs-green);color:#fff}.cs-btn.green:hover{background:var(--cs-green-hi)}",
    ".cs-link{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:14px}.cs-link .cs-i{width:16px;height:16px}",
    ".cs-collage{position:relative;height:100%;min-height:420px}",
    ".cs-collage figure{position:absolute;margin:0;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.12)}",
    ".cs-collage img{width:100%;height:100%;object-fit:contain;padding:14px}",
    ".cs-collage .a{width:46%;aspect-ratio:1;left:6%;top:16%}.cs-collage .b{width:38%;aspect-ratio:1;left:48%;top:6%}.cs-collage .c{width:34%;aspect-ratio:1;left:56%;top:52%}",
    ".cs-ghost{position:absolute;right:28px;top:18px;font-weight:800;font-size:clamp(60px,9vw,150px);line-height:1;color:rgba(0,0,0,.06);letter-spacing:-.04em;pointer-events:none}",
    "@media (max-width:900px){.cs-hero{grid-template-columns:1fr;min-height:0}.cs-hero .cs-copy{padding:36px 22px}.cs-collage{min-height:260px}}",
    ".cs-band{background:var(--cs-ink);color:#cfd3d6;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;display:flex;justify-content:space-between;padding:14px 24px;font-weight:700}",
    ".cs-band b{color:#fff;margin-right:12px}",
    /* usp row */
    ".cs-usps{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--cs-line)}",
    ".cs-usps div{display:flex;gap:14px;align-items:center;padding:22px 24px}.cs-usps div+div{border-left:1px solid var(--cs-line)}",
    ".cs-usps .cs-i{width:30px;height:30px}.cs-usps b{display:block;font-size:14.5px}.cs-usps small{color:var(--cs-muted);font-size:12.5px}",
    "@media (max-width:900px){.cs-usps{grid-template-columns:1fr 1fr}.cs-usps div:nth-child(3){border-left:0}.cs-usps div{padding:16px 10px}}",
    /* sections */
    ".cs-sec{margin:56px 0}",
    ".cs-sech{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px}",
    ".cs-sech h2{margin:6px 0 0;font-size:clamp(24px,2.6vw,34px);font-weight:800;letter-spacing:-.01em}",
    ".cs-kick{font-size:11.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#3a3f44}",
    ".cs-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:20px 22px}",
    "@media (max-width:1100px){.cs-tiles{grid-template-columns:repeat(3,1fr)}}@media (max-width:600px){.cs-tiles{grid-template-columns:repeat(2,1fr);gap:14px}}",
    ".cs-tile{display:block}",
    ".cs-tile .cs-tb{background:var(--cs-panel);aspect-ratio:1.9;display:grid;place-items:center;color:var(--cs-gold-lo);transition:background .15s}",
    ".cs-tile:hover .cs-tb{background:#eaebec}",
    ".cs-tile .cs-tb .cs-i{width:76px;height:76px;stroke-width:1.8}",
    ".cs-tile .cs-tb img{width:100%;height:100%;object-fit:contain;padding:14px;mix-blend-mode:multiply}",
    ".cs-tile .cs-tl{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-weight:700;font-size:15px}",
    ".cs-tile small{display:block;color:var(--cs-muted);font-size:12.5px;margin-top:2px}",
    ".cs-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}",
    "@media (max-width:1000px){.cs-cols{grid-template-columns:1fr 1fr}}@media (max-width:640px){.cs-cols{grid-template-columns:1fr}}",
    ".cs-col{background:var(--cs-panel);border-top:3px solid var(--cs-ink);padding:24px 28px 18px}",
    ".cs-col h3{margin:0 0 14px;padding-bottom:14px;border-bottom:1px solid #dcdfe1;font-size:19px;font-weight:800}",
    ".cs-col ul{list-style:none;margin:0;padding:0}.cs-col li a{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:14.5px;color:#30353a}",
    ".cs-col li a:hover{color:var(--cs-text);text-decoration:underline}.cs-col .cs-i{width:15px;height:15px;color:var(--cs-muted)}",
    ".cs-brands{background:var(--cs-panel);padding:36px 0;margin:56px 0}",
    ".cs-brands h2{margin:0 0 22px;font-size:24px;font-weight:800}",
    ".cs-brandgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}",
    ".cs-brandgrid a{background:#fff;height:70px;display:grid;place-items:center;font-weight:800;font-size:17px;letter-spacing:.02em;color:#2a2f33;border:1px solid var(--cs-line);text-align:center;padding:0 10px}",
    ".cs-brandgrid a:hover{border-color:var(--cs-ink)}.cs-brandgrid small{display:block;font-size:11px;font-weight:600;color:var(--cs-muted)}",
    /* product cards & carousels */
    ".cs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px}",
    "@media (max-width:600px){.cs-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}",
    ".cs-row{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 80px)/5);gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:4px}",
    ".cs-row::-webkit-scrollbar{display:none}.cs-row>*{scroll-snap-align:start}",
    "@media (max-width:1100px){.cs-row{grid-auto-columns:calc((100% - 40px)/3)}}@media (max-width:600px){.cs-row{grid-auto-columns:72%}}",
    ".cs-arrows{display:flex;gap:10px}.cs-arrows button{width:42px;height:42px;border:1px solid var(--cs-line);background:#fff;display:grid;place-items:center}.cs-arrows .cs-i{width:18px;height:18px}",
    ".cs-card{border:1px solid var(--cs-line);background:#fff;display:flex;flex-direction:column;min-width:0}",
    ".cs-card .cs-shot{display:block;aspect-ratio:1;padding:24px;background:#fff;position:relative}",
    ".cs-card .cs-shot img{width:100%;height:100%;object-fit:contain;transition:transform .2s}",
    ".cs-card:hover .cs-shot img{transform:scale(1.04)}",
    ".cs-ph{width:100%;height:100%;display:grid;place-items:center;background:var(--cs-panel);color:#b9bec2;font-weight:800;font-size:30px;letter-spacing:.06em}",
    ".cs-card .cs-cb{padding:4px 16px 16px;display:flex;flex-direction:column;flex:1}",
    ".cs-brand{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--cs-muted);min-height:17px}",
    ".cs-card h3{margin:10px 0 0;font-size:15px;font-weight:700;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.7em}",
    ".cs-card h3 a:hover{text-decoration:underline}",
    ".cs-price{margin-top:12px;font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}",
    ".cs-price small{font-size:12px;font-weight:400;color:var(--cs-muted);margin-left:6px}",
    ".cs-opt{margin-top:10px;width:100%;height:38px;border:1px solid var(--cs-line);border-radius:2px;padding:0 10px;font:inherit;font-size:14px;background:#fff}",
    ".cs-buy{display:flex;gap:8px;margin-top:14px}.cs-buy input{width:48px;height:42px;border:1px solid var(--cs-line);text-align:center;font:inherit;font-size:14px;border-radius:2px}",
    ".cs-buy .cs-btn{flex:1;padding:0 10px;height:42px;font-size:14px}",
    ".cs-buy .cs-btn.added{background:var(--cs-ink)}",
    ".cs-av{display:flex;align-items:center;justify-content:center;gap:7px;font-size:13px;margin-top:10px}",
    ".cs-av::before{content:'';width:9px;height:9px;border-radius:50%;background:var(--cs-green)}",
    ".cs-av.low::before{background:var(--cs-warn)}.cs-av.out::before{background:#9aa0a6}",
    ".cs-spacer{flex:1}",
    "@media (max-width:600px){.cs-card .cs-shot{padding:12px}.cs-card .cs-cb{padding:2px 10px 12px}.cs-card h3{font-size:13.5px}.cs-price{font-size:16px}.cs-buy input{display:none}.cs-buy .cs-btn{font-size:13px}}",
    /* promos */
    ".cs-promos{display:grid;grid-template-columns:1fr 1fr;gap:24px}",
    "@media (max-width:900px){.cs-promos{grid-template-columns:1fr}}",
    ".cs-promo{display:grid;grid-template-columns:1fr 1fr;align-items:center;min-height:300px;overflow:hidden}",
    ".cs-promo.dark{background:var(--cs-ink);color:#fff}.cs-promo.light{background:var(--cs-panel)}",
    ".cs-promo .cs-pc{padding:36px}.cs-promo h3{font-size:clamp(26px,2.6vw,38px);line-height:1.05;margin:12px 0;font-weight:800}",
    ".cs-promo p{margin:0 0 22px;opacity:.85}.cs-promo .cs-eyebrow{color:inherit}",
    ".cs-promo .cs-pi{height:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px}",
    ".cs-promo .cs-pi img{width:100%;height:100%;object-fit:contain;background:#fff;padding:10px}",
    "@media (max-width:600px){.cs-promo{grid-template-columns:1fr}.cs-promo .cs-pi{height:200px}}",
    /* help + faq */
    ".cs-help{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}",
    ".cs-help h2{margin:8px 0;font-size:clamp(24px,2.4vw,32px);font-weight:800}.cs-help p{margin:0;color:var(--cs-muted)}",
    ".cs-help .cs-hc{text-align:right}.cs-help .cs-hc b{display:block;font-size:30px;font-weight:800}.cs-help .cs-hc small{display:block;color:var(--cs-muted);margin:4px 0 8px}",
    "@media (max-width:640px){.cs-help .cs-hc{text-align:left}}",
    ".cs-faq{display:grid;grid-template-columns:1fr 2fr;gap:40px}",
    ".cs-faq h2{margin:8px 0;font-size:34px;font-weight:800}",
    ".cs-faq details{border-bottom:1px solid var(--cs-line)}.cs-faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:20px 0;font-weight:700;font-size:16px}",
    ".cs-faq summary::-webkit-details-marker{display:none}.cs-faq summary .cs-i{width:18px;height:18px}.cs-faq details[open] .cs-plusi{display:none}.cs-faq details:not([open]) .cs-minusi{display:none}",
    ".cs-faq details p{margin:0 0 20px;color:#4a5056;max-width:70ch}",
    "@media (max-width:900px){.cs-faq{grid-template-columns:1fr;gap:10px}}",
    /* footer */
    ".cs-foot{background:var(--cs-black);color:#b9bec2;margin-top:72px;font-size:14px;border-top:3px solid var(--cs-gold)}",
    ".cs-foot .cs-fu{display:grid;grid-template-columns:repeat(4,1fr);gap:28px;padding:40px 0;border-bottom:1px solid rgba(255,255,255,.1)}",
    ".cs-foot .cs-fu b{display:flex;gap:10px;align-items:center;color:#fff;margin-bottom:8px}.cs-foot .cs-fu .cs-i{width:22px;height:22px}",
    ".cs-foot .cs-fu p{margin:0;font-size:13px;line-height:1.6}",
    ".cs-foot .cs-fc{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.2fr;gap:28px;padding:40px 0}",
    ".cs-foot h4{color:#fff;margin:0 0 14px;font-size:15px}.cs-foot .cs-fc a{display:block;padding:4px 0}.cs-foot a:hover{color:#fff}",
    ".cs-foot .cs-logo img{height:110px}.cs-foot .cs-big{font-size:24px;font-weight:800;color:#fff;margin-bottom:6px}",
    ".cs-foot .cs-legal{border-top:1px solid rgba(255,255,255,.1);padding:18px 0 26px;font-size:12.5px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}",
    "@media (max-width:900px){.cs-foot .cs-fu,.cs-foot .cs-fc{grid-template-columns:1fr 1fr}}@media (max-width:560px){.cs-foot .cs-fu,.cs-foot .cs-fc{grid-template-columns:1fr}}",
    /* listing page */
    ".cs-crumbs{display:flex;flex-wrap:wrap;gap:8px;font-size:13px;color:var(--cs-muted);margin:24px 0 10px}.cs-crumbs a:hover{color:var(--cs-text)}.cs-crumbs b{color:var(--cs-green);font-weight:600}",
    ".cs-h1{font-size:clamp(28px,3vw,40px);font-weight:800;margin:6px 0 26px;letter-spacing:-.01em}",
    ".cs-subtiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px;margin-bottom:40px}",
    ".cs-subtile{border:1px solid var(--cs-line);display:flex;flex-direction:column}",
    ".cs-subtile .cs-tb{aspect-ratio:1.35;display:grid;place-items:center;padding:18px;color:var(--cs-gold-lo)}.cs-subtile .cs-tb img{width:100%;height:100%;object-fit:contain}.cs-subtile .cs-tb .cs-i{width:60px;height:60px}",
    ".cs-subtile .cs-tl{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-top:1px solid var(--cs-line);font-weight:700}",
    ".cs-subtile .cs-tl small{color:var(--cs-muted);font-weight:400;margin-left:6px}.cs-subtile .cs-i.sm{width:16px;height:16px}",
    ".cs-subtile:hover{border-color:var(--cs-ink)}",
    "@media (max-width:600px){.cs-subtiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:28px}.cs-subtile .cs-tb{aspect-ratio:1.2;padding:10px}.cs-subtile .cs-tl{padding:10px;font-size:13.5px}}",
    ".cs-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:14px 20px;padding:14px 0;border-top:1px solid var(--cs-line);border-bottom:1px solid var(--cs-line);margin-bottom:22px;font-size:14px}",
    ".cs-toolbar select{height:38px;border:1px solid var(--cs-line);border-radius:2px;padding:0 10px;font:inherit;font-size:14px;background:#fff}",
    ".cs-toolbar label{display:flex;align-items:center;gap:8px}.cs-toolbar .cs-count{color:var(--cs-muted);margin-right:auto}",
    ".cs-pager{display:flex;justify-content:center;gap:8px;margin-top:36px}.cs-pager button{min-width:42px;height:42px;border:1px solid var(--cs-line);background:#fff;font-weight:700}",
    ".cs-pager button[aria-current=page]{background:var(--cs-ink);color:#fff;border-color:var(--cs-ink)}.cs-pager button:disabled{opacity:.35;cursor:default}",
    ".cs-empty{padding:60px 0;text-align:center;color:var(--cs-muted)}.cs-empty h3{color:var(--cs-text);margin:0 0 6px}",
    /* product page */
    ".cs-pdp{display:grid;grid-template-columns:1.1fr 1fr;gap:56px;margin-bottom:40px}",
    "@media (max-width:900px){.cs-pdp{grid-template-columns:1fr;gap:24px}}",
    ".cs-gal .cs-main{border:1px solid var(--cs-line);aspect-ratio:1;display:grid;place-items:center;padding:36px}.cs-gal .cs-main img{width:100%;height:100%;object-fit:contain}",
    ".cs-thumbs{display:flex;gap:10px;margin-top:12px;overflow-x:auto}.cs-thumbs button{flex:0 0 80px;height:80px;border:1px solid var(--cs-line);background:#fff;padding:6px}.cs-thumbs button[aria-current=true]{border-color:var(--cs-ink)}.cs-thumbs img{width:100%;height:100%;object-fit:contain}",
    ".cs-info .cs-brand{font-size:12.5px}.cs-info h1{font-size:clamp(24px,2.6vw,34px);margin:10px 0 6px;font-weight:800;line-height:1.2}",
    ".cs-info .cs-sku{color:var(--cs-muted);font-size:13px}",
    ".cs-info .cs-price{font-size:30px;margin-top:22px}.cs-info .cs-alt{color:var(--cs-muted);font-size:13px}",
    ".cs-info .cs-av{justify-content:flex-start;font-size:14px;margin-top:14px}",
    ".cs-info .cs-buy{max-width:420px;margin-top:22px}.cs-info .cs-buy input{height:50px;width:64px}.cs-info .cs-buy .cs-btn{height:50px;font-size:15px}",
    ".cs-info .cs-opt{max-width:420px;height:44px}",
    ".cs-desc{margin-top:28px;padding-top:22px;border-top:1px solid var(--cs-line);white-space:pre-line;color:#33383d}",
    ".cs-facts{margin-top:22px;display:grid;gap:8px;font-size:14px;color:#4a5056}.cs-facts div{display:flex;gap:10px;align-items:center}.cs-facts .cs-i{width:20px;height:20px;color:var(--cs-gold-lo)}",
    /* drawer + modal */
    ".cs-scrim{position:fixed;inset:0;background:rgba(15,18,20,.5);z-index:95;opacity:0;pointer-events:none;transition:opacity .18s}.cs-scrim.open{opacity:1;pointer-events:auto}",
    ".cs-drawer{position:fixed;top:0;right:0;bottom:0;width:min(460px,100%);background:#fff;z-index:96;display:flex;flex-direction:column;transform:translateX(105%);transition:transform .22s ease;box-shadow:-10px 0 40px rgba(0,0,0,.2)}",
    ".cs-drawer.open{transform:none}",
    ".cs-drawer header,.cs-modal header{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--cs-line)}",
    ".cs-drawer h3,.cs-modal h3{margin:0;font-size:18px;font-weight:800}",
    ".cs-x{border:0;background:none;padding:4px;display:grid;place-items:center}",
    ".cs-items{flex:1;overflow-y:auto;padding:4px 22px}",
    ".cs-line{display:grid;grid-template-columns:64px 1fr auto;gap:12px;padding:16px 0;border-bottom:1px solid var(--cs-line)}",
    ".cs-line .cs-lt{width:64px;height:64px;border:1px solid var(--cs-line);padding:4px}.cs-line .cs-lt img{width:100%;height:100%;object-fit:contain}.cs-line .cs-lt .cs-ph{font-size:16px}",
    ".cs-line b{display:block;font-size:14px;line-height:1.35}.cs-line small{display:block;color:var(--cs-muted);font-size:12.5px;margin-top:2px}",
    ".cs-qty{display:flex;align-items:center;gap:4px;margin-top:8px}.cs-qty button{width:30px;height:30px;border:1px solid var(--cs-line);background:#fff;font-weight:700}.cs-qty input{width:48px;height:30px;border:1px solid var(--cs-line);text-align:center;font:inherit}",
    ".cs-rm{border:0;background:none;color:#b42318;font-size:12.5px;font-weight:700;padding:0;margin-left:10px}",
    ".cs-drawer footer{border-top:1px solid var(--cs-line);padding:18px 22px}",
    ".cs-total{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}.cs-total b{font-size:22px;font-weight:800}",
    ".cs-note{font-size:12.5px;color:var(--cs-muted);margin:10px 0 0}",
    ".cs-modal{position:fixed;inset:0;z-index:97;display:none;align-items:center;justify-content:center;padding:16px}.cs-modal.open{display:flex}",
    ".cs-modal .cs-box{background:#fff;width:min(620px,100%);max-height:calc(100vh - 32px);overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)}",
    ".cs-modal .cs-mb{padding:22px}",
    ".cs-sum{background:var(--cs-panel);padding:12px 14px;font-size:14px;margin-bottom:18px}",
    ".cs-form{display:grid;grid-template-columns:1fr 1fr;gap:14px}.cs-form .w{grid-column:1/-1}",
    ".cs-form label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:700}",
    ".cs-form input,.cs-form textarea{border:1px solid var(--cs-line);border-radius:2px;padding:11px 12px;font:inherit;font-size:14px;width:100%}",
    ".cs-form input:focus,.cs-form textarea:focus{outline:none;border-color:var(--cs-ink)}",
    ".cs-form textarea{min-height:90px;resize:vertical}",
    "@media (max-width:560px){.cs-form{grid-template-columns:1fr}}",
    ".cs-err{background:#fef3f2;border:1px solid #fecdca;color:#b42318;padding:10px 12px;font-size:13.5px}",
    ".cs-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}",
    ".cs-done{text-align:center;padding:10px 0}.cs-done .cs-tick{width:60px;height:60px;border-radius:50%;background:#dcf5e6;color:var(--cs-green);display:grid;place-items:center;font-size:30px;margin:0 auto 14px}",
    ".cs-done .cs-ref{font-size:24px;font-weight:800;margin:6px 0}.cs-done a{color:var(--cs-gold-lo);font-weight:700}",
    ".cs-skel{background:linear-gradient(90deg,#eef0f2 25%,#f7f8f9 50%,#eef0f2 75%);background-size:400% 100%;animation:cs-sk 1.3s infinite}",
    "@keyframes cs-sk{0%{background-position:100% 0}100%{background-position:-100% 0}}",
    "@media (prefers-reduced-motion:reduce){.cs *{transition:none!important;animation:none!important}}",
  ].join("\n");

  /* ---------------- shell ---------------- */
  function shell() {
    // turn off the old stylesheet and fonts the page shipped with; this script styles everything
    $$('link[rel="stylesheet"]').forEach(function (l) { if (/styles\.css/.test(l.href)) l.disabled = true; });
    var f = document.createElement("link"); f.rel = "stylesheet"; f.href = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap"; document.head.appendChild(f);
    var st = document.createElement("style"); st.id = "cs-style"; st.textContent = CSS; document.head.appendChild(st);
    $$('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach(function (l) { l.parentNode.removeChild(l); });
    [["icon", "32x32", "csr-icon-32.png"], ["apple-touch-icon", "180x180", "csr-icon-180.png"]].forEach(function (x) { var l = document.createElement("link"); l.rel = x[0]; l.sizes = x[1]; l.type = "image/png"; l.href = API + "/brand/" + x[2]; document.head.appendChild(l); });
    var tc = $('meta[name="theme-color"]'); if (tc) tc.content = "#000000";
    document.body.className = "cs";
    var other = STORE === "sa" ? "ke" : "sa";
    document.body.innerHTML =
      '<a class="cs-sr" href="#cs-main">Skip to products</a>' +
      '<div class="cs-strip"><div class="cs-w">' +
        "<span>" + icon("truck") + esc(INFO.ship) + "</span>" +
        '<span class="cs-hide" data-cs="partcount">' + icon("box") + "Kart parts in stock</span>" +
        '<span class="cs-hide">' + icon("quote") + "Prices confirmed on quote</span>" +
        '<div class="cs-r"><span class="cs-mk" aria-label="Choose store"><a href="' + SITES.sa + '" class="' + (STORE === "sa" ? "on" : "") + '">South Africa</a><a href="' + SITES.ke + '" class="' + (STORE === "ke" ? "on" : "") + '">Kenya</a></span>' +
        '<a class="cs-hide" href="tel:' + INFO.phone.replace(/\s/g, "") + '">' + esc(INFO.phone) + "</a></div>" +
      "</div></div>" +
      '<header class="cs-head"><div class="cs-w">' +
        '<button class="cs-tool cs-burger" type="button" data-cs="burger" aria-label="Open menu">' + icon("menu") + "</button>" +
        '<a class="cs-logo" href="#/" aria-label="CSR Kart Parts ' + esc(INFO.country) + ' store home">' + logoImg(98) + "<small>" + esc(INFO.country) + "<br>store</small></a>" +
        '<form class="cs-search" role="search" data-cs="search"><label class="cs-sr" for="cs-q">Search</label><input id="cs-q" type="search" placeholder="Search products, brands or part numbers" autocomplete="off"><button type="submit" aria-label="Search">' + icon("search") + "</button></form>" +
        '<div class="cs-tools"><div class="cs-vat"><div role="group" aria-label="Show prices"><button type="button" data-vat="1">' + (STORE === "ke" ? "KES" : "R") + ' Incl. VAT</button><button type="button" data-vat="0">' + (STORE === "ke" ? "KES" : "R") + " Excl. VAT</button></div>" + esc(INFO.country) + " · VAT " + INFO.vat + "</div>" +
        '<button class="cs-tool" type="button" data-cs="open-list" aria-label="My list">' + icon("list") + '<span>My list</span><span class="cs-badge" data-cs="count" hidden>0</span></button></div>' +
      "</div>" +
      "</header>" +
      '<nav class="cs-nav" aria-label="Product categories"><div class="cs-w">' +
        '<button class="cs-all" type="button" data-cs="all" aria-expanded="false" aria-controls="cs-mega">' + icon("menu") + 'All products<span class="cs-plus">' + icon("plus") + "</span></button>" +
        '<ul class="cs-cats" data-cs="cats"></ul><a class="cs-instock" href="#/stock">In stock now</a>' +
      '</div><div class="cs-mega" data-cs="mega" id="cs-mega"><div class="cs-w"></div></div></nav>' +
      '<div class="cs-mob" data-cs="mob"><div class="cs-scrim" data-cs="mob-close"></div><nav aria-label="Menu"><header><span class="cs-logo">' + logoImg(52) + '</span><button class="cs-x" type="button" data-cs="mob-close" aria-label="Close menu">' + icon("close") + '</button></header><div data-cs="mob-list"></div></nav></div>' +
      '<main id="cs-main" tabindex="-1"><div class="cs-w" data-cs="view"><div class="cs-hero cs-skel" style="margin-top:24px"></div></div></main>' +
      footer(other) +
      '<div class="cs-scrim" data-cs="scrim"></div>' +
      '<aside class="cs-drawer" data-cs="drawer" role="dialog" aria-modal="true" aria-labelledby="cs-lt"><header><h3 id="cs-lt">My list</h3><button class="cs-x" type="button" data-cs="close-list" aria-label="Close">' + icon("close") + '</button></header><div class="cs-items" data-cs="items"></div>' +
        '<footer><div class="cs-total"><span>Estimated total</span><b data-cs="total">—</b></div><button class="cs-btn gold" style="width:100%" type="button" data-cs="to-quote" disabled>Request a quote</button><p class="cs-note">No payment is taken here. We reply by email with availability, the final price and how to pay.</p></footer></aside>' +
      '<div class="cs-modal" data-cs="modal" role="dialog" aria-modal="true" aria-labelledby="cs-mt"><div class="cs-box"><header><h3 id="cs-mt" data-cs="mtitle"></h3><button class="cs-x" type="button" data-cs="close-modal" aria-label="Close">' + icon("close") + '</button></header><div class="cs-mb" data-cs="mbody"></div></div></div>';
  }
  function footer(other) {
    return '<footer class="cs-foot"><div class="cs-w">' +
      '<div class="cs-fu"><div><b>' + icon("truck") + esc(INFO.ship) + "</b><p>" + esc(INFO.collect) + ", or we courier to you. Delivery is arranged with your quote.</p></div>" +
      "<div><b>" + icon("phone") + esc(INFO.phone) + "</b><p>Questions about a part, a setup or what fits your kart? Call, WhatsApp or email - we answer within a working day.</p></div>" +
      "<div><b>" + icon("quote") + "Quote first, pay after</b><p>Send your list and we confirm availability, the final price and how to pay. No payment is taken on this site.</p></div>" +
      "<div><b>" + icon("box") + "The team's own parts</b><p>The same parts and kit our own race team runs, stocked through the season.</p></div></div>" +
      '<div class="cs-fc"><div><a class="cs-logo" href="#/">' + logoImg(110) + "</a><p style=\"margin:16px 0 0;line-height:1.7\">Cungu Sport Racing<br>" + esc(INFO.city) + ", " + esc(INFO.country) + "</p></div>" +
      '<div><h4>Shop</h4><div data-cs="footcats"></div></div>' +
      '<div><h4>Customer service</h4><a href="#/faq">How quotes work</a><a href="#/stock">In stock now</a><a href="' + SITES[other] + '">' + (other === "ke" ? "Kenya store" : "South Africa store") + '</a><a href="https://www.cungusportracing.com" rel="noopener">Cungu Sport Racing</a></div>' +
      '<div><h4>Get in touch</h4><div class="cs-big">' + esc(INFO.phone) + '</div><a href="mailto:' + esc(INFO.email) + '">' + esc(INFO.email) + "</a>" + (INFO.wa ? '<a href="https://wa.me/' + INFO.wa + '" rel="noopener">WhatsApp</a>' : "") + "</div></div>" +
      '<div class="cs-legal"><span>© <span data-cs="yr"></span> Cungu Sport Racing · ' + esc(INFO.city) + ", " + esc(INFO.country) + "</span><span>Prices in " + (STORE === "ke" ? "KES" : "ZAR") + " · indicative and confirmed on quote</span></div>" +
      "</div></footer>";
  }

  /* ---------------- product card ---------------- */
  function shot(p, alt) { return p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="' + esc(alt ? p.name : "") + '" loading="lazy" decoding="async">' : '<span class="cs-ph">' + esc(initials(p.name)) + "</span>"; }
  function optSelect(p) { var o = opts(p); return o.length ? '<select class="cs-opt" data-opt aria-label="Size or option for ' + esc(p.name) + '">' + o.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select>" : ""; }
  function card(p) {
    var a = avail(p), href = "#/p/" + encodeURIComponent(p.sku);
    return '<article class="cs-card" data-row="' + esc(p.sku) + '"><a class="cs-shot" href="' + href + '" aria-label="' + esc(p.name) + '">' + shot(p) + "</a>" +
      '<div class="cs-cb"><div class="cs-brand">' + esc(p._brand || p._sub) + '</div><h3><a href="' + href + '">' + esc(p.name) + "</a></h3>" +
      '<div class="cs-price">' + money(priceOf(p)) + "<small>" + vatLabel() + "</small></div>" + optSelect(p) + '<div class="cs-spacer"></div>' +
      '<div class="cs-buy"><input type="number" min="1" max="999" value="1" inputmode="numeric" data-qty aria-label="Quantity of ' + esc(p.name) + '"><button type="button" class="cs-btn green" data-add="' + esc(p.sku) + '">Add to list</button></div>' +
      '<div class="cs-av ' + a.c + '">' + a.t + "</div></div></article>";
  }
  function carousel(id, kicker, title, items) {
    if (!items.length) return "";
    return '<section class="cs-sec"><div class="cs-sech"><div>' + (kicker ? '<div class="cs-kick">' + esc(kicker) + "</div>" : "") + "<h2>" + esc(title) + '</h2></div><div class="cs-arrows"><button type="button" data-scroll="' + id + '" data-dir="-1" aria-label="Scroll back">' + icon("left") + '</button><button type="button" data-scroll="' + id + '" data-dir="1" aria-label="Scroll on">' + icon("arrow") + "</button></div></div>" +
      '<div class="cs-row" id="' + id + '">' + items.map(card).join("") + "</div></section>";
  }

  /* ---------------- pages ---------------- */
  function home() {
    var ps = S.products, withPhoto = ps.filter(function (p) { return p.imageUrl; });
    var pick = function (re) { return withPhoto.filter(function (p) { return re.test(p.name); })[0]; };
    var hero = [pick(/mychron 6 2t|mychron/i), pick(/alpinestars|kmx/i), pick(/arai/i)].filter(Boolean);
    while (hero.length < 3 && withPhoto[hero.length]) hero.push(withPhoto[hero.length]);
    var depts = deptsWithStock();
    var tiles = depts.map(function (d) { return '<a class="cs-tile" href="#/c/' + d.id + '"><div class="cs-tb">' + icon(d.icon) + '</div><div class="cs-tl"><span>' + esc(d.name) + "</span>" + icon("arrow", "cs-i sm") + "</div><small>" + esc(d.sub) + "</small></a>"; }).join("");
    var cols = depts.filter(function (d) { return subsOf(d.id).length > 1 || S.tree[d.id].count > 2; }).slice(0, 6).map(function (d) {
      return '<div class="cs-col"><h3><a href="#/c/' + d.id + '">' + esc(d.name) + "</a></h3><ul>" + subsOf(d.id).slice(0, 9).map(function (s) {
        return '<li><a href="#/c/' + d.id + "/" + slug(s) + '"><span>' + esc(s) + "</span>" + icon("arrow") + "</a></li>"; }).join("") + "</ul></div>";
    }).join("");
    var brands = {}; ps.forEach(function (p) { if (p._brand && p._brand !== "CSR") brands[p._brand] = (brands[p._brand] || 0) + 1; });
    var brandTiles = Object.keys(brands).sort(function (a, b) { return brands[b] - brands[a]; }).slice(0, 14).map(function (b) { return '<a href="#/b/' + slug(b) + '">' + esc(b) + "<small>" + brands[b] + " product" + (brands[b] === 1 ? "" : "s") + "</small></a>"; }).join("");
    var rank = { in_stock: 0, low_stock: 1, on_order: 2 };
    var recommended = withPhoto.slice().sort(function (a, b) { return rank[a.availability] - rank[b.availability] || (a._dept === "kart-parts" ? -1 : 0); }).filter(function (p) { return /kart-parts|engine-parts/.test(p._dept); }).slice(0, 10);
    var popular = withPhoto.filter(function (p) { return /clothing|data|tyres/.test(p._dept); }).slice(0, 10);
    var dataImgs = withPhoto.filter(function (p) { return p._dept === "data"; }).slice(0, 2);
    var partImgs = withPhoto.filter(function (p) { return p._dept === "kart-parts"; }).slice(2, 4);
    var promo = function (cls, kick, h, p, href, btn, imgs) {
      return '<div class="cs-promo ' + cls + '"><div class="cs-pc"><div class="cs-eyebrow">' + kick + "</div><h3>" + h + "</h3><p>" + p + '</p><a class="cs-btn ' + (cls === "dark" ? "light" : "dark") + '" href="' + href + '">' + btn + icon("arrow") + "</a></div>" +
        '<div class="cs-pi">' + imgs.map(function (x) { return '<img src="' + esc(x.imageUrl) + '" alt="" loading="lazy">'; }).join("") + "</div></div>";
    };
    var parts = S.tree["kart-parts"] ? S.tree["kart-parts"].count + (S.tree["engine-parts"] ? S.tree["engine-parts"].count : 0) : 0;
    return '<section class="cs-hero"><div class="cs-copy"><div class="cs-eyebrow">CSR Kart Parts · ' + esc(INFO.country) + "</div>" +
      "<h1>Race ready<br>starts <em>here.</em></h1><p>From your first lap to the next race. Karts, parts and kit our own team runs, priced in " + (STORE === "ke" ? "shillings" : "rand") + ".</p>" +
      '<div class="cs-ctas"><a class="cs-btn gold" href="#/c/kart-parts">Explore the shop' + icon("arrow") + '</a><a class="cs-link" href="#/c/data">Discover data loggers' + icon("arrow") + "</a></div></div>" +
      '<div class="cs-collage"><div class="cs-ghost">' + (STORE === "ke" ? "KE" : "SA") + "</div>" + hero.map(function (p, i) { return '<figure class="' + "abc"[i] + '"><a href="#/p/' + encodeURIComponent(p.sku) + '"><img src="' + esc(p.imageUrl) + '" alt="' + esc(p.name) + '"></a></figure>'; }).join("") + "</div></section>" +
      '<div class="cs-band"><span><b>01</b>/ Karts. Parts. Performance.</span><a href="#/stock">Your next session starts here →</a></div>' +
      '<div class="cs-usps"><div>' + icon("truck") + "<span><b>" + esc(INFO.ship) + "</b><small>" + esc(INFO.collect) + "</small></span></div><div>" + icon("box") + "<span><b>" + ps.length + " products</b><small>" + parts + " kart & engine parts</small></span></div><div>" + icon("quote") + "<span><b>Quote first, pay after</b><small>No payment taken online</small></span></div><div>" + icon("phone") + "<span><b>People who know karting</b><small>" + esc(INFO.phone) + "</small></span></div></div>" +
      '<section class="cs-sec"><div class="cs-sech"><div><div class="cs-kick">Find your next upgrade</div><h2>Every part of karting.</h2></div></div><div class="cs-tiles">' + tiles + "</div></section>" +
      '<section class="cs-sec"><div class="cs-sech"><div><div class="cs-kick">Karting parts · Racewear · Accessories</div><h2>Parts &amp; equipment</h2></div></div><div class="cs-cols">' + cols + "</div></section>" +
      (brandTiles ? '</div><section class="cs-brands"><div class="cs-w"><h2>Brands</h2><div class="cs-brandgrid">' + brandTiles + '</div></div></section><div class="cs-w">' : "") +
      carousel("cs-rec", "", "Recommended for you", recommended) +
      carousel("cs-pop", "", "Kit & data", popular) +
      '<section class="cs-sec cs-promos">' +
        (dataImgs.length ? promo("dark", "Data & laptimers", "Every lap.<br>In detail.", "Explore MyChron loggers and sensors.", "#/c/data", "Explore data loggers", dataImgs) : "") +
        (partImgs.length ? promo("light", "Kart parts", "The right part.<br>Right here.", "Brakes, wheels, bodywork and chassis parts for your kart.", "#/c/kart-parts", "Shop kart parts", partImgs) : "") +
      "</section>" +
      '<section class="cs-sec cs-help"><div><div class="cs-kick">A little help from the paddock</div><h2>Not sure which part you need?</h2><p>Get in touch. We\'re here to help you find it.</p></div><div class="cs-hc"><b>' + esc(INFO.phone) + "</b><small>Weekdays 08:00–17:00</small><a class=\"cs-link\" href=\"mailto:" + esc(INFO.email) + '">' + esc(INFO.email) + icon("arrow") + "</a></div></section>" +
      faq();
  }
  function faq() {
    var q = [
      ["How do I order?", "Add parts to My list and press Request a quote. We reply by email or phone with availability, the final price and how to pay. Nothing is charged on this site."],
      ["How long does delivery take?", "Parts in stock go out within a few working days. Parts on order show an estimate on the product (usually about 6 weeks for imported parts)."],
      ["Can I collect?", INFO.collect + ". Courier delivery is also available - we confirm the cost with your quote."],
      ["Are the prices final?", "Prices include VAT at " + INFO.vat + " and are indicative. They are confirmed on your quote, as supplier prices and exchange rates move."],
      ["Which part fits my kart or engine?", "Tell us your chassis and engine in the message on your quote request, or call " + INFO.phone + ". We run the same parts on our own karts."],
    ];
    return '<section class="cs-sec cs-faq" id="cs-faq"><div><div class="cs-kick">Customer service</div><h2>FAQ</h2></div><div>' +
      q.map(function (x) { return "<details><summary>" + esc(x[0]) + '<span class="cs-plusi">' + icon("plus") + '</span><span class="cs-minusi">' + icon("minus") + "</span></summary><p>" + esc(x[1]) + "</p></details>"; }).join("") + "</div></section>";
  }
  function sortList(ps) {
    var rank = { in_stock: 0, low_stock: 1, on_order: 2 };
    return ps.slice().sort(function (a, b) {
      if (S.sort === "price-asc") return a.price - b.price;
      if (S.sort === "price-desc") return b.price - a.price;
      if (S.sort === "stock") return rank[a.availability] - rank[b.availability] || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }
  function listing(title, crumbs, ps, intro) {
    var shown = sortList(S.stockOnly ? ps.filter(function (p) { return p.availability !== "on_order"; }) : ps);
    var pages = Math.max(1, Math.ceil(shown.length / PER_PAGE)); if (S.page > pages) S.page = pages;
    var from = (S.page - 1) * PER_PAGE, slice = shown.slice(from, from + PER_PAGE);
    var pager = "";
    if (pages > 1) {
      var b = ['<button type="button" data-page="' + (S.page - 1) + '" aria-label="Previous page"' + (S.page === 1 ? " disabled" : "") + ">‹</button>"];
      for (var i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - S.page) <= 1) b.push('<button type="button" data-page="' + i + '"' + (i === S.page ? ' aria-current="page"' : "") + ">" + i + "</button>"); else if (b[b.length - 1] !== "…") b.push("…");
      b.push('<button type="button" data-page="' + (S.page + 1) + '" aria-label="Next page"' + (S.page === pages ? " disabled" : "") + ">›</button>");
      pager = '<div class="cs-pager">' + b.map(function (x) { return x === "…" ? "<span>…</span>" : x; }).join("") + "</div>";
    }
    return crumbsHtml(crumbs) + '<h1 class="cs-h1">' + esc(title) + "</h1>" + (intro || "") +
      '<div class="cs-toolbar"><span class="cs-count">' + (shown.length ? (pages > 1 ? from + 1 + "–" + Math.min(shown.length, from + PER_PAGE) + " of " : "") + shown.length + " product" + (shown.length === 1 ? "" : "s") : "No products") + " · prices " + vatLabel() + (S.offline ? " · offline copy" : "") + "</span>" +
      '<label><input type="checkbox" data-cs="stockonly"' + (S.stockOnly ? " checked" : "") + "> In stock only</label>" +
      '<label>Sort <select data-cs="sort"><option value="name">Name A–Z</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="stock">In stock first</option></select></label></div>' +
      (slice.length ? '<div class="cs-grid">' + slice.map(card).join("") + "</div>" : '<div class="cs-empty"><h3>No products here yet</h3><p>Try another category, or search for a part number.</p></div>') + pager;
  }
  function crumbsHtml(c) { return '<nav class="cs-crumbs" aria-label="Breadcrumb"><a href="#/">Home</a>' + c.map(function (x, i) { return "<span>›</span>" + (i === c.length - 1 ? "<b>" + esc(x[0]) + "</b>" : '<a href="' + x[1] + '">' + esc(x[0]) + "</a>"); }).join("") + "</nav>"; }
  function deptPage(id, subSlug) {
    var d = DEPT_BY_ID[id]; if (!d) return notFound();
    var all = S.products.filter(function (p) { return p._dept === id; });
    if (subSlug) {
      var inSub = all.filter(function (p) { return p._subSlug === subSlug; });
      var subName = inSub[0] ? inSub[0]._sub : subSlug;
      document.title = subName + " · " + d.name + " · CSR Kart Parts " + INFO.country;
      return listing(subName, [[d.name, "#/c/" + id], [subName, ""]], inSub);
    }
    document.title = d.name + " · CSR Kart Parts " + INFO.country;
    var subs = subsOf(id);
    var tiles = subs.length > 1 ? '<div class="cs-subtiles">' + subs.map(function (s) {
      var sample = all.filter(function (p) { return p._sub === s && p.imageUrl; })[0];
      return '<a class="cs-subtile" href="#/c/' + id + "/" + slug(s) + '"><div class="cs-tb">' + (sample ? '<img src="' + esc(sample.imageUrl) + '" alt="" loading="lazy">' : icon(d.icon)) + '</div><div class="cs-tl"><span>' + esc(s) + "<small>" + S.tree[id].subs[s] + "</small></span>" + icon("arrow", "cs-i sm") + "</div></a>";
    }).join("") + "</div>" : "";
    return listing(d.name, [[d.name, ""]], all, tiles);
  }
  function productPage(sku) {
    var p = bySku(sku); if (!p) return notFound();
    var d = DEPT_BY_ID[p._dept] || { name: "Products", id: "" }, a = avail(p), im = p.images && p.images.length ? p.images : p.imageUrl ? [p.imageUrl] : [];
    document.title = p.name + " · CSR Kart Parts " + INFO.country;
    var related = S.products.filter(function (x) { return x._dept === p._dept && x._sub === p._sub && x.sku !== p.sku; }).concat(S.products.filter(function (x) { return x._dept === p._dept && x._sub !== p._sub; })).slice(0, 10);
    return crumbsHtml([[d.name, "#/c/" + d.id], [p._sub, "#/c/" + d.id + "/" + p._subSlug], [p.name, ""]]) +
      '<div class="cs-pdp" data-row="' + esc(p.sku) + '"><div class="cs-gal"><div class="cs-main">' + (im.length ? '<img src="' + esc(im[0]) + '" alt="' + esc(p.name) + '" data-main>' : '<span class="cs-ph" style="font-size:60px">' + esc(initials(p.name)) + "</span>") + "</div>" +
      (im.length > 1 ? '<div class="cs-thumbs">' + im.map(function (u, i) { return '<button type="button" data-thumb="' + esc(u) + '"' + (i ? "" : ' aria-current="true"') + ' aria-label="Photo ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'; }).join("") + "</div>" : "") + "</div>" +
      '<div class="cs-info"><div class="cs-brand">' + esc(p._brand || p._sub) + "</div><h1>" + esc(p.name) + '</h1><div class="cs-sku">Item no. ' + esc(p.sku) + (p.unit && p.unit !== "each" ? " · sold per " + esc(p.unit) : "") + "</div>" +
      '<div class="cs-price">' + money(priceOf(p)) + "<small>" + vatLabel() + '</small></div><div class="cs-alt">' + (S.incl ? money(p.priceExVat) + " excl. VAT" : money(p.price) + " incl. VAT") + "</div>" +
      '<div class="cs-av ' + a.c + '">' + a.t + "</div>" + optSelect(p) +
      '<div class="cs-buy"><input type="number" min="1" max="999" value="1" inputmode="numeric" data-qty aria-label="Quantity"><button type="button" class="cs-btn green" data-add="' + esc(p.sku) + '">Add to list</button></div>' +
      '<div class="cs-facts"><div>' + icon("quote") + "Price and availability confirmed on your quote</div><div>" + icon("truck") + esc(INFO.collect) + " or courier</div><div>" + icon("phone") + 'Questions? <a href="tel:' + INFO.phone.replace(/\s/g, "") + '" style="text-decoration:underline">' + esc(INFO.phone) + "</a></div></div>" +
      (p.description ? '<div class="cs-desc">' + esc(p.description) + "</div>" : "") + "</div></div>" +
      carousel("cs-rel", "", "You may also need", related);
  }
  function searchPage(q) {
    var words = clean(q).toLowerCase().split(" ").filter(Boolean);
    var hits = S.products.filter(function (p) { var h = (p.sku + " " + p.name + " " + p._sub + " " + (DEPT_BY_ID[p._dept] || {}).name + " " + p._brand + " " + (p.description || "") + " " + p.options).toLowerCase(); return words.every(function (w) { return h.indexOf(w) >= 0; }); });
    document.title = "Search: " + q + " · CSR Kart Parts " + INFO.country;
    return listing('Results for "' + q + '"', [["Search", ""]], hits);
  }
  function brandPage(b) {
    var hits = S.products.filter(function (p) { return slug(p._brand) === b; }), name = hits[0] ? hits[0]._brand : b;
    document.title = name + " · CSR Kart Parts " + INFO.country;
    return listing(name, [["Brands", "#/"], [name, ""]], hits);
  }
  function stockPage() { document.title = "In stock now · CSR Kart Parts " + INFO.country; return listing("In stock now", [["In stock now", ""]], S.products.filter(function (p) { return p.availability !== "on_order"; })); }
  function notFound() { return '<div class="cs-empty"><h3>That page is not here</h3><p><a class="cs-link" href="#/">Back to the shop' + icon("arrow") + "</a></p></div>"; }

  /* ---------------- router ---------------- */
  var lastRoute = "";
  function route() {
    if (!S.feed) return;
    var h = location.hash.replace(/^#\/?/, ""), parts = h.split("/").map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var key = parts.slice(0, 3).join("/");
    if (key !== lastRoute) { S.page = 1; }
    var view = $('[data-cs="view"]'), html;
    if (parts[0] === "c") html = deptPage(parts[1], parts[2]);
    else if (parts[0] === "p") html = productPage(parts[1]);
    else if (parts[0] === "s") html = searchPage(parts.slice(1).join("/"));
    else if (parts[0] === "b") html = brandPage(parts[1]);
    else if (parts[0] === "stock") html = stockPage();
    else { document.title = "CSR Kart Parts — " + INFO.country + " | Karting parts, racewear & accessories"; html = home(); }
    view.innerHTML = html;
    var sel = $('[data-cs="sort"]', view); if (sel) sel.value = S.sort;
    $$(".cs-cats a").forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("href") === "#/c/" + parts[1] && parts[0] === "c" ? "page" : "false"); });
    if (parts[0] === "s") $("#cs-q").value = parts.slice(1).join("/");
    if (key !== lastRoute) { window.scrollTo(0, 0); }
    if (parts[0] === "faq") { var f = $("#cs-faq"); if (f) f.scrollIntoView(); }
    lastRoute = key;
    closeMega(); closeMob();
  }

  /* ---------------- menus ---------------- */
  function renderMenus() {
    var depts = deptsWithStock();
    $('[data-cs="cats"]').innerHTML = depts.map(function (d) { return '<li><a href="#/c/' + d.id + '">' + esc(d.name) + "</a></li>"; }).join("");
    $(".cs-mega .cs-w").innerHTML = depts.map(function (d) {
      return '<div><h4><a href="#/c/' + d.id + '">' + esc(d.name) + "</a></h4><ul>" + subsOf(d.id).map(function (s) { return '<li><a href="#/c/' + d.id + "/" + slug(s) + '"><span>' + esc(s) + "</span><small>" + S.tree[d.id].subs[s] + "</small></a></li>"; }).join("") + "</ul></div>";
    }).join("");
    $('[data-cs="mob-list"]').innerHTML = depts.map(function (d) {
      return "<details><summary>" + esc(d.name) + "<span>" + S.tree[d.id].count + '</span></summary><a href="#/c/' + d.id + '"><b>All ' + esc(d.name.toLowerCase()) + "</b></a>" + subsOf(d.id).map(function (s) { return '<a href="#/c/' + d.id + "/" + slug(s) + '">' + esc(s) + "</a>"; }).join("") + "</details>";
    }).join("") + '<details><summary>More</summary><a href="#/stock">In stock now</a><a href="#/faq">How quotes work</a><a href="' + SITES[STORE === "sa" ? "ke" : "sa"] + '">' + (STORE === "sa" ? "Kenya store" : "South Africa store") + "</a></details>";
    $('[data-cs="footcats"]').innerHTML = depts.slice(0, 7).map(function (d) { return '<a href="#/c/' + d.id + '">' + esc(d.name) + "</a>"; }).join("");
    var parts = (S.tree["kart-parts"] ? S.tree["kart-parts"].count : 0) + (S.tree["engine-parts"] ? S.tree["engine-parts"].count : 0);
    var pc = $('[data-cs="partcount"]'); if (pc) pc.innerHTML = icon("box") + parts + " kart & engine parts";
    $('[data-cs="yr"]').textContent = new Date().getFullYear();
    $$("[data-vat]").forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-vat") === "1") === S.incl)); });
  }
  function closeMega() { var m = $('[data-cs="mega"]'); if (m) m.classList.remove("open"); var b = $('[data-cs="all"]'); if (b) b.setAttribute("aria-expanded", "false"); }
  function closeMob() { var m = $('[data-cs="mob"]'); if (m) m.classList.remove("open"); }

  /* ---------------- list & quote ---------------- */
  function saveList() { lsSet(K.list, S.list); renderCount(); if ($('[data-cs="drawer"]').classList.contains("open")) renderList(); }
  function qtyTotal() { return S.list.reduce(function (a, l) { return a + l.qty; }, 0); }
  function listTotal() { return S.list.reduce(function (a, l) { var p = bySku(l.sku); return a + (p ? p.price * l.qty : 0); }, 0); }
  function renderCount() { var n = qtyTotal(), c = $('[data-cs="count"]'); c.textContent = n; c.hidden = !n; $('[data-cs="open-list"]').setAttribute("aria-label", "My list, " + n + " item" + (n === 1 ? "" : "s")); }
  function renderList() {
    var box = $('[data-cs="items"]');
    box.innerHTML = S.list.length ? S.list.map(function (l, i) {
      var p = bySku(l.sku), a = avail(p);
      return '<div class="cs-line"><div class="cs-lt">' + shot(p) + "</div><div><b>" + esc(p.name) + "</b><small>" + esc(p.sku) + (l.option ? " · " + esc(l.option) : "") + " · " + money(p.price) + " each · " + a.t + "</small>" +
        '<div class="cs-qty"><button type="button" data-step="' + i + '" data-d="-1" aria-label="One fewer">−</button><input type="number" min="1" max="999" value="' + l.qty + '" data-lq="' + i + '" aria-label="Quantity of ' + esc(p.name) + '"><button type="button" data-step="' + i + '" data-d="1" aria-label="One more">+</button><button type="button" class="cs-rm" data-rm="' + i + '">Remove</button></div></div>' +
        '<b style="white-space:nowrap">' + money(p.price * l.qty) + "</b></div>";
    }).join("") : '<div class="cs-empty"><h3>Your list is empty</h3><p>Add parts and kit with <b>Add to list</b>, then request a quote here.</p></div>';
    $('[data-cs="total"]').textContent = S.list.length ? money(listTotal()) : "—";
    $('[data-cs="to-quote"]').disabled = !S.list.length;
  }
  function addToList(sku, qty, opt) {
    qty = Math.max(1, Math.min(999, qty || 1)); opt = opt || "";
    var ex = S.list.filter(function (l) { return l.sku === sku && (l.option || "") === opt; })[0];
    if (ex) ex.qty = Math.min(999, ex.qty + qty); else S.list.push({ sku: sku, qty: qty, option: opt });
    saveList();
  }
  var lastFocus = null;
  function syncScrim() { $('[data-cs="scrim"]').classList.toggle("open", $('[data-cs="drawer"]').classList.contains("open") || $('[data-cs="modal"]').classList.contains("open")); }
  function openList() { lastFocus = document.activeElement; renderList(); $('[data-cs="drawer"]').classList.add("open"); syncScrim(); $('[data-cs="close-list"]').focus(); }
  function closeList() { $('[data-cs="drawer"]').classList.remove("open"); syncScrim(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function openModal(title, html) { if (!$('[data-cs="modal"]').classList.contains("open")) lastFocus = document.activeElement; $('[data-cs="mtitle"]').textContent = title; $('[data-cs="mbody"]').innerHTML = html; $('[data-cs="modal"]').classList.add("open"); syncScrim(); $('[data-cs="close-modal"]').focus(); }
  function closeModal() { $('[data-cs="modal"]').classList.remove("open"); syncScrim(); if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus(); }
  function openQuote() {
    if (!S.list.length) return;
    var f = lsGet(K.form, {});
    $('[data-cs="drawer"]').classList.remove("open");
    openModal("Request a quote", '<div class="cs-sum">' + S.list.length + " line" + (S.list.length === 1 ? "" : "s") + " · " + qtyTotal() + " item" + (qtyTotal() === 1 ? "" : "s") + " · estimated <b>" + money(listTotal()) + "</b> incl. VAT</div>" +
      '<form class="cs-form" data-cs="quote" novalidate><div class="cs-err w" data-cs="qerr" role="alert" hidden></div>' +
      '<label class="w">Name *<input name="name" autocomplete="name" required value="' + esc(f.name) + '"></label>' +
      '<label>Email<input name="email" type="email" autocomplete="email" value="' + esc(f.email) + '"></label>' +
      '<label>Phone / WhatsApp<input name="phone" type="tel" autocomplete="tel" value="' + esc(f.phone) + '"></label>' +
      '<label class="w">Team or company<input name="company" autocomplete="organization" value="' + esc(f.company) + '"></label>' +
      '<label class="w">Message<textarea name="message" placeholder="Sizes, kart and engine, when you need it, collection or courier address…"></textarea></label>' +
      '<div class="cs-hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<button type="submit" class="cs-btn gold w">Send quote request</button><p class="cs-note w" style="margin:0">Give an email address or phone number so we can reply. No payment is taken here.</p></form>');
  }
  function showErr(text, html) { var e = $('[data-cs="qerr"]'); e.hidden = false; if (html) e.innerHTML = html; else e.textContent = text; }
  function submitQuote(form) {
    var d = {}; ["name", "email", "phone", "company", "message", "website"].forEach(function (k) { d[k] = form.elements[k].value.trim(); });
    if (!d.name) { showErr("Please give your name."); form.elements.name.focus(); return; }
    if (!d.email && !d.phone) { showErr("Please give an email address or phone number so we can reply."); form.elements.email.focus(); return; }
    lsSet(K.form, { name: d.name, email: d.email, phone: d.phone, company: d.company });
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…"; $('[data-cs="qerr"]').hidden = true;
    d.lines = S.list.map(function (l) { return { sku: l.sku, qty: l.qty, option: l.option || "" }; }); d.page = location.href.slice(0, 300);
    fetch(API + "/api/stores/" + STORE + "/quotes", { method: "POST", mode: "cors", headers: { "content-type": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || "The request could not be sent (" + r.status + ")."); return b; }); })
      .then(function (b) {
        S.list = []; saveList();
        var wa = INFO.wa ? "https://wa.me/" + INFO.wa + "?text=" + encodeURIComponent("Hi, I sent quote request " + b.number + " on the website.") : "";
        openModal("Quote request sent", '<div class="cs-done" role="status"><div class="cs-tick" aria-hidden="true">✓</div><div>Thank you - we have your list. Your reference is</div><div class="cs-ref">' + esc(b.number) + "</div>" +
          '<p class="cs-note">' + b.lines + " line" + (b.lines === 1 ? "" : "s") + " · estimated " + money(b.total) + " incl. VAT</p><p>We reply by email or phone with availability, the final price and how to pay.</p>" +
          (b.dropped ? '<p class="cs-note">' + b.dropped + " item(s) were no longer available and were left out.</p>" : "") +
          "<p>" + (wa ? '<a href="' + wa + '" target="_blank" rel="noopener">WhatsApp us</a> · ' : "") + '<a href="mailto:' + esc(INFO.email) + "?subject=" + encodeURIComponent("Quote " + b.number) + '">' + esc(INFO.email) + "</a></p>" +
          '<button type="button" class="cs-btn gold" data-cs="close-modal">Continue shopping</button></div>');
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = "Send quote request";
        var body = S.list.map(function (l) { var p = bySku(l.sku); return l.qty + " x " + l.sku + " " + (p ? p.name : "") + (l.option ? " (" + l.option + ")" : ""); }).join("\n");
        showErr(null, esc(e.message) + ' You can also email your list to <a href="mailto:' + esc(INFO.email) + "?subject=Quote%20request&body=" + encodeURIComponent(body) + '">' + esc(INFO.email) + "</a>.");
      });
  }

  /* ---------------- events ---------------- */
  function bind() {
    window.addEventListener("hashchange", route);
    $('[data-cs="search"]').addEventListener("submit", function (e) { e.preventDefault(); var q = clean($("#cs-q").value); location.hash = q ? "#/s/" + encodeURIComponent(q) : "#/"; });
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (t.matches('[data-cs="sort"]')) { S.sort = t.value; S.page = 1; route(); }
      else if (t.matches('[data-cs="stockonly"]')) { S.stockOnly = t.checked; S.page = 1; route(); }
      else if (t.hasAttribute("data-lq")) { var l = S.list[+t.getAttribute("data-lq")]; if (l) { l.qty = Math.max(1, Math.min(999, parseInt(t.value, 10) || 1)); saveList(); } }
    });
    document.addEventListener("submit", function (e) { if (e.target.matches('[data-cs="quote"]')) { e.preventDefault(); submitQuote(e.target); } });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if ($('[data-cs="modal"]').classList.contains("open")) closeModal(); else if ($('[data-cs="drawer"]').classList.contains("open")) closeList(); else { closeMega(); closeMob(); }
    });
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("button,a,[data-cs]") : null;
      var mega = $('[data-cs="mega"]');
      if (mega.classList.contains("open") && !e.target.closest('[data-cs="mega"],[data-cs="all"]')) closeMega();
      if (!t) return;
      var cs = t.getAttribute("data-cs");
      if (cs === "all") { var open = !mega.classList.contains("open"); mega.classList.toggle("open", open); t.setAttribute("aria-expanded", String(open)); return; }
      if (cs === "burger") { $('[data-cs="mob"]').classList.add("open"); return; }
      if (cs === "mob-close") { closeMob(); return; }
      if (cs === "open-list") { openList(); return; }
      if (cs === "close-list") { closeList(); return; }
      if (cs === "to-quote") { openQuote(); return; }
      if (cs === "close-modal") { closeModal(); return; }
      if (cs === "scrim") { closeModal(); closeList(); return; }
      if (t.hasAttribute("data-vat")) { S.incl = t.getAttribute("data-vat") === "1"; lsSet(K.vat, S.incl); renderMenus(); route(); return; }
      if (t.hasAttribute("data-page")) { if (t.disabled) return; S.page = +t.getAttribute("data-page"); route(); window.scrollTo(0, 0); return; }
      if (t.hasAttribute("data-scroll")) { var row = document.getElementById(t.getAttribute("data-scroll")); if (row) row.scrollBy({ left: +t.getAttribute("data-dir") * row.clientWidth * 0.8, behavior: "smooth" }); return; }
      if (t.hasAttribute("data-add")) {
        var r = t.closest("[data-row]"), q = r && r.querySelector("[data-qty]"), o = r && r.querySelector("[data-opt]");
        addToList(t.getAttribute("data-add"), q ? parseInt(q.value, 10) || 1 : 1, o ? o.value : "");
        var old = t.textContent; t.classList.add("added"); t.textContent = "Added ✓"; setTimeout(function () { t.classList.remove("added"); t.textContent = old; }, 1300);
        return;
      }
      if (t.hasAttribute("data-thumb")) { var m = $("[data-main]"); if (m) m.src = t.getAttribute("data-thumb"); $$(".cs-thumbs button").forEach(function (x) { x.setAttribute("aria-current", String(x === t)); }); return; }
      if (t.hasAttribute("data-step")) { var l = S.list[+t.getAttribute("data-step")]; if (l) { l.qty = Math.max(1, Math.min(999, l.qty + +t.getAttribute("data-d"))); saveList(); } return; }
      if (t.hasAttribute("data-rm")) { S.list.splice(+t.getAttribute("data-rm"), 1); saveList(); return; }
    });
    $('[data-cs="modal"]').addEventListener("click", function (e) { if (e.target === e.currentTarget) closeModal(); });
  }

  /* ---------------- data ---------------- */
  function load() {
    return fetch(API + "/api/feed/" + STORE + ".json", { mode: "cors", cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("feed " + r.status); return r.json(); })
      .then(function (f) { lsSet(K.feed, f); S.offline = false; return f; })
      .catch(function (e) { var c = lsGet(K.feed, null); if (c) { S.offline = true; return c; } throw e; })
      .then(function (f) {
        var first = !S.feed;
        S.feed = f; S.products = f.products || []; index(S.products);
        S.list = S.list.filter(function (l) { return bySku(l.sku); }); saveList();
        renderMenus();
        if (first) route(); else if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest('[data-cs="view"]')) route();
      })
      .catch(function () {
        if (S.feed) return;
        $('[data-cs="view"]').innerHTML = '<div class="cs-empty"><h3>The shop could not be loaded</h3><p>Check your connection and try again, or email <a href="mailto:' + esc(INFO.email) + '">' + esc(INFO.email) + '</a>.</p><p><button type="button" class="cs-btn dark" onclick="location.reload()">Try again</button></p></div>';
      });
  }

  function start() {
    shell(); bind(); renderCount(); load();
    setInterval(function () { if (!document.hidden) load(); }, 5 * 60 * 1000);
    window.CunguShop = { store: STORE, reload: load, openList: openList, place: place, get products() { return S.products; } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

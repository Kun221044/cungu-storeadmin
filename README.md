# Cungu Sport Store Manager

Product and stock back office for the two Cungu Sport stores, hosted on Netlify at
**https://storeadmin.cungusportracing.com**.

- **sastore.cungusportracing.com** (ZAR) and **kestore.cungusportracing.com** (KES) read their products, prices, stock and photos from this site.
- Team members sign in to add and edit products, upload photos, record stock and plan 2027 purchasing.
- Data lives in Netlify Blobs (no separate database to run). The 157-product catalogue from the Store Manager artifact (5 Nov 2026) is loaded automatically the first time the site starts.

```
public/index.html            the admin app (one page)
public/store-app.js          replaces /app.js on sastore and kestore (runs their existing page from this server)
docs/stores/sa|ke/index.html the two store pages with that one line changed - upload these to the stores
public/shop.js               stand-alone shop widget for any other page (one script tag)
public/shop/sa/, shop/ke/    ready-made shop pages using the same script
netlify/functions/api.mjs    the API: login, products, stock, photos, settings, store feeds
data/seed.mjs                starting catalogue and settings (used once, on first start)
docs/cungu-store-feed.js     script for the two storefronts
netlify.toml                 build and security headers
test/                        local test server with in-memory storage (not deployed)
```

---

## 1. Deploy

Drag-and-drop deploys do **not** run functions, so deploy from Git or with the Netlify CLI.

### Option A - from GitHub (recommended)
1. Create a private GitHub repo and push this folder to it.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
   Build settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`). No build command is needed.
3. Set the environment variables in step 2 below, then **Deploys → Trigger deploy**.

### Option B - from your computer
```bash
npm install
npx netlify login
npx netlify init        # create a new site, or link an existing one
npx netlify deploy --build --prod
```

## 2. Environment variables

Netlify → **Site configuration → Environment variables**. Set them for all deploy contexts, then redeploy.

| Variable | What to put | Example |
|---|---|---|
| `ADMIN_USERS` | Who can sign in: `Name:password` pairs separated by `;` | `Cungu:long-password-1;Enos:long-password-2` |
| `SESSION_SECRET` | A random string, at least 24 characters. Changing it signs everyone out. | output of `openssl rand -base64 36` |
| `STORE_KEY_SA` | Secret key the SA store uses to report sales | `openssl rand -hex 24` |
| `STORE_KEY_KE` | Secret key the Kenya store uses to report sales | `openssl rand -hex 24` |
| `RESEND_API_KEY` *(optional)* | E-mail each new quote request to the team, via [Resend](https://resend.com) | `re_…` |
| `QUOTE_EMAIL_TO` *(optional)* | Who gets those e-mails (comma separated). Or per store: `QUOTE_EMAIL_TO_SA`, `QUOTE_EMAIL_TO_KE` | `info@cungusportracing.com` |
| `QUOTE_EMAIL_FROM` *(optional)* | Sender, on a domain verified in Resend | `Cungu Store <quotes@cungusportracing.com>` |

Use long passwords (16+ characters). To add or remove a person, edit `ADMIN_USERS` and redeploy. (`ADMIN_PASSWORD` on its own also works, for a single login named "Admin".)

## 3. Custom domain: storeadmin.cungusportracing.com

1. Netlify → **Domain management → Add a domain** → `storeadmin.cungusportracing.com`.
2. At the DNS provider for `cungusportracing.com`, add:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `storeadmin` | `<your-site-name>.netlify.app` |

   (If the domain's DNS is already on Netlify, the record is added for you.)
3. Wait for DNS to update, then in Netlify click **Verify DNS configuration**. Netlify issues the HTTPS certificate automatically (Let's Encrypt). Turn on **Force HTTPS** if offered.

The admin page sends `noindex` and refuses to be shown inside other sites.

## 4. First sign-in

Open https://storeadmin.cungusportracing.com, sign in with a name and password from `ADMIN_USERS`.
The catalogue loads on first start. Then:

1. **Setup** - check the ZAR→KES rate, VAT, the Kenya freight & duty uplift (25% is an estimate) and delivery months.
2. **Stock** - download the stock count sheet, fill in what is on the shelves in each country, upload it.
3. **Products** - add descriptions and photos, untick anything that should not appear on a store.
4. **Setup → Download backup** regularly (products, settings and stock history as one JSON file).

## 5. Connecting the two stores

### sastore and kestore - change one line (done in `docs/stores/`)
The two stores load their products with `/app.js` (via Firebase). Replace that line in each store's `index.html`:

```html
<!-- before -->
<script src="/app.js"></script>
<!-- after, on sastore -->
<script src="https://storeadmin.cungusportracing.com/store-app.js" data-store="sa"></script>
<!-- after, on kestore -->
<script src="https://storeadmin.cungusportracing.com/store-app.js" data-store="ke"></script>
```

`docs/stores/sa/index.html` and `docs/stores/ke/index.html` are the stores' pages with exactly that change - upload them over the current `index.html` on each store host. Nothing else on the stores changes (header, hero, footer, styles.css, market.js stay). `store-app.js` fills the page's own elements: categories (`#cats`), product grid (`#grid`, 24 per page with `#pager`), count, search (`#q`), sort (`#sort`, plus "In stock first"), **My list** (`#cartBtn`, `#drawer`), product details and the quote form (`#modal`), and the SA/Kenya switch links. The product cards, list, product view, quote form and confirmation use the stores' own `styles.css` classes, so they match the theme exactly. Quote requests go to the **Quotes** page here instead of Firebase. Contacts after a quote: SA info@cungusportracing.com / WhatsApp +27 83 000 0000, Kenya kenya@cungusportracing.com / +254 700 000 000 (change with `data-email` / `data-whatsapp` on the script tag). Keep the old `app.js` on the host for a while in case you need to switch back - swapping the line back restores the old store.

Lists customers built with the old app are not carried over (it stored them differently).

### Any other page - the stand-alone widget

Add this line to the HTML of any page (in the site builder's "custom code" / "footer scripts" box, or in `index.html`):

```html
<!-- sastore.cungusportracing.com -->
<script src="https://storeadmin.cungusportracing.com/shop.js" data-store="sa" data-replace="#products" defer></script>

<!-- kestore.cungusportracing.com -->
<script src="https://storeadmin.cungusportracing.com/shop.js" data-store="ke" data-replace="#products" defer></script>
```

That line puts the full live shop on the page: categories with counts, search, the same three sort options the stores have now (plus "in stock first"), product cards with photos, prices incl. VAT in ZAR or KES, stock ("In stock", "Only 3 left", "On order - about 6 weeks"), a product page with all photos and the description, **My list** with quantities and an estimated total, and **Request a quote**. Every change made in the Store Manager shows on the stores within about a minute.

- **Where it appears:** add `<div id="cungu-shop"></div>` where the shop should go. Without it, the shop is placed where the first `data-replace` section was, or at the end of `<main>`.
- **Hiding the old sections:** `data-replace` takes CSS selectors (comma separated) of the store's current category/product grid and its old "My list" so they are hidden - replace `#products` with the real ids or classes (right-click → Inspect in the browser shows them). Leave it out to keep the old sections.
- **Other options:** `data-title="…"` (heading, `""` for none), `data-email="…"`, `data-whatsapp="27830000000"` (shown after a quote is sent; Kenya has no WhatsApp number set yet).
- The shop uses the page's own font and colours text to match; the accent is Cungu orange.

**Quote requests** are saved in the Store Manager under **Quotes** (with a badge for new ones) and, if the `RESEND_…` variables are set, e-mailed to the team. Check stock, adjust quantities, reply (the e-mail link pre-fills a reply with the lines and total), and click **Accept** when the customer confirms: the items come off that store's stock as a sale with the quote number as the reference. Accepting is refused if a line is short of stock - receive the stock first, or reduce the quantity. Customers' requests are re-priced from the catalogue on the server, limited to 12 per hour per connection, and filtered for bots.

**Ready-made pages:** https://storeadmin.cungusportracing.com/shop/sa/ and `/shop/ke/` show the same shop on their own. A store can link to them, or show one inside the store page in an `<iframe>` (allowed for the two store domains only), while the one-line change is being made.

### Building it into the store's own code instead

Everything a store needs is public and read-only:

| What | Address |
|---|---|
| SA products (JSON) | `https://storeadmin.cungusportracing.com/api/feed/sa.json` |
| Kenya products (JSON) | `https://storeadmin.cungusportracing.com/api/feed/ke.json` |
| Same as CSV | `.../api/feed/sa.csv`, `.../api/feed/ke.csv` |
| Photos | the `imageUrl` / `images` in the feed (`.../api/img/<id>`) |

The feeds allow cross-site requests (CORS), refresh every 60 seconds and only include **active** products ticked for that store.

### Feed format
```json
{
  "store": "sa", "storeName": "Cungu Sport Store - South Africa", "currency": "ZAR",
  "generatedAt": "2027-01-10T08:00:00.000Z",
  "products": [{
    "sku": "KRT-001", "name": "Chain DID 219 KF ...", "category": "Kart parts",
    "description": "", "imageUrl": "https://storeadmin.cungusportracing.com/api/img/…", "images": ["…"],
    "options": "", "unit": "each", "price": 935, "priceExVat": 813.04, "vatRate": 0.15,
    "stock": 12, "availability": "in_stock", "leadTimeDays": 0, "updatedAt": "…"
  }]
}
```
`availability` is `in_stock`, `low_stock` (below the safety level) or `on_order` (nothing on hand; `leadTimeDays` says roughly how long).

### Store code
Copy `docs/cungu-store-feed.js` to each store and load it:
```html
<script src="/cungu-store-feed.js" data-store="sa"></script>   <!-- data-store="ke" on kestore -->
<script>
  CunguStore.load().then(feed => {
    // replace the store's current product source with feed.products
  });
</script>
```
The script keeps the last good copy in the browser, so the store still shows products if the feed is briefly unreachable. (`shop.js` does the same.)

A store that keeps its own quote form can post requests to the Quotes page too:
```
POST https://storeadmin.cungusportracing.com/api/stores/sa/quotes      (no key needed; allowed from the store domains)
{ "name": "Jane Racer", "email": "jane@example.com", "phone": "", "company": "", "message": "",
  "lines": [ { "sku": "CRB-002", "qty": 2, "option": "" } ] }
→ { "ok": true, "number": "Q-SA-270110-4F2A", "total": 468, "currency": "ZAR", "lines": 1, "dropped": 0 }
```

### Reporting sales back (stock comes off automatically)
When a quote is accepted or an order is paid, the store (from its server, so the key stays secret) sends:
```
POST https://storeadmin.cungusportracing.com/api/stores/sa/movements
X-Store-Key: <STORE_KEY_SA>
Content-Type: application/json

{ "lines": [ { "sku": "KRT-001", "qty": 2, "type": "sale", "ref": "Quote Q-1042" } ] }
```
`type` can be `sale` or `return`. The reply lists the new stock per SKU. A line that would take stock below nil is refused and nothing in that request is saved. Use `/api/stores/ke/movements` with `STORE_KEY_KE` for the Kenya store.

If the store has no server of its own, keep using **Stock → Bulk updates** in the admin: upload a CSV of `sku, qty, store, type, ref`.

## 6. Local testing (optional)
```bash
npm install
node test/server.mjs      # http://localhost:8899 - in-memory data, logins Cungu/pw1 and Enos/pw2, store keys "sakey"/"kekey"
                          # http://localhost:8899/_t/mock-store.html - a stand-in store page with the one-line shop
```
Or, with the Netlify CLI and real Blobs: `npx netlify dev`.

## API (signed-in admin)
| Method & path | Purpose |
|---|---|
| `POST /api/login` `{name,password}` · `POST /api/logout` | session cookie (30 days) |
| `GET /api/bootstrap` | products, settings, last 300 movements |
| `GET /api/version` | change tag (the page polls this every 20 s) |
| `PUT /api/products/:sku` `{product,isNew}` · `DELETE /api/products/:sku` (drafts only) | edit products; stock is never changed here |
| `POST /api/movements` `{lines:[{sku,type,loc,qty,ref,note}]}` | receive, sale, return, count, damage, transfer - all or nothing |
| `PUT /api/settings` | exchange rate, VAT, uplift, rounding, markups, delivery months |
| `POST /api/images` (raw image body) · `DELETE /api/images/:id` | photos (JPG/PNG/WebP, resized in the browser, 5 MB max) |
| `GET /api/quotes?status=new` · `PUT /api/quotes/:id` `{action: accept\|decline\|reopen\|save, lines?, note?}` | quote requests; accept takes the lines off stock |
| `GET /api/backup` · `POST /api/restore` | full JSON backup / restore (backup includes quotes) |

Changes from the browser must carry the header `X-Requested-With: storeadmin` and the cookie is `SameSite=Strict`, which blocks cross-site form attacks.

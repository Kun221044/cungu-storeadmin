/*
  Cungu Sport store connector - drop into sastore / kestore.
  Loads the live product list from the Store Manager and renders nothing itself:
  it hands the products to your existing store code.

  <script src="/cungu-store-feed.js" data-store="sa"></script>   (use data-store="ke" on the Kenya store)
  <script>
    CunguStore.load().then(feed => {
      // feed.currency, feed.products[] -> render your categories, cards and product pages
      // each product: sku, name, category, description, imageUrl, images[], options, unit,
      //               price (incl. VAT), priceExVat, vatRate, stock, availability, leadTimeDays
    });
  </script>
*/
(function () {
  var API = "https://storeadmin.cungusportracing.com";
  var me = document.currentScript;
  var STORE = (me && me.dataset.store) || (location.hostname.indexOf("kestore") === 0 ? "ke" : "sa");
  var CACHE_KEY = "cungu-feed-" + STORE;

  function cached() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
  }

  window.CunguStore = {
    store: STORE,
    // Fetches the live feed; falls back to the last good copy if the network fails.
    load: function () {
      return fetch(API + "/api/feed/" + STORE + ".json", { mode: "cors" })
        .then(function (r) { if (!r.ok) throw new Error("Feed " + r.status); return r.json(); })
        .then(function (feed) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(feed)); } catch (e) {} return feed; })
        .catch(function (err) { var c = cached(); if (c) return c; throw err; });
    },
    // Formats a price the way the feed is priced (R 1 234 / KES 12 350).
    price: function (feed, value) {
      var n = Math.round(value).toLocaleString("en-ZA").replace(/ |,/g, " ");
      return feed.currency === "KES" ? "KES " + n : "R" + n;
    },
    availabilityText: function (p) {
      if (p.availability === "in_stock") return "In stock";
      if (p.availability === "low_stock") return "Only " + p.stock + " left";
      return "On order - about " + Math.max(1, Math.round(p.leadTimeDays / 7)) + " weeks";
    },
  };
})();

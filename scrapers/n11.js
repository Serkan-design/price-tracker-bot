/**
 * scrapers/n11.js
 */
const { launchBrowser, openPage, parsePrice, trySelectors, checkStock, getTitle } = require("./base");

const PRICE_SELECTORS = [
  ".newPrice ins",
  ".price-currency",
  ".price-area",
  ".fiyat ins",
  ".boxPrice ins",
  ".productPrice ins",
  "ins[class*='price']",
  "span.price",
];

const TITLE_SELECTORS = [
  "h1[class*='product']",
  ".product-title h1",
  "h1[itemprop='name']",
  "h1",
];

async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await openPage(browser, url, 4000);

    // Primary selectors
    let rawPrice = await trySelectors(page, PRICE_SELECTORS);

    // Fallback: Assemble split parts if needed
    if (!rawPrice) {
      rawPrice = await page.evaluate(() => {
        const p = document.querySelector(".price-area") || document.querySelector(".newPrice");
        if (p) return p.innerText.replace(/\n/g, "").trim();
        return null;
      });
    }
    const price = parsePrice(rawPrice);

    const rawOldPrice = await page.evaluate(() => {
      const selectors = [".oldPrice del", ".oldPrice", "del", "s"];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || "").trim();
          if (t && /\d/.test(t)) return t;
        }
      }
      return null;
    });
    const oldPrice = parsePrice(rawOldPrice);

    const title = await getTitle(page, TITLE_SELECTORS);
    const inStock = await checkStock(page);

    return {
      title: title || "Bilinmiyor",
      price,
      oldPrice: oldPrice && oldPrice > (price || 0) ? oldPrice : null,
      site: "n11",
      url,
      inStock,
      currency: "TRY",
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape, site: "n11" };

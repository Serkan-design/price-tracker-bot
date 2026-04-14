/**
 * scrapers/itopya.js
 */
const { launchBrowser, openPage, parsePrice, trySelectors, checkStock, getTitle } = require("./base");

const PRICE_SELECTORS = [
  ".product-detail-current-price",
  ".price-new",
  ".pdp-price",
  "[class*='currentPrice']",
  "[class*='product-price']",
  "span[class*='price']",
  "[itemprop='price']",
];

const TITLE_SELECTORS = [
  "h1[class*='product']",
  "h1[class*='title']",
  ".product-detail-title",
];

async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await openPage(browser, url, 3000);

    const rawPrice = await trySelectors(page, PRICE_SELECTORS);
    const price = parsePrice(rawPrice);

    const rawOldPrice = await page.evaluate(() => {
      const selectors = [".price-old", "del", "s", "[class*='oldPrice']"];
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
      site: "itopya",
      url,
      inStock,
      currency: "TRY",
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape, site: "itopya" };

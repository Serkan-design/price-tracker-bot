/**
 * scrapers/roboristan.js
 */
const { launchBrowser, openPage, parsePrice, trySelectors, checkStock, getTitle } = require("./base");

const PRICE_SELECTORS = [
  ".product-price",
  ".price-tag",
  ".current-price",
  ".pdp-price",
  "span[class*='price']",
  "[class*='product-detail-price']",
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
      const selectors = [".old-price", "del", "s", "[class*='oldPrice']", "[class*='old-price']"];
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
      site: "roboristan",
      url,
      inStock,
      currency: "TRY",
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape, site: "roboristan" };

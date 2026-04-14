/**
 * scrapers/hepsiburada.js
 */
const { launchBrowser, openPage, parsePrice, trySelectors, checkStock, getTitle } = require("./base");

const PRICE_SELECTORS = [
  "[data-bind*='currentPriceBeforePoint']",
  "span[class*='finalPrice']",
  "div[class*='Price'] span",
  ".price-value",
  "strong[class*='price']",
  ".product-final-price",
  "span[id*='offering-price']",
  // New specific selectors from inspection
  "[class*='finalPrice']",
  "[class*='currentPrice']",
  "[class*='price-module_finalPrice']",
];

const TITLE_SELECTORS = [
  "h1[class*='product']",
  "h1[itemprop='name']",
  "h1[class*='Title']",
  "h1",
];

async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await openPage(browser, url, 5000);

    // Try primary selectors first
    let rawPrice = await trySelectors(page, PRICE_SELECTORS);
    
    // Fallback: If split price, try to assemble it
    if (!rawPrice) {
      rawPrice = await page.evaluate(() => {
        const parent = document.querySelector("[class*='finalPrice']") || document.querySelector("[class*='price-module_finalPrice']");
        if (parent) return parent.innerText.replace(/\n/g, "").trim();
        return null;
      });
    }
    const price = parsePrice(rawPrice);

    // Eski fiyat (önceden gösterilen çizgili fiyat)
    const rawOldPrice = await page.evaluate(() => {
      const selectors = [
        "span[class*='originalPrice']",
        "span[class*='oldPrice']",
        "del",
        "s",
      ];
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
      site: "hepsiburada",
      url,
      inStock,
      currency: "TRY",
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape, site: "hepsiburada" };

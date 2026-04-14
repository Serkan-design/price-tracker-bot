/**
 * scrapers/amazon.js
 */
const { launchBrowser, openPage, parsePrice, trySelectors, checkStock, getTitle } = require("./base");

const PRICE_SELECTORS = [
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  ".a-price .a-offscreen",
  "#corePrice_feature_div .a-price .a-offscreen",
  "#apex_desktop .a-price .a-offscreen",
  "#apex_desktop_newAccordionRow .a-price .a-offscreen",
  "span.a-price-whole",
  "[itemprop='price']",
];

const TITLE_SELECTORS = [
  "#productTitle",
  "h1.a-size-large",
  "h1[class*='title']",
];

async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await openPage(browser, url, 4000);

    const rawPrice = await trySelectors(page, PRICE_SELECTORS);
    const price = parsePrice(rawPrice);

    const rawOldPrice = await page.evaluate(() => {
      const selectors = [
        ".a-text-strike",
        "#listPrice",
        "#priceblock_listprice",
        "span[class*='basisPrice'] .a-offscreen",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || el.getAttribute("content") || "").trim();
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
      site: "amazon",
      url,
      inStock,
      currency: "TRY",
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape, site: "amazon" };

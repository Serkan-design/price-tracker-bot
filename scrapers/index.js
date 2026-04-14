/**
 * scrapers/index.js
 * URL'e göre doğru scraper'ı seçer ve çalıştırır
 */
const trendyol  = require("./trendyol");
const hepsiburada = require("./hepsiburada");
const n11       = require("./n11");
const amazon    = require("./amazon");
const itopya    = require("./itopya");
const roboristan = require("./roboristan");

const SCRAPERS = [
  { matcher: (u) => u.includes("trendyol.com") || u.includes("ty.gl"), scraper: trendyol },
  { matcher: (u) => u.includes("hepsiburada.com"),                      scraper: hepsiburada },
  { matcher: (u) => u.includes("n11.com"),                               scraper: n11 },
  { matcher: (u) => u.includes("amazon.com"),                            scraper: amazon },
  { matcher: (u) => u.includes("itopya.com"),                            scraper: itopya },
  { matcher: (u) => u.includes("roboristan.com"),                        scraper: roboristan },
];

/**
 * URL'e göre scraper seç, ürün bilgisini döner
 * @returns {{ title, price, oldPrice, site, url, inStock, currency, scrapedAt }}
 */
async function scrapeUrl(url) {
  const entry = SCRAPERS.find((s) => s.matcher(url));
  if (!entry) {
    throw new Error(`Desteklenmeyen site: ${url}`);
  }
  console.log(`🕷️  [${entry.scraper.site}] Scraping: ${url}`);
  return entry.scraper.scrape(url);
}

/**
 * Hangi site bu URL?
 */
function detectSite(url) {
  const entry = SCRAPERS.find((s) => s.matcher(url));
  return entry ? entry.scraper.site : "unknown";
}

/**
 * Desteklenen siteler listesi
 */
function supportedSites() {
  return SCRAPERS.map((s) => s.scraper.site);
}

module.exports = { scrapeUrl, detectSite, supportedSites };

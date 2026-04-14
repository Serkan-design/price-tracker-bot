/**
 * scrapers/trendyol.js
 * Trendyol scraper - direkt navigasyon + waitForFunction
 */
const { launchBrowser, openPage, parsePrice, checkStock } = require("./base");

const PRICE_SELECTORS = [
  ".prc-dsc",
  ".prc-org",
  "[class*='prc-dsc']",
  "[class*='prc-org']",
  ".product-price-container .prc-dsc",
];

async function scrape(url) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Bot tespiti önleme
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }, { name: "Native Client" }],
      });
      Object.defineProperty(navigator, "languages", { get: () => ["tr-TR", "tr", "en-US"] });
    });

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    });

    console.log(`🕷️  [trendyol] Navigating: ${url.substring(0, 70)}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });

    // Fiyat elementini bekle (max 15 saniye)
    let priceFound = false;
    try {
      await page.waitForFunction(
        (sels) => {
          for (const sel of sels) {
            const el = document.querySelector(sel);
            if (el && (el.innerText || "").replace(/\s/g, "").length > 0) return true;
          }
          return false;
        },
        { timeout: 15000 },
        PRICE_SELECTORS
      );
      priceFound = true;
    } catch {
      // timeout — sayfada fiyat görünmemiş olabilir, 3 sn daha bekle
      await new Promise((r) => setTimeout(r, 3000));
    }

    const rawPrice = await page.evaluate((sels) => {
      // meta itemprop önce
      const meta = document.querySelector("meta[itemprop='price']");
      if (meta) {
        const c = meta.getAttribute("content");
        if (c && /\d/.test(c)) return c.trim();
      }
      // selector listesi
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const t = (el.innerText || el.textContent || "").trim();
        if (t && /\d/.test(t) && t.length < 25) return t;
      }
      // class*=price fallback
      const priceEls = document.querySelectorAll("[class*='price'], [class*='Price']");
      for (const el of priceEls) {
        if (el.children.length > 0) continue; // leaf istiyoruz
        const t = (el.innerText || "").trim();
        if (t && /^\d[\d.,\s]{1,10}$/.test(t)) {
          const n = parseFloat(t.replace(/\./g, "").replace(",", ".").replace(/\s/g, ""));
          if (n >= 100 && n <= 500000) return t;
        }
      }
      return null;
    }, PRICE_SELECTORS);

    const rawOldPrice = await page.evaluate(() => {
      const sels = [".prc-org", "[class*='prc-org']", "del", "s"];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || "").trim();
          if (t && /\d/.test(t)) return t;
        }
      }
      return null;
    });

    const title = await page.evaluate(() => {
      const sels = ["h1.pr-new-br span", "h1[class*='product']", ".pr-new-br span", "h1"];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || "").trim();
          if (t && t.length > 3) return t.substring(0, 120);
        }
      }
      // Başlık fallback
      return document.title.split(" - ")[0].trim();
    });

    const inStock = await checkStock(page);

    const price = parsePrice(rawPrice);
    const oldPrice = parsePrice(rawOldPrice);

    console.log(`   📊 title: ${(title || "?").substring(0, 40)} | price: ${price} | priceFound: ${priceFound}`);

    return {
      title: title || "Bilinmiyor",
      price,
      oldPrice: oldPrice && oldPrice > (price || 0) ? oldPrice : null,
      site: "trendyol",
      url,
      inStock,
      currency: "TRY",
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`❌ [trendyol] scrape error: ${err.message}`);
    return {
      title: "Bilinmiyor", price: null, oldPrice: null,
      site: "trendyol", url, inStock: false, currency: "TRY",
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrape, site: "trendyol" };

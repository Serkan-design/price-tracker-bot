const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const ai = require("./ai");
puppeteer.use(StealthPlugin());

// ─────────────────────────────────────────────
// PLATFORM TESPİTİ
// ─────────────────────────────────────────────
function detectPlatform(url) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("trendyol.com") || lowerUrl.includes("ty.gl")) return "trendyol";
  if (lowerUrl.includes("hepsiburada.com")) return "hepsiburada";
  if (lowerUrl.includes("n11.com")) return "n11";
  if (lowerUrl.includes("amazon.com.tr") || lowerUrl.includes("amazon.com")) return "amazon";
  if (lowerUrl.includes("dolap.com")) return "dolap";
  if (lowerUrl.includes("itopya.com")) return "itopya";
  if (lowerUrl.includes("roboristan.com")) return "roboristan";
  if (lowerUrl.includes("vatanbilgisayar.com")) return "vatanbilgisayar";
  if (lowerUrl.includes("teknosa.com")) return "teknosa";
  if (lowerUrl.includes("mediamarkt.com.tr")) return "mediamarkt";
  if (lowerUrl.includes("pttav.com")) return "pttav";
  if (lowerUrl.includes("pazarama.com")) return "pazarama";
  return "generic";
}

// Short link expansion
async function expandUrl(url) {
  if (url.includes("ty.gl") || url.includes("bit.ly") || url.includes("t.co")) {
    try {
      const response = await axios.get(url, { maxRedirects: 5, validateStatus: null });
      return response.request.res.responseUrl || url;
    } catch (err) {
      return url;
    }
  }
  return url;
}

// ─────────────────────────────────────────────
// PLATFORM BAZLI SELECTOR'LER
// ─────────────────────────────────────────────
function getPriceSelectors(platform) {
  const map = {
    trendyol: [
      'meta[itemprop="price"]',
      "[data-testid='price-label']",
      ".prc-dsc", 
      ".product-detail-price .prc-dsc",
      ".product-price-container .prc-dsc",
      ".pr-bx-nm .prc-dsc",
      ".prc-slg",
      ".merchant-box .prc-dsc",
    ],
    hepsiburada: [
      'meta[itemprop="price"]',
      "[data-testid='price-current-price']",
      "[data-testid='price-label']",
      "span[class*='finalPrice']",
      "span[id*='offering-price']",
      "[data-bind*='currentPriceBeforePoint']",
      ".product-final-price",
      "span[class*='currentPrice']",
    ],
    n11: [
      ".newPrice ins",
      ".priceDetail .newPrice ins",
      ".fiyat ins",
      ".productPrice ins",
      ".product-price ins",
      "span.price",
      ".boxPrice ins",
    ],
    amazon: [
      ".a-price .a-offscreen",
      "#priceblock_ourprice",
      "#corePrice_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      "#price_inside_buybox",
      "#newBuyBoxPrice",
      ".a-price-whole",
      "#corePrice_full_Price .a-price-whole",
      "span.a-price-whole"
    ],
    dolap: [
      ".product-price",
      "[class*='price']",
      ".listing-price",
      "span[class*='Price']",
    ],
    itopya: [
      ".product-detail-current-price",
      ".price-new",
      "span[class*='price']",
      ".product-price",
      "[class*='currentPrice']",
      "[itemprop='price']",
      ".pdp-price",
    ],
    roboristan: [
      ".product-price",
      ".price-tag",
      "span[class*='price']",
      ".product-detail-price",
      "[itemprop='price']",
      ".current-price",
      ".pdp-price",
    ],
    vatanbilgisayar: [
      ".product-price",
      ".price_tag",
      "span.red",
      "div[class*='productPrice']",
      "[itemprop='price']",
    ],
    teknosa: [
      ".product-page-price .price",
      ".product-final-price",
      "span[class*='price']",
      "[itemprop='price']",
    ],
    mediamarkt: [
      "[class*='StyledPrice']",
      "[data-testid='product-price']",
      ".price-display",
      "[itemprop='price']",
    ],
    pttav: [
      ".product-price",
      "[class*='price']",
      "[itemprop='price']",
    ],
    pazarama: [
      ".product-price",
      "[class*='price']",
      "[itemprop='price']",
    ],
    generic: [
      "[itemprop='price']",
      "meta[itemprop='price']",
      "[class*='price']",
      "[class*='fiyat']",
      "[class*='Price']",
    ],
  };
  return map[platform] || map.generic;
}

function getNameSelectors(platform) {
  const map = {
    trendyol: [
      "h1.pr-new-br", 
      ".pr-new-br span[title]", 
      "h1.pr-new-br span", 
      "[data-testid='product-title']",
      "h1[class*='product']", 
      "h1",
      ".product-name"
    ],
    hepsiburada: ["h1[class*='product']", "h1[itemprop='name']", "h1"],
    n11: ["h1[class*='product']", ".product-title h1", "h1"],
    amazon: ["#productTitle", "h1.a-size-large", "h1"],
    itopya: ["h1[class*='product']", "h1[class*='title']", "h1"],
    roboristan: ["h1[class*='product']", "h1[class*='title']", "h1"],
    generic: ["h1", "[itemprop='name']", "[class*='product-name']", "[class*='productName']", "title"],
  };
  return map[platform] || map.generic;
}

// ─────────────────────────────────────────────
// STRİNG → FLOAT FİYAT PARSE
// ─────────────────────────────────────────────
function parsePrice(raw) {
  if (!raw) return null;
  raw = String(raw).trim().toLowerCase();
  
  // Clean currency symbols and spaces
  raw = raw.replace(/[tl|₺|€|$|usd|eur|\s]/g, "");

  // TR specific fix: If there is a dot but NO comma, and it looks like a thousand separator
  // e.g. "13.419" -> 13419
  if (raw.includes(".") && !raw.includes(",")) {
    const parts = raw.split(".");
    // If the last part has exactly 3 digits, it's likely a thousand separator
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      raw = raw.replace(/\./g, "");
    }
  }

  // Detect format
  // Case 1: 1.234,56 (TR)
  if (raw.includes(",") && raw.includes(".")) {
    if (raw.indexOf(".") < raw.indexOf(",")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  }
  // Case 2: 1234,56 (Simple TR)
  else if (raw.includes(",") && !raw.includes(".")) {
    raw = raw.replace(",", ".");
  }
  
  const val = parseFloat(raw);
  if (isNaN(val) || val <= 0) return null;
  return val;
}

// ─────────────────────────────────────────────
// TARAYıCı AÇMA (ortak)
// ─────────────────────────────────────────────
async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });
}

async function openPage(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  });

  await page.goto(url, { waitUntil: "networkidle2", timeout: 35000 });
  
  // Platform-specific wait
  const platform = detectPlatform(url);
  if (platform === 'trendyol') {
    // Trendyol için özel bekleme ve maskeleme
    await page.waitForSelector('.pr-new-br', { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    // Genel siteler için kısa bekleme
    await new Promise((r) => setTimeout(r, 1500));
  }
  
  // Scroll down slightly to trigger lazy loads
  await page.evaluate(() => window.scrollBy(0, 500));
  return page;
}

// ─────────────────────────────────────────────
// SAYFA'DAN FİYAT VE STOK ÇEK
// ─────────────────────────────────────────────
async function extractFromPage(page, priceSelectors, nameSelectors, platform) {
  return page.evaluate(
    (priceSels, nameSels, plat) => {
      // --- ÜRÜN ADI ---
      let name = null;
      if (plat === 'trendyol') {
        const trendyName = document.querySelector(".pr-new-br") || 
                           document.querySelector(".product-h1-container h1") ||
                           document.querySelector("[data-testid='product-title']");
        if (trendyName) name = trendyName.innerText.trim();
      }

      if (!name) {
        const h1 = document.querySelector("h1");
        if (h1 && h1.innerText.length > 5) name = h1.innerText.trim();
      }

      if (!name) {
        name = document.title.split('-')[0].split('|')[0].trim();
      }

      if (!name) {
        for (const sel of nameSels) {
          const el = document.querySelector(sel);
          if (el) {
            const t = (el.innerText || el.textContent || el.getAttribute("content") || "").trim();
            if (t && t.length > 3) {
              name = t.substring(0, 100);
              break;
            }
          }
        }
      }

      // --- FİYAT ---
      let rawPrice = null;
      
      // 1. JSON-LD Check (Highly Reliable for Schema.org)
      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          const json = JSON.parse(script.innerText);
          // Handle arrays of objects or single objects
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
             if (item?.offers?.price) {
               rawPrice = item.offers.price;
               break;
             }
             if (item?.price) {
               rawPrice = item.price;
               break;
             }
          }
          if (rawPrice) break;
        }
      } catch (e) {}

      // 2. HER ZAMAN ÖNCE META ETİKETİNE BAK (Fallback)
      if (!rawPrice) {
        const metaPrice = document.querySelector("meta[itemprop='price']");
        if (metaPrice) {
          rawPrice = metaPrice.getAttribute("content");
        }
      }

      // 3. META YOKSA SELECTORLERE BAK (En spesifik olandan başla)
      if (!rawPrice) {
        for (const sel of priceSels) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (el.tagName === 'META' ? el.getAttribute("content") : (el.innerText || el.textContent || el.getAttribute("content") || "")).trim();
            if (text && text.length > 0 && /\d/.test(text)) {
              rawPrice = text;
              break;
            }
          }
        }
      }
      
      // --- STOK DURUMU ---
      const bodyText = (document.body.innerText || "").toLowerCase();
      const outOfStockKeywords = ["stokta yok", "tükendi", "satışta değil", "out of stock"];
      const inStock = !outOfStockKeywords.some((k) => bodyText.includes(k));

      return { rawPrice, name, inStock };
    },
    priceSelectors,
    nameSelectors,
    platform
  );
}

// ─────────────────────────────────────────────
// getPrice (cron için)
// ─────────────────────────────────────────────
async function getPrice(url) {
  let browser;
  try {
    url = await expandUrl(url);
    const platform = detectPlatform(url);
    console.log(`🌐 Platform: ${platform} | URL: ${url}`);

    browser = await launchBrowser();
    const page = await openPage(browser, url);

    const priceSelectors = getPriceSelectors(platform);
    const nameSelectors = getNameSelectors(platform);

    const { rawPrice } = await extractFromPage(page, priceSelectors, nameSelectors, platform);
    console.log(`💱 Ham fiyat: ${rawPrice}`);

    const price = parsePrice(rawPrice);
    console.log(`✅ Parse edilmiş: ${price} TL`);
    return price;
  } catch (err) {
    console.error("❌ getPrice HATA:", err.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

// ─────────────────────────────────────────────
// getProductInfo (Telegram'dan link gelince)
// ─────────────────────────────────────────────
async function getProductInfo(url) {
  let browser;
  try {
    url = await expandUrl(url);
    const platform = detectPlatform(url);
    console.log(`🌐 Platform: ${platform} | URL: ${url}`);

    browser = await launchBrowser();
    const page = await openPage(browser, url);

    const priceSelectors = getPriceSelectors(platform);
    const nameSelectors = getNameSelectors(platform);

    const { rawPrice, name, inStock } = await extractFromPage(page, priceSelectors, nameSelectors, platform);

    console.log(`💱 Ham fiyat: ${rawPrice}`);
    let price = parsePrice(rawPrice);

    // AI Yedeği (Eğer selector bulamadıysa)
    if (!price) {
      console.log("🤖 Selector başarısız, AI kullanılıyor...");
      const html = await page.content();
      const aiPrice = await ai.extractPriceAI(html);
      if (aiPrice) price = aiPrice;
    }

    console.log(`✅ Final fiyat: ${price} TL | Platform: ${platform}`);

    return {
      name: name || "Bilinmiyor",
      price,
      inStock,
      platform,
    };
  } catch (err) {
    console.error("❌ getProductInfo HATA:", err.message);
    return { name: "Bilinmiyor", price: null, inStock: false, platform: "unknown" };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { getPrice, getProductInfo, parsePrice, detectPlatform };
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const ai = require("./ai");
puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Edge/122.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

let _browser = null;
let _launching = false;
let _activePages = 0;
let _restartTimer = null;
const MAX_PAGES = 5;              // Eş zamanlı maksimum sekme
const PAGE_TIMEOUT_MS = 45000;   // Toplam sayfa zaman aşımı
const SLOT_WAIT_TIMEOUT_MS = 30000; // Slot bekleme zaman aşımı
const BROWSER_IDLE_RESTART_MS = 10 * 60 * 1000;

const launchOptions = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-infobars",
    "--window-position=0,0",
    "--ignore-certificate-errors",
    "--ignore-certificate-errors-spki-list",
    "--window-size=1920,1080",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
};

// Linux'ta ek flagler gerekli (snap Chromium uyumu için)
if (process.platform === "linux") {
  launchOptions.args.push("--no-zygote", "--single-process");
  const snapPath = "/snap/bin/chromium";
  const binPath = "/usr/bin/chromium-browser";
  if (require("fs").existsSync(snapPath)) launchOptions.executablePath = snapPath;
  else if (require("fs").existsSync(binPath)) launchOptions.executablePath = binPath;
}


async function getBrowser() {
  if (_launching) {
    // Diğer launch işlemini bekle (max 15 saniye)
    const deadline = Date.now() + 15000;
    while (_launching && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    if (_launching) throw new Error("Browser launch timeout (deadlock)");
  }

  if (_browser) {
    try {
      await _browser.version();
      return _browser;
    } catch (e) { 
      console.warn("[SCRAPER] Browser yanıt vermiyor, yeniden başlatılıyor...");
      try { await _browser.close(); } catch (_) {}
      _browser = null;
      _activePages = 0; // Browser çöktüğünde sayacı sıfırla
    }
  }

  _launching = true;
  try {
    console.log("[SCRAPER] Browser başlatılıyor...");
    _browser = await puppeteer.launch(launchOptions);
    _browser.on("disconnected", () => { 
      console.warn("[SCRAPER] Browser bağlantısı kesildi, sayaç sıfırlanıyor.");
      _browser = null;
      _activePages = 0; // Kritik: çökmede sıkışmayı önle
    });
    console.log("[SCRAPER] Browser hazır.");
    return _browser;
  } finally {
    _launching = false;
  }
}

function waitForSlot() {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (_activePages < MAX_PAGES) {
        _activePages++;
        resolve();
      } else if (Date.now() - startTime > SLOT_WAIT_TIMEOUT_MS) {
        // Zaman aşımı: sonsuz beklemeyi önle
        console.warn(`[SCRAPER] Slot zaman aşımı! Aktif: ${_activePages}/${MAX_PAGES}`);
        reject(new Error(`Puppeteer slot zaman aşımı (${MAX_PAGES} sekme dolu)`));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}

function releaseSlot() {
  _activePages = Math.max(0, _activePages - 1);
  if (_activePages === 0) {
    clearTimeout(_restartTimer);
    _restartTimer = setTimeout(async () => {
      if (_activePages === 0 && _browser) {
        console.log("[SCRAPER] Closing idle browser...");
        try { await _browser.close(); } catch (_) {}
        _browser = null;
      }
    }, BROWSER_IDLE_RESTART_MS);
  }
}

// Güvenlik kontrolü: sıkışmış sayaçları temizle
setInterval(async () => {
  if (_activePages > 0 && !_browser) {
    console.warn(`[SCRAPER] Browser yok ama ${_activePages} aktif slot var, sıfırlanıyor.`);
    _activePages = 0;
  }
  // Browser sayfalarını kontrol et
  if (_browser) {
    try {
      const pages = await _browser.pages();
      const actualOpen = pages.length - 1; // blank tab dahil
      if (actualOpen < _activePages) {
        console.warn(`[SCRAPER] Gerçek sayfa (${actualOpen}) < sayaç (${_activePages}), düzeltiliyor.`);
        _activePages = Math.max(0, actualOpen);
      }
    } catch (_) {}
  }
}, 20000);

// ─────────────────────────────────────────────────────────────
// HEPSİBURADA API-FIRST SCRAPER
// Bot tespitini atlatmak için önce JSON API'yi dene
// ─────────────────────────────────────────────────────────────
function extractHbProductId(url) {
  // https://www.hepsiburada.com/urun-adi-pm-HB00000XXXXX
  const match = url.match(/-(pm-[A-Z0-9]+)(?:[?#]|$)/i)
             || url.match(/\/([A-Z0-9]{10,})(?:[?#]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

async function fetchHepsiburadaViaApi(url) {
  try {
    const productId = extractHbProductId(url);
    if (!productId) return null;

    const apiUrl = `https://productdiscovery.hepsiburada.com/Search/GetProductInfo?ProductId=${productId}`;
    const res = await axios.get(apiUrl, {
      timeout: 12000,
      headers: {
        "User-Agent": getRandomUA(),
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "tr-TR,tr;q=0.9",
        "Referer": "https://www.hepsiburada.com/",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://www.hepsiburada.com",
      },
    });

    const data = res.data;
    // API dönen fiyat alanları
    const price =
      data?.price ||
      data?.salePrice ||
      data?.originalPrice ||
      data?.result?.price ||
      data?.result?.salePrice;

    if (price && !isNaN(parseFloat(price))) {
      console.log(`[HB-API] ✅ Fiyat API'den alındı: ${price}`);
      return { price: parseFloat(price), name: data?.name || data?.result?.name || null };
    }
  } catch (err) {
    console.warn(`[HB-API] API denemesi başarısız: ${err.message}`);
  }

  // İkinci deneme: Hepsiburada'nın listing/search API'si
  try {
    const productId = extractHbProductId(url);
    if (!productId) return null;
    const res2 = await axios.get(
      `https://www.hepsiburada.com/api/product/detail/sku/${productId}`,
      {
        timeout: 12000,
        headers: {
          "User-Agent": getRandomUA(),
          "Accept": "application/json",
          "Referer": "https://www.hepsiburada.com/",
          "Accept-Language": "tr-TR,tr;q=0.9",
        },
      }
    );
    const d = res2.data;
    const price2 = d?.price || d?.salePrice || d?.data?.price;
    if (price2 && !isNaN(parseFloat(price2))) {
      console.log(`[HB-API2] ✅ Fiyat 2. API'den alındı: ${price2}`);
      return { price: parseFloat(price2), name: d?.name || null };
    }
  } catch (_) {}

  return null;
}

// ─────────────────────────────────────────────────────────────
// TRENDYOL API-FIRST SCRAPER
// ─────────────────────────────────────────────────────────────
function extractTrendyolProductId(url) {
  // https://www.trendyol.com/urun-adi-p-123456789
  const match = url.match(/[?&-]p-(\d+)/i) || url.match(/\/p-(\d+)/i);
  return match ? match[1] : null;
}

async function fetchTrendyolViaApi(url) {
  try {
    const productId = extractTrendyolProductId(url);
    if (!productId) return null;

    // Trendyol ürün detay API'si
    const apiUrl = `https://public.trendyol.com/discovery-web-productgw-service/api/productGroupWithAttributes/${productId}?storefrontId=1&culture=tr-TR&currencyId=1&channelId=1`;
    const res = await axios.get(apiUrl, {
      timeout: 12000,
      headers: {
        "User-Agent": getRandomUA(),
        "Accept": "application/json",
        "Accept-Language": "tr-TR,tr;q=0.9",
        "Referer": "https://www.trendyol.com/",
        "Origin": "https://www.trendyol.com",
      },
    });

    const data = res.data?.result;
    if (!data) return null;

    // Fiyat alanları
    const price =
      data?.price?.discountedPrice?.value ||
      data?.price?.originalPrice?.value ||
      data?.priceInfo?.discountedPrice ||
      data?.priceInfo?.price;

    const name = data?.name || data?.productName;

    if (price && !isNaN(parseFloat(price))) {
      console.log(`[TY-API] ✅ Fiyat API'den alındı: ${price} TL`);
      return { price: parseFloat(price), name: name || null };
    }
  } catch (err) {
    console.warn(`[TY-API] API denemesi başarısız: ${err.message}`);
  }
  return null;
}



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
      'script[type="application/ld+json"]', // Deep search first
      "[data-test-id='price-current-price']",
      "[data-test-id='price-label']",
      "span[class*='finalPrice']",
      "span[id*='offering-price']",
      "span[class*='product-price']",
      ".product-price",
      "div[class*='price'] span",
      ".price-value",
      "[itemprop='price']"
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
      "span.a-price-whole",
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
      ".product-name",
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

function parsePrice(raw) {
  if (!raw) return null;
  raw = String(raw).trim().toLowerCase();
  raw = raw.replace(/[tl|₺|€|$|usd|eur|\s]/g, "");

  if (raw.includes(".") && !raw.includes(",")) {
    const parts = raw.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      raw = raw.replace(/\./g, "");
    }
  }

  if (raw.includes(",") && raw.includes(".")) {
    if (raw.indexOf(".") < raw.indexOf(",")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  }
  else if (raw.includes(",") && !raw.includes(".")) {
    raw = raw.replace(",", ".");
  }

  const val = parseFloat(raw);
  if (isNaN(val) || val <= 0) return null;
  return val;
}

async function openPage(browser, url) {
  const page = await browser.newPage();
  const platform = detectPlatform(url);

  await page.setViewport({ width: 1366 + Math.floor(Math.random() * 200), height: 768 + Math.floor(Math.random() * 200) });
  await page.setUserAgent(getRandomUA());

  // Gerçek tarayıcı gibi görünmek için navigator özellikleri
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US'] });
    window.chrome = { runtime: {} };
  });

  await page.setExtraHTTPHeaders({
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.google.com/",
    "sec-ch-ua": `"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"Windows"`,
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
  });

  if (platform === "hepsiburada") {
    await page.setCookie(
      { name: "hb_login", value: "false", domain: ".hepsiburada.com" },
      { name: "locale", value: "tr", domain: ".hepsiburada.com" }
    );
  }

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    const reqUrl = req.url();
    // CSS'i HİÇ engelleme — Trendyol, HB ve diğerleri fiyatı CSS ile render ediyor
    if (
      type === "image" ||
      type === "media" ||
      type === "font" ||
      reqUrl.includes("google-analytics") ||
      reqUrl.includes("googletagmanager") ||
      reqUrl.includes("facebook.net") ||
      reqUrl.includes("doubleclick") ||
      reqUrl.includes("hotjar") ||
      reqUrl.includes("pixel") ||
      reqUrl.includes("clarity.ms") ||
      reqUrl.includes("ads.")
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });


  const waitUntil = "domcontentloaded"; // Tüm platformlar için domcontentloaded - daha hızlı ve daha az bot tespiti
  await page.goto(url, { waitUntil, timeout: 35000 });

  if (platform === "trendyol") {
    // Trendyol: price elementi gelene kadar bekle, gelmezse scroll + bekle
    await page.waitForFunction(
      () => document.querySelector('.prc-dsc') !== null || document.querySelector('[data-testid="price-label"]') !== null,
      { timeout: 8000 }
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => window.scrollTo(0, 600));
    await new Promise((r) => setTimeout(r, 1500));
  } else if (platform === "hepsiburada") {
    await new Promise((r) => setTimeout(r, 2000));
    await page.evaluate(() => window.scrollTo(0, 600));
    await new Promise((r) => setTimeout(r, 2500));
  } else {
    await new Promise((r) => setTimeout(r, 1000));
  }

  await page.evaluate(() => window.scrollBy(0, 400));
  return page;
}


async function extractFromPage(page, priceSelectors, nameSelectors, platform) {
  return page.evaluate(
    (priceSels, nameSels, plat) => {
      let name = null;
      if (plat === "trendyol") {
        const trendyName =
          document.querySelector(".pr-new-br") ||
          document.querySelector(".product-h1-container h1") ||
          document.querySelector("[data-testid='product-title']");
        if (trendyName) name = trendyName.innerText.trim();
      }

      if (!name) {
        const h1 = document.querySelector("h1");
        if (h1 && h1.innerText.length > 5) name = h1.innerText.trim();
      }

      if (!name) {
        name = document.title.split("-")[0].split("|")[0].trim();
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

      let rawPrice = null;

      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          const json = JSON.parse(script.innerText);
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item?.offers?.price) { rawPrice = item.offers.price; break; }
            if (item?.price) { rawPrice = item.price; break; }
          }
          if (rawPrice) break;
        }
      } catch (e) {}

      if (!rawPrice) {
        const metaPrice = document.querySelector("meta[itemprop='price']");
        if (metaPrice) rawPrice = metaPrice.getAttribute("content");
      }

      if (!rawPrice) {
        for (const sel of priceSels) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (
              el.tagName === "META"
                ? el.getAttribute("content")
                : el.innerText || el.textContent || el.getAttribute("content") || ""
            ).trim();
            if (text && text.length > 0 && /\d/.test(text)) {
              rawPrice = text;
              break;
            }
          }
        }
      }

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

async function getPrice(url) {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Global timeout")), PAGE_TIMEOUT_MS)
  );
  
  try {
    return await Promise.race([_getPrice(url), timeoutPromise]);
  } catch (err) {
    console.error(`[SCRAPER ERROR] getPrice timeout/error: ${err.message}`);
    return null;
  }
}

async function _getPrice(url) {
  url = await expandUrl(url);
  const platform = detectPlatform(url);

  // ─── Hepsiburada: Önce API dene (Puppeteer açma) ───
  if (platform === "hepsiburada") {
    const apiResult = await fetchHepsiburadaViaApi(url);
    if (apiResult && apiResult.price) {
      console.log(`[HB] ✅ API ile fiyat alındı.`);
      return apiResult.price;
    }
  }

  // ─── Trendyol: Önce API dene ───
  if (platform === "trendyol") {
    const apiResult = await fetchTrendyolViaApi(url);
    if (apiResult && apiResult.price) {
      console.log(`[TY] ✅ API ile fiyat alındı.`);
      return apiResult.price;
    }
    console.warn(`[TY] API başarısız, Puppeteer fallback devreye giriyor...`);
  }

  await waitForSlot();
  let page;
  try {
    const browser = await getBrowser();
    page = await openPage(browser, url);

    const priceSelectors = getPriceSelectors(platform);
    const nameSelectors = getNameSelectors(platform);

    const { rawPrice } = await extractFromPage(page, priceSelectors, nameSelectors, platform);
    return parsePrice(rawPrice);
  } finally {
    if (page) await page.close().catch(() => {});
    releaseSlot();
  }
}


async function getProductInfo(url) {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Global timeout")), PAGE_TIMEOUT_MS)
  );

  try {
    return await Promise.race([_getProductInfo(url), timeoutPromise]);
  } catch (err) {
    console.error(`[SCRAPER ERROR] getProductInfo timeout/error: ${err.message}`);
    return { name: "Bilinmiyor", price: null, inStock: false, platform: "unknown" };
  }
}

async function _getProductInfo(url) {
  url = await expandUrl(url);
  const platform = detectPlatform(url);

  // ─── Hepsiburada: Önce API dene ───
  if (platform === "hepsiburada") {
    const apiResult = await fetchHepsiburadaViaApi(url);
    if (apiResult && apiResult.price) {
      console.log(`[HB] ✅ API ile ürün bilgisi alındı.`);
      return {
        name: apiResult.name || "Bilinmiyor",
        price: apiResult.price,
        inStock: true,
        platform,
      };
    }
    console.warn(`[HB] API başarısız, Puppeteer fallback devreye giriyor...`);
  }

  // ─── Trendyol: Önce API dene ───
  if (platform === "trendyol") {
    const apiResult = await fetchTrendyolViaApi(url);
    if (apiResult && apiResult.price) {
      console.log(`[TY] ✅ API ile ürün bilgisi alındı, Puppeteer açılmadı.`);
      return {
        name: apiResult.name || "Bilinmiyor",
        price: apiResult.price,
        inStock: true,
        platform,
      };
    }
    console.warn(`[TY] API başarısız, Puppeteer fallback devreye giriyor...`);
  }

  await waitForSlot();
  let page;
  try {
    const browser = await getBrowser();
    page = await openPage(browser, url);

    const priceSelectors = getPriceSelectors(platform);
    const nameSelectors = getNameSelectors(platform);

    const { rawPrice, name, inStock } = await extractFromPage(page, priceSelectors, nameSelectors, platform);

    let price = parsePrice(rawPrice);

    if (!price) {
      const html = await page.content();
      const aiPrice = await ai.extractPriceAI(html);
      if (aiPrice) price = aiPrice;
    }

    return {
      name: name || "Bilinmiyor",
      price,
      inStock,
      platform,
    };
  } finally {
    if (page) await page.close().catch(() => {});
    releaseSlot();
  }
}

module.exports = { getPrice, getProductInfo, parsePrice, detectPlatform };
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const fs = require("fs");
const ai = require("./ai");
const cheerio = require("cheerio");
puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0"
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const MAX_PAGES = 2; // Daha stabil çalışma için 3'ten 2'ye düşürüldü
const PAGE_TIMEOUT_MS = 25000;
const SLOT_WAIT_TIMEOUT_MS = 30000;
const BROWSER_IDLE_RESTART_MS = 15 * 60 * 1000; // 30dk çok uzun, 15dk'ya çekildi

// PRO LEVEL: Cache & Tracking
const scrapeCache = new Map();
const activeUrls = new Set();
const CACHE_TTL = 5 * 60 * 1000; 
const stats = { success: 0, fail: 0, blocks: 0 };
const platformFailCount = new Map();

const isProd = process.env.NODE_ENV === "production";
const headlessMode = process.env.HEADLESS !== "false";

const launchOptions = {
  executablePath: process.platform === "linux" 
    ? "/home/serkan/.cache/puppeteer/chrome/linux-147.0.7727.57/chrome-linux64/chrome"
    : undefined,
  headless: headlessMode,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    "--disable-infobars",
    "--disable-extensions",
    "--disable-features=IsolateOrigins,site-per-process",
    "--no-zygote",
    "--no-first-run",
    "--window-size=1280,720"
  ],
  protocolTimeout: 60000,
  timeout: 45000
};

let _browser = null;
let _launching = false;
let _activePages = 0;
let _restartTimer = null;

async function getBrowser() {
  if (_launching) {
    const deadline = Date.now() + 15000;
    while (_launching && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    if (_launching) throw new Error("Browser launch timeout");
  }

  if (_browser) {
    try {
      await _browser.version();
      return _browser;
    } catch (e) { 
      console.warn("[SCRAPER] Browser unresponsive, resetting...");
      try { await _browser.close(); } catch (_) {}
      _browser = null;
      _activePages = 0;
    }
  }

  _launching = true;
  try {
    if (!isProd) console.log("[SCRAPER] Browser başlatılıyor...");
    _browser = await puppeteer.launch(launchOptions);
    _browser.on("disconnected", () => { 
      _browser = null;
      _activePages = 0;
    });
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
        resolve(true); // Slot alındı
      } else if (Date.now() - startTime > SLOT_WAIT_TIMEOUT_MS) {
        reject(new Error(`Slot timeout`));
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
        try { await _browser.close(); } catch (_) {}
        _browser = null;
      }
    }, BROWSER_IDLE_RESTART_MS);
  }
}

// CACHE CLEANUP
setInterval(() => {
  if (!isProd) console.log("[PRO] Flushing cache...");
  scrapeCache.clear();
}, 10 * 60 * 1000);

// AUTO HEAL & HEALTH CHECK
setInterval(async () => {
  if (isProd) console.log(`[HEALTH] S:${stats.success} F:${stats.fail} B:${stats.blocks} | P:${_activePages} | C:${scrapeCache.size}`);
  
  if (stats.fail > 15 && _browser) { // 20'den 15'e çekildi
    console.warn("[PRO] High failure rate detected, resetting browser...");
    try { 
      const b = _browser;
      _browser = null;
      await b.close().catch(() => {});
    } catch (_) {}
    stats.fail = 0;
    _activePages = 0;
  }
}, 60000);

function extractHbProductId(url) {
  const match = url.match(/-(pm-[A-Z0-9]+)(?:[?#]|$)/i) || url.match(/\/([A-Z0-9]{10,})(?:[?#]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

async function fetchHepsiburadaViaApi(url) {
  try {
    const productId = extractHbProductId(url);
    if (!productId) return null;
    const res = await axios.get(`https://productdiscovery.hepsiburada.com/Search/GetProductInfo?ProductId=${productId}`, {
      timeout: 12000,
      headers: { "User-Agent": getRandomUA(), "Accept": "application/json", "Referer": "https://www.hepsiburada.com/" },
    });
    const d = res.data;
    const p = d?.price || d?.result?.price || d?.salePrice;
    if (p && !isNaN(parseFloat(p))) return { price: parseFloat(p), name: d?.name || d?.result?.name || null };
  } catch (err) {}
  return null;
}

function extractTrendyolProductId(url) {
  const match = url.match(/[?&-]p-(\d+)/i) || url.match(/\/p-(\d+)/i);
  return match ? match[1] : null;
}

async function fetchTrendyolViaApi(url) {
  try {
    const productId = extractTrendyolProductId(url);
    if (!productId) return null;
    const res = await axios.get(`https://public.trendyol.com/discovery-web-productgw-service/api/productGroupWithAttributes/${productId}?storefrontId=1&culture=tr-TR&currencyId=1&channelId=1`, {
      timeout: 12000,
      headers: { "User-Agent": getRandomUA(), "Accept": "application/json", "Referer": "https://www.trendyol.com/" },
    });
    const d = res.data?.result;
    const p = d?.price?.discountedPrice?.value || d?.price?.originalPrice?.value;
    if (p && !isNaN(parseFloat(p))) return { price: parseFloat(p), name: d?.name || null };
  } catch (err) {}
  return null;
}

async function fetchItopyaViaApi(url) {
  try {
    const res = await axios.get(url, {
      timeout: 12000,
      headers: { "User-Agent": getRandomUA() }
    });
    const $ = cheerio.load(res.data);
    
    const name = $("h1").first().text().trim();
    let price = null;
    
    const ldJson = $('script[type="application/ld+json"]').html();
    if (ldJson) {
      try {
        const parsed = JSON.parse(ldJson);
        const offers = parsed.offers || (parsed['@graph']?.find(x => x.offers)?.offers);
        price = offers?.price || offers?.lowPrice || (Array.isArray(offers) ? offers[0].price : null);
      } catch(e) {}
    }
    
    if (!price) {
      price = $(".product-price").first().text();
    }
    
    price = parsePrice(price);
    if (price) return { price, name };
  } catch(e) {}
  return null;
}

function detectPlatform(url) {
  const l = url.toLowerCase();
  if (l.includes("trendyol.com") || l.includes("ty.gl")) return "trendyol";
  if (l.includes("hepsiburada.com")) return "hepsiburada";
  if (l.includes("n11.com")) return "n11";
  if (l.includes("amazon.com")) return "amazon";
  return "generic";
}

async function expandUrl(url) {
  if (url.includes("ty.gl") || url.includes("bit.ly")) {
    try {
      const res = await axios.get(url, { maxRedirects: 5, validateStatus: null });
      return res.request.res.responseUrl || url;
    } catch (err) { return url; }
  }
  return url;
}

function parsePrice(raw) {
  if (!raw) return null;
  raw = String(raw).trim().toLowerCase().replace(/[tl|₺|€|$|usd|eur|\s]/g, "");
  if (raw.includes(".") && !raw.includes(",")) {
    const parts = raw.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) raw = raw.replace(/\./g, "");
  }
  if (raw.includes(",") && raw.includes(".")) {
    if (raw.indexOf(".") < raw.indexOf(",")) raw = raw.replace(/\./g, "").replace(",", ".");
    else raw = raw.replace(/,/g, "");
  } else if (raw.includes(",") && !raw.includes(".")) raw = raw.replace(",", ".");
  const val = parseFloat(raw);
  return (isNaN(val) || val <= 0) ? null : val;
}

async function getPrice(url) {
  if (activeUrls.has(url)) {
    if (!isProd) console.log(`[PRO] Skipping duplicate: ${url.substring(0, 40)}`);
    return null;
  }
  if (scrapeCache.has(url)) {
    const { data, time } = scrapeCache.get(url);
    if (Date.now() - time < CACHE_TTL) return data;
  }
  
  activeUrls.add(url);
  try {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await Promise.race([_getPrice(url), new Promise((_, r) => setTimeout(() => r(new Error("Global timeout")), PAGE_TIMEOUT_MS))]);
        if (res !== null) {
          scrapeCache.set(url, { data: res, time: Date.now() });
          stats.success++;
          return res;
        }
        throw new Error("Null price");
      } catch (err) {
        stats.fail++;
        if (i === 1) throw err;
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
  } catch (err) {
    return null;
  } finally {
    activeUrls.delete(url);
  }
}

async function _getPrice(url) {
  url = await expandUrl(url);
  const plat = detectPlatform(url);

  // CIRCUIT BREAKER
  const fails = platformFailCount.get(plat) || 0;
  if (fails > 5) {
    console.warn(`[PRO] Circuit breaker for ${plat}, cooling off...`);
    await new Promise(r => setTimeout(r, 60000));
    platformFailCount.set(plat, 0);
  }

  if (plat === "hepsiburada") {
    const api = await fetchHepsiburadaViaApi(url);
    if (api?.price) return api.price;
  }
  if (plat === "trendyol") {
    const api = await fetchTrendyolViaApi(url);
    if (api?.price) return api.price;
  }
  if (url.includes("itopya.com")) {
    const api = await fetchItopyaViaApi(url);
    if (api?.price) return api.price;
  }

  let hasSlot = false;
  let page;
  try {
    await waitForSlot();
    hasSlot = true;
    
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // RESOURCE OPTIMIZATION: Block images, fonts, media
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type) && !url.includes('itopya')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(getRandomUA());
    
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });

    const html = await page.content();
    if (html.includes("captcha") || html.includes("robot")) {
      stats.blocks++;
      throw new Error("BLOCKED");
    }

    try {
      await page.waitForSelector('.prc-dsc, .product-price, [data-testid="price-label"], #product-price, .amount', { timeout: 4000 });
    } catch(e) {}

    const res = await page.evaluate(() => {
      // 1. JSON-LD check (Most reliable)
      try {
        const ldTags = document.querySelectorAll('script[type="application/ld+json"]');
        for (const tag of ldTags) {
          const data = JSON.parse(tag.innerText);
          const offers = data.offers || data['@graph']?.find(x => x.offers)?.offers;
          if (offers) {
            const price = offers.price || offers.lowPrice || (Array.isArray(offers) ? offers[0].price : null);
            if (price) return { rawPrice: String(price) };
          }
        }
      } catch (e) {}

      // 2. Selectors
      const sels = [
        '.prc-dsc', '.product-price', '.pr-bx-nm', 
        "[data-testid='price-label']", 'span[class*="Price"]', 
        '[itemprop="price"]', '.product-price', '.amount',
        '#product-price', '.p-price'
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el) return { rawPrice: el.innerText || el.textContent };
      }
      return { rawPrice: null };
    });

    const price = parsePrice(res.rawPrice);
    if (price) platformFailCount.set(plat, 0);
    return price;
  } catch (err) {
    platformFailCount.set(plat, (platformFailCount.get(plat) || 0) + 1);
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
    if (hasSlot) releaseSlot();
  }
}

async function getProductInfo(url) {
  if (activeUrls.has(url)) return { name: "Loading...", price: null, inStock: false, platform: "unknown" };
  if (scrapeCache.has(url)) {
    const { data, time } = scrapeCache.get(url);
    if (Date.now() - time < CACHE_TTL) return data;
  }
  activeUrls.add(url);
  try {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await Promise.race([_getProductInfo(url), new Promise((_, r) => setTimeout(() => r(new Error("Global timeout")), PAGE_TIMEOUT_MS))]);
        if (res?.price) {
          scrapeCache.set(url, { data: res, time: Date.now() });
          stats.success++;
          return res;
        }
        throw new Error("Info missing");
      } catch (err) {
        stats.fail++;
        if (i === 1) throw err;
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
  } catch (err) {
    return { name: "Unknown", price: null, inStock: false, platform: "unknown" };
  } finally {
    activeUrls.delete(url);
  }
}

async function _getProductInfo(url) {
  url = await expandUrl(url);
  const plat = detectPlatform(url);
  if (plat === "hepsiburada") {
    const api = await fetchHepsiburadaViaApi(url);
    if (api?.price) return { name: api.name || "Bilinmiyor", price: api.price, inStock: true, platform: plat };
  }
  if (plat === "trendyol") {
    const api = await fetchTrendyolViaApi(url);
    if (api?.price) return { name: api.name || "Bilinmiyor", price: api.price, inStock: true, platform: plat };
  }
  if (url.includes("itopya.com")) {
    const api = await fetchItopyaViaApi(url);
    if (api?.price) return { name: api.name || "Bilinmiyor", price: api.price, inStock: true, platform: "itopya" };
  }

  let hasSlot = false;
  let page;
  try {
    await waitForSlot();
    hasSlot = true;

    const browser = await getBrowser();
    page = await browser.newPage();
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) req.abort();
      else req.continue();
    });

    await page.setUserAgent(getRandomUA());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    
    if ((await page.content()).includes("captcha")) throw new Error("BLOCKED");

    try {
      await page.waitForSelector('.prc-dsc, .product-price, [data-testid="price-label"], #product-price, .amount', { timeout: 4000 });
    } catch(e) {}

    const data = await page.evaluate(() => {
      const name = document.querySelector("h1")?.innerText?.trim();
      
      // JSON-LD
      let ldPrice = null;
      try {
        const ldTags = document.querySelectorAll('script[type="application/ld+json"]');
        for (const tag of ldTags) {
          const d = JSON.parse(tag.innerText);
          const offers = d.offers || d['@graph']?.find(x => x.offers)?.offers;
          if (offers) {
            ldPrice = offers.price || offers.lowPrice || (Array.isArray(offers) ? offers[0].price : null);
            if (ldPrice) break;
          }
        }
      } catch (e) {}

      const priceEl = document.querySelector('.prc-dsc') || document.querySelector('span[class*="Price"]') || document.querySelector('.product-price');
      return { name, rawPrice: ldPrice || priceEl?.innerText || priceEl?.textContent };
    });

    let price = parsePrice(data.rawPrice);

    return { name: data.name || "Bilinmiyor", price, inStock: true, platform: plat };
  } finally {
    if (page) await page.close().catch(() => {});
    if (hasSlot) releaseSlot();
  }
}

process.on("SIGINT", async () => {
  if (_browser) { try { await _browser.close(); } catch (_) {} }
  process.exit(0);
});

module.exports = { getPrice, getProductInfo, parsePrice, detectPlatform };
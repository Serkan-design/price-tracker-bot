/**
 * scrapers/base.js
 * Tüm scraper'ların ortak kullandığı yardımcılar
 */
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1366,768",
    ],
  });
}

async function openPage(browser, url, waitMs = 3000) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(randomUA());
  await page.setExtraHTTPHeaders({
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    Referer: "https://www.google.com/",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
  await new Promise((r) => setTimeout(r, waitMs));
  return page;
}

/**
 * Ham fiyat stringini float'a çevir
 * "1.234,56 TL" → 1234.56
 * "1,234.56"    → 1234.56
 * "450"         → 450
 */
function parsePrice(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Zaten temiz sayı
  if (/^\d+(\.\d{1,2})?$/.test(s)) {
    const v = parseFloat(s);
    return v >= 1 && v <= 999999 ? v : null;
  }

  // Türkçe binlik nokta + ondalık virgül: 1.234,56
  const trMatch = s.match(/([\d.]+),(\d{1,2})/);
  if (trMatch) {
    const cleaned = trMatch[1].replace(/\./g, "") + "." + trMatch[2];
    const v = parseFloat(cleaned);
    return v >= 1 && v <= 999999 ? v : null;
  }

  // İngiliz binlik virgül + ondalık nokta: 1,234.56
  const enMatch = s.match(/([\d,]+)\.(\d{1,2})$/);
  if (enMatch && enMatch[2].length <= 2) {
    const cleaned = enMatch[1].replace(/,/g, "") + "." + enMatch[2];
    const v = parseFloat(cleaned);
    return v >= 1 && v <= 999999 ? v : null;
  }

  // Sadece rakam çek
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length > 0) {
    const v = parseFloat(digits);
    return v >= 1 && v <= 999999 ? v : null;
  }

  return null;
}

/**
 * Birden fazla selector dene, ilk bulunanı döner
 */
async function trySelectors(page, selectors) {
  return page.evaluate((sels) => {
    // meta[itemprop='price'] her zaman önce
    const meta = document.querySelector("meta[itemprop='price']");
    if (meta) {
      const c = meta.getAttribute("content");
      if (c && /\d/.test(c)) return c.trim();
    }

    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = (
        el.getAttribute("content") ||
        el.innerText ||
        el.textContent ||
        ""
      ).trim();
      if (text && /\d/.test(text) && text.length < 30) return text;
    }
    return null;
  }, selectors);
}

/**
 * Stok durumunu body metninden tahmin et
 */
async function checkStock(page) {
  return page.evaluate(() => {
    const body = (document.body.innerText || "").toLowerCase();
    const outKW = [
      "stokta yok", "tükendi", "satışta değil",
      "out of stock", "stok yok", "ürün yok",
      "temin edilemiyor", "satışa kapalı",
    ];
    return !outKW.some((kw) => body.includes(kw));
  });
}

/**
 * Ürün başlığını bul
 */
async function getTitle(page, selectors = []) {
  const defaultSels = ["h1", "[itemprop='name']", "[class*='product-name']"];
  const allSels = [...selectors, ...defaultSels];
  return page.evaluate((sels) => {
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const t = (el.innerText || el.textContent || el.getAttribute("content") || "").trim();
      if (t && t.length > 3) return t.substring(0, 120);
    }
    return null;
  }, allSels);
}

module.exports = { launchBrowser, openPage, parsePrice, trySelectors, checkStock, getTitle };

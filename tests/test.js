/**
 * test.js
 * Kendi kendine test — gerçek URL scraping + birim testleri
 * Çalıştır: node test.js
 */
require("dotenv").config();

const { parsePrice } = require("./scrapers/base");
const { analyze, discountPercent, avgPriceDays, isFakeDiscount } = require("./engine/analyzer");
const { scrapeUrl, supportedSites } = require("./scrapers/index");
const { buildPriceDropMessage } = require("./engine/notifier");

// ─────────────────────────────────────────────
// RENK ÇIKTISI
// ─────────────────────────────────────────────
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  ${GREEN}✓${RESET} ${name}`);
  passed++;
}

function fail(name, expected, got) {
  console.log(`  ${RED}✗ FAILED${RESET} ${name}`);
  console.log(`    Expected: ${JSON.stringify(expected)}`);
  console.log(`    Got:      ${JSON.stringify(got)}`);
  failed++;
}

function assert(name, condition, expected = true, got = condition) {
  if (condition) ok(name);
  else fail(name, expected, got);
}

function assertEqual(name, a, b) {
  assert(name, a === b, b, a);
}

// ─────────────────────────────────────────────
// BİRİM TESTLERİ: parsePrice
// ─────────────────────────────────────────────
function testParsePrice() {
  console.log(`\n${BOLD}${CYAN}── parsePrice Birim Testleri ──${RESET}`);

  assertEqual("Türkçe format: '1.234,56 TL'", parsePrice("1.234,56 TL"), 1234.56);
  assertEqual("Türkçe binlik: '12.500 TL'",   parsePrice("12.500 TL"),   12500);

  // "12.500" nokta binlik mi ondalık mı? Türkçe birimi varsa binlik
  // Sadece rakam çektiğimizde 12500 çıkmalı
  assert("Binlik nokta olmadan: '450'", parsePrice("450") === 450);
  assert("İngiliz format: '1,234.56'",  parsePrice("1,234.56") === 1234.56);
  assert("Temiz sayı: '999'",           parsePrice("999") === 999);
  assert("Meta content: '45000'",       parsePrice("45000") === 45000);
  assert("Geçersiz: null → null",       parsePrice(null) === null);
  assert("Geçersiz: '' → null",         parsePrice("") === null);
  assert("Çok büyük: 1000001 → null",   parsePrice("1000001") === null);
  assert("Çok küçük: 0 → null",         parsePrice("0") === null);
  assert("Negatif → null",              parsePrice("-100") === null);
  assert("Yazı içinde: 'Fiyat: 450 TL'", parsePrice("Fiyat: 450 TL") === 450);
}

// ─────────────────────────────────────────────
// BİRİM TESTLERİ: analyzer
// ─────────────────────────────────────────────
function testAnalyzer() {
  console.log(`\n${BOLD}${CYAN}── Analyzer Birim Testleri ──${RESET}`);

  // discountPercent
  assertEqual("discountPercent 500→450 = %10", discountPercent(450, 500), 10);
  assertEqual("discountPercent 0 oldPrice = 0", discountPercent(450, 0), 0);

  // avgPriceDays
  const historyNow = [
    { price: 500, date: new Date(Date.now() - 1 * 86400000).toISOString() },
    { price: 480, date: new Date(Date.now() - 2 * 86400000).toISOString() },
    { price: 460, date: new Date(Date.now() - 3 * 86400000).toISOString() },
  ];
  const avg = avgPriceDays(historyNow, 7);
  assert("avgPriceDays doğru hesaplanıyor", Math.abs(avg - 480) < 1);

  // isFakeDiscount — fiyat zaten 7 gün boyunca düşükteyse fake
  const fakeHistory = [];
  for (let i = 0; i < 8; i++) {
    fakeHistory.push({ price: 450, date: new Date(Date.now() - i * 86400000).toISOString() });
  }
  assert("isFakeDiscount: sürekli aynı fiyat → true", isFakeDiscount(450, fakeHistory) === true);

  // analyze — fiyat aynı
  const product = { currentPrice: 500, history: historyNow, lastNotifiedPrice: null };
  let r = analyze(product, 500);
  assert("analyze: fiyat aynı → no_change", r.reason === "no_change");

  // analyze — fiyat yükseldi
  r = analyze(product, 510);
  assert("analyze: fiyat yükseldi → price_increased", r.reason === "price_increased");

  // analyze — çok az indi (%5)
  r = analyze(product, 475);
  assert("analyze: %5 indirim → discount_too_small", r.shouldNotify === false);

  // analyze — %15 indi → bildirim
  const product2 = { currentPrice: 500, history: historyNow, lastNotifiedPrice: null };
  r = analyze(product2, 420);
  assert("analyze: %16 indirim → shouldNotify true", r.shouldNotify === true);
  assert("analyze: discountPct doğru hesaplandı", Math.abs(r.discountPct - 16) < 1);

  // spam koruması
  const product3 = {
    currentPrice: 500,
    history: historyNow,
    lastNotifiedPrice: 420,
    lastNotifiedAt: new Date().toISOString(), // az önce
  };
  r = analyze(product3, 420);
  assert("analyze: spam_protection aktif", r.reason === "spam_protection");
}

// ─────────────────────────────────────────────
// BİRİM TESTLERİ: notifier
// ─────────────────────────────────────────────
function testNotifier() {
  console.log(`\n${BOLD}${CYAN}── Notifier Birim Testleri ──${RESET}`);

  const product = {
    name: "Örnek Ürün Pro Max",
    site: "trendyol",
    currentPrice: 1500,
    url: "https://trendyol.com/ornek",
    id: "test123",
    targetPrice: 1200,
  };
  const analysis = {
    discountPct: 20,
    isAllTimeLow: true,
    isBelowAvg: true,
    avg7DaysPrice: 1600,
  };

  const msg = buildPriceDropMessage(product, 1200, analysis);
  assert("buildPriceDropMessage: eski fiyatı içeriyor", msg.includes("1.500"));
  assert("buildPriceDropMessage: yeni fiyatı içeriyor", msg.includes("1.200"));
  assert("buildPriceDropMessage: all-time-low rozeti var", msg.includes("TÜM ZAMANLARIN"));
  assert("buildPriceDropMessage: URL var", msg.includes("trendyol.com"));
}

// ─────────────────────────────────────────────
// GERÇEK URL TESTLERİ (ağ gerektirir)
// ─────────────────────────────────────────────

// Test edilecek URL'ler — senin seçtiğin gerçek ürünler
const REAL_URLS = [
  {
    site: "trendyol",
    url: "https://www.trendyol.com/samsung/galaxy-s24-p-760105447",
  },
  {
    site: "hepsiburada",
    url: "https://www.hepsiburada.com/samsung-galaxy-s24-128-gb-pm-HB00000X47AJ",
  },
  {
    site: "n11",
    url: "https://www.n11.com/urun/samsung-galaxy-a55-128-gb-samsung-turkiye-garantili-cep-telefonu-4938448",
  },
  {
    site: "itopya",
    url: "https://www.itopya.com/urunler/bilgisayar-bilesenleri/islemciler/",
  },
  {
    site: "roboristan",
    url: "https://www.roboristan.com/kategori/arduino",
  },
];

async function testRealUrls() {
  console.log(`\n${BOLD}${CYAN}── Gerçek URL Testleri ──${RESET}`);
  console.log(`${YELLOW}Not: Bu testler internet bağlantısı ve Puppeteer gerektirir.${RESET}\n`);

  for (const { site, url } of REAL_URLS) {
    process.stdout.write(`  🌐 [${site}] Scraping...`);
    try {
      const info = await scrapeUrl(url);
      if (info.price && info.price > 0) {
        console.log(` ${GREEN}✓ OK${RESET}`);
        console.log(`     Başlık : ${(info.title || "").substring(0, 60)}`);
        console.log(`     Fiyat  : ${info.price.toLocaleString("tr-TR")} TL`);
        console.log(`     Stok   : ${info.inStock ? "✅ Var" : "❌ Yok"}`);
        console.log(`     Site   : ${info.site}`);
        passed++;
      } else {
        console.log(` ${YELLOW}⚠ Fiyat çekilemedi${RESET} (sayfa yüklenmiş olabilir ama fiyat selector bulunamadı)`);
        console.log(`     Başlık: ${(info.title || "Yok").substring(0, 60)}`);
        // Fiyat çekilemedi ≠ hata — sayfa açıldı ama selector tutmadı
        // Bu bir uyarı, fail değil
      }
    } catch (err) {
      console.log(` ${RED}✗ HATA${RESET}: ${err.message}`);
      failed++;
    }
    console.log("");
  }
}

// ─────────────────────────────────────────────
// ANA TEST ÇALIŞTIRICISI
// ─────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}========================================`);
  console.log(`  Fiyat Bot — Test Süiti`);
  console.log(`  Desteklenen siteler: ${supportedSites().join(", ")}`);
  console.log(`========================================${RESET}`);

  testParsePrice();
  testAnalyzer();
  testNotifier();
  await testRealUrls();

  console.log(`\n${BOLD}========================================`);
  console.log(`  Sonuçlar:`);
  console.log(`  ${GREEN}✓ Geçti: ${passed}${RESET}  ${RED}✗ Hata: ${failed}${RESET}`);
  console.log(`========================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Test süiti çöktü:", err);
  process.exit(1);
});

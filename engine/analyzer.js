/**
 * engine/analyzer.js
 * Akıllı fiyat analiz motoru
 * - Gerçek indirim mi? Fake indirim mi?
 * - 7 günlük geçmiş analizi
 * - Spam koruması
 */

const MIN_DISCOUNT_PERCENT = 10; // %10 altını bildirme
const MAX_PRICE = 100000;        // 100k TL üstünü görmezden gel (isteğe göre ayarla)
const NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 saat aynı fiyat için bildirim yok

/**
 * İndirim yüzdesi hesapla
 */
function discountPercent(price, oldPrice) {
  if (!oldPrice || oldPrice <= 0 || !price) return 0;
  return ((oldPrice - price) / oldPrice) * 100;
}

/**
 * Son N günün fiyat ortalaması
 */
function avgPriceDays(history, days = 7) {
  if (!history || history.length === 0) return null;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = history.filter((h) => new Date(h.date).getTime() > cutoff);
  if (recent.length === 0) return null;
  const sum = recent.reduce((acc, h) => acc + h.price, 0);
  return sum / recent.length;
}

/**
 * En düşük fiyat (tüm geçmiş)
 */
function allTimeMin(history) {
  if (!history || history.length === 0) return null;
  return Math.min(...history.map((h) => h.price));
}

/**
 * Fake indirim tespiti
 * Eğer son 7 günün %70'inden fazlasında fiyat zaten bu seviyedeyse → sahte indirim
 */
function isFakeDiscount(currentPrice, history) {
  if (!history || history.length < 3) return false; // Yeterli veri yok, şüphe etme
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter((h) => new Date(h.date).getTime() > cutoff);
  if (recent.length < 3) return false;

  // Eğer son 7 günün %70'inde fiyat bu fiyata çok yakınsa → fake
  const threshold = currentPrice * 1.05; // %5 tolerans
  const alreadyLow = recent.filter((h) => h.price <= threshold).length;
  return alreadyLow / recent.length >= 0.7;
}

/**
 * Ana karar fonksiyonu — bildirim gönderilmeli mi?
 * @param {Object} product - DB'deki ürün kaydı
 * @param {number} newPrice - Yeni fiyat
 * @returns {{ shouldNotify: boolean, reason: string, isAllTimeMin: boolean, discountPct: number }}
 */
function analyze(product, newPrice) {
  const oldPrice = product.currentPrice;
  const history = product.history || [];

  // Fiyat değişmedi
  if (newPrice === oldPrice) {
    return { shouldNotify: false, reason: "no_change" };
  }

  // Fiyat yükseldi
  if (newPrice > oldPrice) {
    return { shouldNotify: false, reason: "price_increased" };
  }

  // Fiyat düştü — analiz et
  const pct = discountPercent(newPrice, oldPrice);

  // Spam koruması: son 6 saatte aynı fiyatta bildirim atıldıysa atla
  if (product.lastNotifiedPrice === newPrice && product.lastNotifiedAt) {
    const elapsed = Date.now() - new Date(product.lastNotifiedAt).getTime();
    if (elapsed < NOTIFY_COOLDOWN_MS) {
      return { shouldNotify: false, reason: "spam_protection" };
    }
  }

  // Minimum indirim eşiği
  if (pct < MIN_DISCOUNT_PERCENT) {
    return { shouldNotify: false, reason: `discount_too_small (${pct.toFixed(1)}%)` };
  }

  // Çok pahalı filtresi
  if (newPrice > MAX_PRICE) {
    return { shouldNotify: false, reason: "price_too_high" };
  }

  // Fake indirim kontrolü
  if (isFakeDiscount(newPrice, history)) {
    return { shouldNotify: false, reason: "fake_discount" };
  }

  // 7 gün ortalamasının altında mı?
  const avg7 = avgPriceDays(history, 7);
  const belowAvg = avg7 !== null && newPrice < avg7 * 0.95;

  // Tüm zamanların en düşüğü mü?
  const atMin = allTimeMin(history);
  const isAtm = atMin !== null && newPrice <= atMin;

  // İndirim Oranı ve Önem Seviyesi
  let importance = "NORMAL";
  let importanceEmoji = "📉";

  if (pct >= 30) {
    importance = "MEGA";
    importanceEmoji = "🔥";
  } else if (pct >= 15) {
    importance = "İYİ";
    importanceEmoji = "⚡";
  }

  return {
    shouldNotify: true,
    reason: isAtm ? "all_time_low" : belowAvg ? "below_7day_avg" : "price_drop",
    importance,
    importanceEmoji,
    isAllTimeLow: isAtm,
    isBelowAvg: belowAvg,
    discountPct: pct.toFixed(1),
    avg7DaysPrice: avg7,
  };
}

/**
 * Hedef fiyata ulaşıldı mı?
 */
function reachedTarget(product, newPrice) {
  if (!product.targetPrice) return false;
  return newPrice <= product.targetPrice;
}

module.exports = {
  analyze,
  discountPercent,
  avgPriceDays,
  allTimeMin,
  isFakeDiscount,
  reachedTarget,
  MIN_DISCOUNT_PERCENT,
};

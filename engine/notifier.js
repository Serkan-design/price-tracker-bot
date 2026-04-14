/**
 * engine/notifier.js
 * Telegram bildirim şablonları - zengin ve anlamlı
 */

/**
 * Fiyat düşüşü bildirimi
 */
function buildPriceDropMessage(product, newPrice, analysis) {
  const { discountPct, isAllTimeLow, isBelowAvg, importance, importanceEmoji } = analysis;
  const diff = (product.currentPrice - newPrice).toLocaleString("tr-TR");
  const pct = discountPct.toFixed(1);

  // Rozet belirle
  let badge = `${importanceEmoji} ${importance ? `[${importance}] ` : ""}Fiyat Düştü!`;
  if (isAllTimeLow) badge = "💣 TÜM ZAMANLARIN EN DÜŞÜĞÜ!";
  else if (isBelowAvg) badge = "🔥 7 Gün Ortalamasının Altında!";

  const siteEmojis = {
    trendyol: "🛍️ Trendyol",
    hepsiburada: "🛒 Hepsiburada",
    n11: "🏪 N11",
    amazon: "📦 Amazon",
    itopya: "💻 İtopya",
    roboristan: "🤖 Roboristan",
  };
  const siteLabel = siteEmojis[product.site] || ("🌐 " + (product.site || ""));

  let msg =
    `${badge}\n\n` +
    `📦 <b>${(product.name || "Ürün").substring(0, 60)}</b>\n` +
    `🏬 ${siteLabel}\n\n` +
    `💸 Eski Fiyat: <s>${(product.currentPrice || 0).toLocaleString("tr-TR")} TL</s>\n` +
    `✅ Yeni Fiyat: <b>${newPrice.toLocaleString("tr-TR")} TL</b>\n` +
    `📉 İndirim: <b>${diff} TL (%${pct})</b>\n`;

  if (analysis.avg7DaysPrice) {
    msg += `📊 7 Gün Ort.: ${analysis.avg7DaysPrice.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL\n`;
  }

  msg += `\n🔗 <a href="${product.url}">Ürüne Git →</a>`;

  return msg;
}

/**
 * Hedef fiyata ulaşıldı - ek uyarı
 */
function buildTargetReachedMessage(product, newPrice) {
  return (
    `\n\n🎯 <b>HEDEF FİYATA ULAŞILDI!</b>\n` +
    `Hedef: ${product.targetPrice.toLocaleString("tr-TR")} TL — Şu an: ${newPrice.toLocaleString("tr-TR")} TL\n` +
    `⚡ <b>Hemen satın al, kaçırma!</b>`
  );
}

/**
 * Stok bildirimi (stoksuzdan stoklu)
 */
function buildBackInStockMessage(product, newPrice) {
  const siteLabel = product.site || "site";
  return (
    `📢 <b>STOKA GERİ DÖNDÜ!</b>\n\n` +
    `📦 <b>${(product.name || "Ürün").substring(0, 60)}</b>\n` +
    `🏬 ${siteLabel}\n` +
    `💰 Fiyat: <b>${newPrice.toLocaleString("tr-TR")} TL</b>\n\n` +
    `🔗 <a href="${product.url}">Satın Al →</a>`
  );
}

/**
 * Multi-site en ucuz karşılaştırma mesajı
 */
function buildCheapestMessage(productGroup) {
  // productGroup: aynı kullanıcının aynı ürün (farklı sitelerden takip ediliyorsa)
  const sorted = [...productGroup].sort((a, b) => (a.currentPrice || 0) - (b.currentPrice || 0));
  const cheapest = sorted[0];

  let msg =
    `🏆 <b>EN UCUZ MEVCUT!</b>\n\n` +
    `📦 ${(cheapest.name || "Ürün").substring(0, 60)}\n\n`;

  sorted.forEach((p, i) => {
    const prefix = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
    msg += `${prefix} ${p.site}: <b>${(p.currentPrice || 0).toLocaleString("tr-TR")} TL</b>\n`;
    msg += `   🔗 <a href="${p.url}">Git</a>\n`;
  });

  return msg;
}

/**
 * Takibe alındı onay mesajı
 */
function buildAddedMessage(product) {
  const statusEmoji = product.inStock ? "✅" : "❌";
  const stockText = product.inStock ? "Stokta var" : "STOKTA YOK";
  const siteLabel = product.site || "";

  return (
    `✅ <b>Ürün Takibe Alındı!</b>\n\n` +
    `📦 ${(product.name || "Bilinmiyor").substring(0, 80)}\n` +
    `🏬 ${siteLabel}\n` +
    `💰 Güncel Fiyat: <b>${(product.currentPrice || 0).toLocaleString("tr-TR")} TL</b>\n` +
    `${statusEmoji} Stok: ${stockText}\n\n` +
    `⏱ Her 5 dakikada kontrol edilecek.\n` +
    `💡 Hedef fiyat: <code>/hedef ${product.id} &lt;fiyat&gt;</code>`
  );
}

module.exports = {
  buildPriceDropMessage,
  buildTargetReachedMessage,
  buildBackInStockMessage,
  buildCheapestMessage,
  buildAddedMessage,
};

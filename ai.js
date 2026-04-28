require("dotenv").config();

/**
 * Gemini AI ile fiyat çıkarma (fallback)
 * Scraper başarısız olursa HTML'den AI ile fiyat bul
 */
let cooldownUntil = 0;

async function extractPriceAI(html) {
  return null;
}

module.exports = { extractPriceAI };
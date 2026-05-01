/**
 * signal.js
 * ──────────
 * Entry / Exit sinyal motoru — SKOR tabanlı deterministik sistem.
 *
 * ── ENTRY KURALI (BUY) ─────────────────────────────────────────
 *   Trend=UP   → +30 puan
 *   RSI 30–40  → +40 puan  (ideal dip bölgesi)
 *   RSI < 30   → +20 puan  (oversold, dikkatli giriş)
 *   Haber=BUY  → +20 puan
 *   Haber=NEU  → +10 puan
 *   Minimum skor: 60 → BUY aç
 *
 * ── ENTRY KURALI (SELL) ────────────────────────────────────────
 *   Trend=DOWN → +30 puan
 *   RSI 60–70  → +40 puan  (ideal tepe bölgesi)
 *   RSI > 70   → +20 puan  (overbought, dikkatli giriş)
 *   Haber=SELL → +20 puan
 *   Haber=NEU  → +10 puan
 *   Minimum skor: 60 → SELL aç
 *
 * ── YASAK KURALLAR ─────────────────────────────────────────────
 *   RSI > 70   → KESİNLİKLE BUY AÇILMAZ
 *   RSI < 30   → KESİNLİKLE SELL AÇILMAZ
 *   CONFLICT   → İşlem yok
 *   Veri yetersiz → İşlem yok
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Eşik Değerleri
// ─────────────────────────────────────────────────────────────

const RSI_BUY_MAX        = 40;   // BUY için RSI bu değerin ALTINDA olmalı
const RSI_BUY_IDEAL_MIN  = 30;   // Bu ile 40 arası → en yüksek skor
const RSI_SELL_MIN       = 60;   // SELL için RSI bu değerin ÜSTÜNDE olmalı
const RSI_SELL_IDEAL_MAX = 70;   // Bu ile 60 arası → en yüksek skor
const RSI_OVERBOUGHT     = 70;   // Aşırı alım (exit sinyali + BUY yasak)
const RSI_OVERSOLD       = 30;   // Aşırı satım (exit sinyali + SELL yasak)
const MIN_SCORE          = 60;   // Pozisyon açmak için minimum skor

// ─────────────────────────────────────────────────────────────
// Skor Hesaplama
// ─────────────────────────────────────────────────────────────

/**
 * BUY skoru hesaplar (0–100).
 */
function calcBuyScore(trend, rsi, newsSignal) {
  let score = 0;

  // Trend puanı
  if (trend === 'UP') score += 30;
  else return 0; // Trend UP değilse BUY skor hesaplamaya gerek yok

  // RSI puanı — ideal bölge: 30–40
  if (rsi >= RSI_BUY_IDEAL_MIN && rsi < RSI_BUY_MAX) score += 40; // En iyi bölge
  else if (rsi < RSI_BUY_IDEAL_MIN) score += 20; // Oversold, biraz riskli
  else return 0; // RSI >= 40 → BUY skoru sıfır

  // Haber puanı
  if (newsSignal === 'BUY') score += 20;
  else if (newsSignal === 'NEUTRAL') score += 10;
  else if (newsSignal === 'SELL') score -= 20; // Olumsuz etki
  // CONFLICT → 0 ekleme

  return Math.max(0, score);
}

/**
 * SELL skoru hesaplar (0–100).
 */
function calcSellScore(trend, rsi, newsSignal) {
  let score = 0;

  // Trend puanı
  if (trend === 'DOWN') score += 30;
  else return 0; // Trend DOWN değilse SELL skor hesaplamaya gerek yok

  // RSI puanı — ideal bölge: 60–70
  if (rsi > RSI_SELL_MIN && rsi <= RSI_SELL_IDEAL_MAX) score += 40; // En iyi bölge
  else if (rsi > RSI_SELL_IDEAL_MAX) score += 20; // Overbought, biraz riskli
  else return 0; // RSI <= 60 → SELL skoru sıfır

  // Haber puanı
  if (newsSignal === 'SELL') score += 20;
  else if (newsSignal === 'NEUTRAL') score += 10;
  else if (newsSignal === 'BUY') score -= 20;

  return Math.max(0, score);
}

// ─────────────────────────────────────────────────────────────
// Entry Sinyali
// ─────────────────────────────────────────────────────────────

/**
 * Giriş (entry) sinyali hesaplar — skor tabanlı.
 *
 * @param {{
 *   trend: 'UP'|'DOWN'|'NEUTRAL',
 *   rsi: number|null,
 *   newsSignal: 'BUY'|'SELL'|'NEUTRAL'|'CONFLICT'
 * }} params
 *
 * @returns {{
 *   signal: 'BUY'|'SELL'|'NEUTRAL',
 *   score: number,
 *   reason: string,
 *   blocked: string|null
 * }}
 */
function computeEntrySignal({ trend, rsi, newsSignal }) {

  // ── Temel Kontroller ────────────────────────────────────
  if (rsi === null) {
    return { signal: 'NEUTRAL', score: 0, reason: 'RSI verisi yetersiz', blocked: 'no_data' };
  }

  if (newsSignal === 'CONFLICT') {
    return { signal: 'NEUTRAL', score: 0, reason: 'Haber çelişkili', blocked: 'news_conflict' };
  }

  // ── KESİN YASAK KURALLAR ─────────────────────────────────
  // RSI > 70 iken KESİNLİKLE BUY AÇILMAZ
  if (trend === 'UP' && rsi >= RSI_OVERBOUGHT) {
    return {
      signal: 'NEUTRAL', score: 0,
      reason: `RSI=${rsi.toFixed(1)} AŞIRI ALIM bölgesi — Trend UP olsa bile BUY YASAK`,
      blocked: 'rsi_overbought',
    };
  }

  // RSI < 30 iken KESİNLİKLE SELL AÇILMAZ
  if (trend === 'DOWN' && rsi <= RSI_OVERSOLD) {
    return {
      signal: 'NEUTRAL', score: 0,
      reason: `RSI=${rsi.toFixed(1)} AŞIRI SATIM bölgesi — Trend DOWN olsa bile SELL YASAK`,
      blocked: 'rsi_oversold',
    };
  }

  // ── BUY Skor Hesabı ──────────────────────────────────────
  const buyScore = calcBuyScore(trend, rsi, newsSignal);
  if (buyScore >= MIN_SCORE) {
    return {
      signal: 'BUY',
      score: buyScore,
      reason: `SKOR=${buyScore}/100 | Trend=UP, RSI=${rsi.toFixed(1)}<${RSI_BUY_MAX}, Haber=${newsSignal}`,
      blocked: null,
    };
  }

  // ── SELL Skor Hesabı ─────────────────────────────────────
  const sellScore = calcSellScore(trend, rsi, newsSignal);
  if (sellScore >= MIN_SCORE) {
    return {
      signal: 'SELL',
      score: sellScore,
      reason: `SKOR=${sellScore}/100 | Trend=DOWN, RSI=${rsi.toFixed(1)}>${RSI_SELL_MIN}, Haber=${newsSignal}`,
      blocked: null,
    };
  }

  // ── Neden İşlem Yok? (debug log için) ───────────────────
  const reasons = [];
  if (trend === 'NEUTRAL') reasons.push('Trend=NEUTRAL (EMA50≈EMA200)');
  if (trend === 'UP' && rsi >= RSI_BUY_MAX) reasons.push(`RSI=${rsi.toFixed(1)} (BUY için <${RSI_BUY_MAX} gerekli)`);
  if (trend === 'DOWN' && rsi <= RSI_SELL_MIN) reasons.push(`RSI=${rsi.toFixed(1)} (SELL için >${RSI_SELL_MIN} gerekli)`);
  if (trend === 'UP' && newsSignal === 'SELL') reasons.push('Haber SELL — BUY engellendi');
  if (trend === 'DOWN' && newsSignal === 'BUY') reasons.push('Haber BUY — SELL engellendi');
  if (buyScore > 0 && buyScore < MIN_SCORE) reasons.push(`BUY skoru yetersiz (${buyScore}/${MIN_SCORE})`);
  if (sellScore > 0 && sellScore < MIN_SCORE) reasons.push(`SELL skoru yetersiz (${sellScore}/${MIN_SCORE})`);

  return {
    signal: 'NEUTRAL',
    score: Math.max(buyScore, sellScore),
    reason: reasons.join(' | ') || `Skor yetersiz (BUY:${buyScore} SELL:${sellScore} min:${MIN_SCORE})`,
    blocked: 'low_score',
  };
}

// ─────────────────────────────────────────────────────────────
// Exit Sinyali
// ─────────────────────────────────────────────────────────────

/**
 * Pozisyonun kapatılıp kapatılmaması gerektiğini değerlendirir.
 *
 * @param {{ direction, entryPrice, currentPrice }} position
 * @param {{ trend, rsi, newsSignal, ema200, currentSL }} market
 * @returns {{ shouldExit: boolean, reason: string, priority: number }}
 */
function computeExitSignal(position, market) {
  const { direction, currentPrice } = position;
  const { trend, rsi, newsSignal, ema200, currentSL } = market;

  // ── 1. Stop-Loss (EN YÜKSEK ÖNCELİK) ────────────────────
  if (direction === 'BUY' && currentPrice <= currentSL) {
    return { shouldExit: true, priority: 1, reason: `SL tetiklendi (${currentPrice.toFixed(2)} ≤ ${currentSL.toFixed(2)})` };
  }
  if (direction === 'SELL' && currentPrice >= currentSL) {
    return { shouldExit: true, priority: 1, reason: `SL tetiklendi (${currentPrice.toFixed(2)} ≥ ${currentSL.toFixed(2)})` };
  }

  // ── 2. Trend Tersine Döndü ───────────────────────────────
  if (direction === 'BUY' && trend === 'DOWN') {
    return { shouldExit: true, priority: 2, reason: 'Trend DOWN döndü — BUY kapatılıyor' };
  }
  if (direction === 'SELL' && trend === 'UP') {
    return { shouldExit: true, priority: 2, reason: 'Trend UP döndü — SELL kapatılıyor' };
  }

  // ── 3. RSI Aşırı Bölge ───────────────────────────────────
  if (rsi !== null) {
    if (direction === 'BUY' && rsi >= RSI_OVERBOUGHT) {
      return { shouldExit: true, priority: 3, reason: `RSI aşırı alım (${rsi.toFixed(1)} ≥ ${RSI_OVERBOUGHT}) — kâr al` };
    }
    if (direction === 'SELL' && rsi <= RSI_OVERSOLD) {
      return { shouldExit: true, priority: 3, reason: `RSI aşırı satım (${rsi.toFixed(1)} ≤ ${RSI_OVERSOLD}) — kâr al` };
    }
  }

  // ── 4. Haber Tersine Döndü ───────────────────────────────
  if (direction === 'BUY' && newsSignal === 'SELL') {
    return { shouldExit: true, priority: 4, reason: 'Haber SELL sinyali — BUY pozisyon tehlikede' };
  }
  if (direction === 'SELL' && newsSignal === 'BUY') {
    return { shouldExit: true, priority: 4, reason: 'Haber BUY sinyali — SELL pozisyon tehlikede' };
  }

  // ── 5. EMA200 Kırılması ───────────────────────────────────
  if (ema200 !== null) {
    if (direction === 'BUY' && currentPrice < ema200 * 0.999) { // %0.1 buffer
      return { shouldExit: true, priority: 5, reason: `Fiyat EMA200 altına kırdı (${currentPrice.toFixed(2)} < ${ema200.toFixed(2)})` };
    }
    if (direction === 'SELL' && currentPrice > ema200 * 1.001) {
      return { shouldExit: true, priority: 5, reason: `Fiyat EMA200 üstüne kırdı (${currentPrice.toFixed(2)} > ${ema200.toFixed(2)})` };
    }
  }

  return { shouldExit: false, priority: 0, reason: 'HOLD — koşullar devam ediyor' };
}

function isRsiExtreme(rsi) {
  if (rsi === null) return false;
  return rsi >= RSI_OVERBOUGHT || rsi <= RSI_OVERSOLD;
}

module.exports = {
  computeEntrySignal,
  computeExitSignal,
  calcBuyScore,
  calcSellScore,
  isRsiExtreme,
  RSI_BUY_MAX,
  RSI_BUY_IDEAL_MIN,
  RSI_SELL_MIN,
  RSI_SELL_IDEAL_MAX,
  RSI_OVERBOUGHT,
  RSI_OVERSOLD,
  MIN_SCORE,
  // Legacy alias
  RSI_BUY_THRESHOLD:  RSI_BUY_MAX,
  RSI_SELL_THRESHOLD: RSI_SELL_MIN,
};

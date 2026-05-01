/**
 * trend.js
 * ─────────
 * EMA50 / EMA200 çaprazına dayalı trend tespiti.
 *
 * Kural:
 *   EMA50 > EMA200  →  UP
 *   EMA50 < EMA200  →  DOWN
 *   Fark < eşik     →  NEUTRAL (flat piyasa)
 */

'use strict';

// EMA50 ile EMA200'ün yüzdesel farkı bu eşiğin altındaysa NEUTRAL sayılır
// (0.05 = %0.05 — çok az ayrışma varsa trend belirsiz)
const NEUTRAL_THRESHOLD_PCT = 0.05;

/**
 * Trend yönünü belirler.
 *
 * @param {number|null} ema50
 * @param {number|null} ema200
 * @returns {'UP'|'DOWN'|'NEUTRAL'}
 */
function detectTrend(ema50, ema200) {
  if (ema50 === null || ema200 === null) return 'NEUTRAL';

  const diffPct = ((ema50 - ema200) / ema200) * 100;

  if (Math.abs(diffPct) < NEUTRAL_THRESHOLD_PCT) return 'NEUTRAL';
  if (diffPct > 0) return 'UP';
  return 'DOWN';
}

/**
 * Trendin gücünü 0–100 arası döner (yüzdesel ayrışma).
 * Signal filtrelemede kullanılır (zayıf trend = daha dikkatli giriş).
 *
 * @param {number} ema50
 * @param {number} ema200
 * @returns {number} 0–100
 */
function trendStrength(ema50, ema200) {
  if (!ema50 || !ema200) return 0;
  const diffPct = Math.abs(((ema50 - ema200) / ema200) * 100);
  // %1 fark = tam güç (100), kapama cap
  return Math.min(100, Math.round(diffPct * 100));
}

/**
 * Trend değişimini tespit eder (önceki tick ile karşılaştır).
 *
 * @param {string} prevTrend — 'UP'|'DOWN'|'NEUTRAL'
 * @param {string} currTrend — 'UP'|'DOWN'|'NEUTRAL'
 * @returns {boolean}
 */
function isTrendChanged(prevTrend, currTrend) {
  if (!prevTrend) return false;
  return prevTrend !== currTrend;
}

module.exports = { detectTrend, trendStrength, isTrendChanged, NEUTRAL_THRESHOLD_PCT };

/**
 * risk.js
 * ────────
 * Risk yönetimi: Stop-Loss, Trailing Stop, Pozisyon Büyüklüğü.
 *
 * Kurallar:
 *   - Trade başına maks zarar: %1 (MAX_RISK_PER_TRADE_PCT)
 *   - Günlük maks zarar: %2 → sistem durur (MAX_DAILY_LOSS_PCT)
 *   - Trailing stop:
 *       %1 kâr → SL breakeven'a çek
 *       %2 kâr → SL = entry + %1
 *       Daha fazla kâr → SL trailing (kârın %50'si geride)
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Sabitler
// ─────────────────────────────────────────────────────────────

const MAX_RISK_PER_TRADE_PCT = 1.0;   // Her trade için maks risk (%1)
const MAX_DAILY_LOSS_PCT     = 2.0;   // Günlük maks zarar (%2)
const TRAILING_STEP_1_PCT    = 1.0;   // %1 kâr → SL breakeven
const TRAILING_STEP_2_PCT    = 2.0;   // %2 kâr → SL = entry + %1
const TRAILING_LOCK_RATIO    = 0.5;   // Kârın %50'sini kilitle (trailing mesafesi)

// ─────────────────────────────────────────────────────────────
// Stop-Loss Hesaplama
// ─────────────────────────────────────────────────────────────

/**
 * Başlangıç stop-loss fiyatını hesaplar (sabit %1 SL).
 *
 * @param {number} entryPrice
 * @param {'BUY'|'SELL'} direction
 * @returns {number} stop-loss fiyatı
 */
function calcInitialSL(entryPrice, direction) {
  if (direction === 'BUY') {
    return parseFloat((entryPrice * (1 - MAX_RISK_PER_TRADE_PCT / 100)).toFixed(4));
  }
  // SELL pozisyon için SL yukarıda
  return parseFloat((entryPrice * (1 + MAX_RISK_PER_TRADE_PCT / 100)).toFixed(4));
}

// ─────────────────────────────────────────────────────────────
// Trailing Stop Güncelleme
// ─────────────────────────────────────────────────────────────

/**
 * Mevcut kâra göre stop-loss'u günceller.
 * Mevcut SL'den DAHA İYİ bir değer hesaplanırsa SL hareket eder,
 * aksi hâlde SL OLDUĞU YERDE KALIR (trailing stop kaymaz geriye).
 *
 * @param {{
 *   entryPrice: number,
 *   direction: 'BUY'|'SELL',
 *   currentSL: number
 * }} position
 * @param {number} currentPrice
 * @returns {{ newSL: number, slMoved: boolean, trailingStage: string }}
 */
function updateTrailingStop(position, currentPrice) {
  const { entryPrice, direction, currentSL } = position;

  // Kâr yüzdesini hesapla
  const profitPct = direction === 'BUY'
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - currentPrice) / entryPrice) * 100;

  let newSL = currentSL;
  let trailingStage = 'INITIAL';

  if (direction === 'BUY') {
    if (profitPct >= TRAILING_STEP_2_PCT) {
      // %2+ kâr → SL = entry + %1 (kârın yarısını kilitle)
      const lockedSL = entryPrice * (1 + TRAILING_LOCK_RATIO * profitPct / 100);
      const minSL    = entryPrice * (1 + TRAILING_STEP_1_PCT / 100); // en az breakeven + %1
      newSL = Math.max(lockedSL, minSL);
      trailingStage = `TRAILING_${profitPct.toFixed(1)}%`;
    } else if (profitPct >= TRAILING_STEP_1_PCT) {
      // %1+ kâr → SL breakeven'a çek
      newSL = entryPrice;
      trailingStage = 'BREAKEVEN';
    }

    // SL sadece yukarı hareket edebilir (trailing = tek yönlü)
    if (newSL > currentSL) {
      return { newSL: parseFloat(newSL.toFixed(4)), slMoved: true, trailingStage };
    }
  } else {
    // SELL pozisyon için SL sadece aşağı hareket edebilir
    if (profitPct >= TRAILING_STEP_2_PCT) {
      const lockedSL = entryPrice * (1 - TRAILING_LOCK_RATIO * profitPct / 100);
      const maxSL    = entryPrice * (1 - TRAILING_STEP_1_PCT / 100);
      newSL = Math.min(lockedSL, maxSL);
      trailingStage = `TRAILING_${profitPct.toFixed(1)}%`;
    } else if (profitPct >= TRAILING_STEP_1_PCT) {
      newSL = entryPrice;
      trailingStage = 'BREAKEVEN';
    }

    if (newSL < currentSL) {
      return { newSL: parseFloat(newSL.toFixed(4)), slMoved: true, trailingStage };
    }
  }

  return { newSL: currentSL, slMoved: false, trailingStage: 'INITIAL' };
}

// ─────────────────────────────────────────────────────────────
// Pozisyon Büyüklüğü
// ─────────────────────────────────────────────────────────────

/**
 * Bakiye ve risk parametrelerine göre pozisyon büyüklüğünü (oz) hesaplar.
 *
 * Formül: riskAmount / (entryPrice - slPrice) = lot miktarı
 *
 * @param {number} balance     — mevcut bakiye (USD)
 * @param {number} entryPrice  — giriş fiyatı
 * @param {number} slPrice     — stop-loss fiyatı
 * @param {number} riskPct     — bakiyenin yüzdesi (varsayılan %1)
 * @returns {number} pozisyon büyüklüğü (oz), min 0.001
 */
function calcPositionSize(balance, entryPrice, slPrice, riskPct = MAX_RISK_PER_TRADE_PCT) {
  const riskAmount = balance * (riskPct / 100);
  const slDistance = Math.abs(entryPrice - slPrice);
  if (slDistance === 0) return 0.001;

  const size = riskAmount / slDistance;
  // Makul aralık: 0.001 – 1.0 oz
  return parseFloat(Math.min(1.0, Math.max(0.001, size)).toFixed(3));
}

// ─────────────────────────────────────────────────────────────
// Günlük Limit Kontrolü
// ─────────────────────────────────────────────────────────────

/**
 * Günlük zarar limitini aşıp aşmadığını kontrol eder.
 *
 * @param {number} balance         — başlangıç bakiyesi (günlük reset)
 * @param {number} dailyPnlUsd     — bugünkü gerçekleşen PnL (USD, negatif = zarar)
 * @returns {{ blocked: boolean, reason: string }}
 */
function checkDailyLimit(balance, dailyPnlUsd) {
  if (balance <= 0) return { blocked: false, reason: 'Bakiye sıfır' };

  const dailyLossPct = (dailyPnlUsd / balance) * 100;

  if (dailyLossPct <= -MAX_DAILY_LOSS_PCT) {
    return {
      blocked: true,
      reason: `Günlük zarar limiti aşıldı (%${dailyLossPct.toFixed(2)}, limit %${MAX_DAILY_LOSS_PCT})`,
    };
  }

  return { blocked: false, reason: `Günlük PnL: %${dailyLossPct.toFixed(2)}` };
}

/**
 * Gerçekleşmemiş PnL'yi USD olarak hesaplar.
 */
function calcUnrealizedPnl(position, currentPrice) {
  if (!position) return 0;
  const { entryPrice, size, direction } = position;
  if (direction === 'BUY') {
    return (currentPrice - entryPrice) * size;
  }
  return (entryPrice - currentPrice) * size;
}

/**
 * Kâr yüzdesini hesaplar.
 */
function calcProfitPct(entryPrice, currentPrice, direction) {
  if (direction === 'BUY') return ((currentPrice - entryPrice) / entryPrice) * 100;
  return ((entryPrice - currentPrice) / entryPrice) * 100;
}

module.exports = {
  calcInitialSL,
  updateTrailingStop,
  calcPositionSize,
  checkDailyLimit,
  calcUnrealizedPnl,
  calcProfitPct,
  MAX_RISK_PER_TRADE_PCT,
  MAX_DAILY_LOSS_PCT,
  TRAILING_STEP_1_PCT,
  TRAILING_STEP_2_PCT,
};

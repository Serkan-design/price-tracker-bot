/**
 * indicators.js
 * ─────────────
 * Teknik indikatör hesaplama fonksiyonları.
 * Saf matematik — dışa bağımlılık yok, stateless.
 *
 * Kullanım:
 *   const { calcEMA, calcRSI, calcATR } = require('./indicators');
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// EMA (Exponential Moving Average)
// ─────────────────────────────────────────────────────────────

/**
 * EMA hesaplar.
 * @param {number[]} closes — kapanış fiyatları dizisi (en eski → en yeni)
 * @param {number}   period — EMA periyodu (örn: 50, 200)
 * @returns {number|null}   — hesaplanan EMA değeri, yetersiz veri varsa null
 */
function calcEMA(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null;

  const k = 2 / (period + 1);

  // İlk EMA = ilk [period] barın basit ortalaması (SMA)
  let ema = closes.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

  // Kalanları EMA formülüyle işle
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }

  return ema;
}

// ─────────────────────────────────────────────────────────────
// RSI (Relative Strength Index)
// ─────────────────────────────────────────────────────────────

/**
 * Wilder RSI hesaplar (period=14 standart).
 * @param {number[]} closes
 * @param {number}   period  (varsayılan 14)
 * @returns {number|null}    0–100 arası RSI, yetersiz veriyse null
 */
function calcRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;

  const recent = closes.slice(-(period + 1));
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }

  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

// ─────────────────────────────────────────────────────────────
// ATR (Average True Range)
// ─────────────────────────────────────────────────────────────

/**
 * ATR hesaplar — volatilite ölçütü, stop-loss ve pozisyon büyüklüğü için kullanılır.
 *
 * @param {Array<{high:number, low:number, close:number}>} candles — OHLC mum dizisi
 * @param {number} period (varsayılan 14)
 * @returns {number|null} ATR değeri
 */
function calcATR(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;

  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }

  if (trs.length < period) return null;

  // İlk ATR = basit ortalama
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;

  // Wilder smoothing
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  return parseFloat(atr.toFixed(4));
}

// ─────────────────────────────────────────────────────────────
// SMA (yardımcı — EMA başlangıç değeri için)
// ─────────────────────────────────────────────────────────────

function calcSMA(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

// ─────────────────────────────────────────────────────────────
// Momentum (price change n bar önce)
// ─────────────────────────────────────────────────────────────

function calcMomentum(closes, period = 10) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  return closes[closes.length - 1] - closes[closes.length - 1 - period];
}

// ─────────────────────────────────────────────────────────────
// Toplu hesaplama (tek çağrıda tüm indikatörler)
// ─────────────────────────────────────────────────────────────

/**
 * Fiyat geçmişinden tüm indikatörleri hesaplar.
 *
 * @param {number[]} closes — kapanış fiyatları (en eski→en yeni)
 * @param {Array<{high,low,close}>} candles — OHLC (ATR için, opsiyonel)
 * @returns {{
 *   ema50: number|null,
 *   ema200: number|null,
 *   rsi: number|null,
 *   atr: number|null,
 *   sma20: number|null,
 *   momentum: number|null,
 *   currentPrice: number
 * }}
 */
function calcAll(closes, candles = null) {
  return {
    ema50:       calcEMA(closes, 50),
    ema200:      calcEMA(closes, 200),
    rsi:         calcRSI(closes, 14),
    atr:         candles ? calcATR(candles, 14) : null,
    sma20:       calcSMA(closes, 20),
    momentum:    calcMomentum(closes, 10),
    currentPrice: closes.length > 0 ? closes[closes.length - 1] : null,
  };
}

module.exports = { calcEMA, calcRSI, calcATR, calcSMA, calcMomentum, calcAll };

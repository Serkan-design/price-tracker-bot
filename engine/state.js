/**
 * state.js
 * ─────────
 * Global trading state — singleton.
 *
 * Tüm modüller bu dosyayı require ederek state'e erişir.
 * Doğrudan state nesnesi mutate edilmemeli, sadece
 * buradaki fonksiyonlar kullanılmalıdır.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Sabitler
// ─────────────────────────────────────────────────────────────

const DEFAULT_BALANCE_USD  = 10000;  // Başlangıç bakiyesi (USD)
const USD_TO_TRY           = 38.0;   // 1 USD = TL (canlı kur çekilmezse fallback)
const MAX_OPEN_POSITIONS   = 1;      // Aynı anda maks açık işlem (Tek pozisyon kuralı)
const HISTORY_MAX          = 2000;   // Max fiyat geçmişi (mum sayısı)
const MAX_TRADE_HISTORY    = 100;    // Saklanacak max kapatılmış işlem

// ─────────────────────────────────────────────────────────────
// State Nesnesi
// ─────────────────────────────────────────────────────────────

const _state = {
  // ── Bakiye ────────────────────────────────────────────────
  balanceUsd: DEFAULT_BALANCE_USD,
  dailyStartBalanceUsd: DEFAULT_BALANCE_USD, // Günlük sıfırlama referansı
  dailyPnlUsd: 0,     // Bugünkü gerçekleşen PnL (USD)
  totalPnlUsd: 0,     // Toplam gerçekleşen PnL (USD)
  usdToTry: USD_TO_TRY,

  // ── Pozisyonlar ───────────────────────────────────────────
  positions: [],      // Aktif pozisyonlar [{id, direction, entryPrice, size, sl, ...}]

  // ── İşlem Geçmişi ─────────────────────────────────────────
  tradeHistory: [],   // Kapatılmış işlemler

  // ── Fiyat Geçmişi ─────────────────────────────────────────
  priceHistory: [],   // [{price, high, low, close, timestamp}]
  lastPrice: null,

  // ── Motor Durumu ──────────────────────────────────────────
  isRunning: true,    // false → günlük limit aşıldı veya manuel durduruldu
  isBlocked: false,   // Günlük limit aşıldı mı?
  blockReason: null,
  lastTickAt: null,

  // ── Günlük Reset ──────────────────────────────────────────
  lastResetDate: new Date().toDateString(),

  // ── Son Market Durumu ─────────────────────────────────────
  lastMarket: null,   // { trend, rsi, ema50, ema200, atr, newsSignal, signal, ... }

  // ── İstatistikler ─────────────────────────────────────────
  totalTrades: 0,
  winCount: 0,
  lossCount: 0,
};

// ─────────────────────────────────────────────────────────────
// Yardımcı Fonksiyonlar
// ─────────────────────────────────────────────────────────────

/** Günlük sıfırlama gerekip gerekmediğini kontrol eder */
function checkDailyReset() {
  const today = new Date().toDateString();
  if (_state.lastResetDate !== today) {
    _state.dailyPnlUsd = 0;
    _state.dailyStartBalanceUsd = _state.balanceUsd;
    _state.isBlocked = false;
    _state.blockReason = null;
    _state.lastResetDate = today;
    console.log(`[STATE] 🌅 Günlük sıfırlama. Yeni gün başlangıç bakiyesi: $${_state.balanceUsd.toFixed(2)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Pozisyon CRUD
// ─────────────────────────────────────────────────────────────

function getPositions() {
  return [..._state.positions];
}

function getPosition(id) {
  return _state.positions.find(p => p.id === id) || null;
}

function addPosition(pos) {
  _state.positions.push(pos);
}

function updatePosition(id, updates) {
  const idx = _state.positions.findIndex(p => p.id === id);
  if (idx !== -1) {
    _state.positions[idx] = { ..._state.positions[idx], ...updates };
  }
}

function removePosition(id) {
  _state.positions = _state.positions.filter(p => p.id !== id);
}

function canOpenPosition() {
  return _state.positions.length < MAX_OPEN_POSITIONS;
}

// ─────────────────────────────────────────────────────────────
// Trade History
// ─────────────────────────────────────────────────────────────

function addTradeToHistory(trade) {
  _state.tradeHistory.unshift(trade); // En yeni başa
  if (_state.tradeHistory.length > MAX_TRADE_HISTORY) {
    _state.tradeHistory = _state.tradeHistory.slice(0, MAX_TRADE_HISTORY);
  }
  _state.totalTrades++;
  if (trade.pnlUsd >= 0) _state.winCount++;
  else _state.lossCount++;
}

// ─────────────────────────────────────────────────────────────
// Bakiye Yönetimi
// ─────────────────────────────────────────────────────────────

function applyPnl(pnlUsd) {
  _state.balanceUsd   += pnlUsd;
  _state.dailyPnlUsd  += pnlUsd;
  _state.totalPnlUsd  += pnlUsd;
}

function blockEngine(reason) {
  _state.isBlocked = true;
  _state.blockReason = reason;
  console.warn(`[STATE] 🚫 Motor bloke edildi: ${reason}`);
}

function unblockEngine() {
  _state.isBlocked = false;
  _state.blockReason = null;
}

// ─────────────────────────────────────────────────────────────
// Fiyat Geçmişi
// ─────────────────────────────────────────────────────────────

function addPricePoint(point) {
  _state.priceHistory.push(point);
  if (_state.priceHistory.length > HISTORY_MAX) {
    _state.priceHistory = _state.priceHistory.slice(-HISTORY_MAX);
  }
  _state.lastPrice = point.price;
}

function getCloses() {
  return _state.priceHistory.map(p => p.price);
}

function getCandles() {
  // Gerçek OHLC yoksa (tick data'da) close'u high/low olarak kullan
  return _state.priceHistory.map(p => ({
    high:  p.high  || p.price,
    low:   p.low   || p.price,
    close: p.price,
  }));
}

// ─────────────────────────────────────────────────────────────
// Full State Getter (dashboard için)
// ─────────────────────────────────────────────────────────────

function getFullState() {
  checkDailyReset();

  const totalPnlTry   = _state.totalPnlUsd * _state.usdToTry;
  const dailyPnlTry   = _state.dailyPnlUsd * _state.usdToTry;
  const balanceTry    = _state.balanceUsd * _state.usdToTry;
  const winRate       = _state.totalTrades > 0
    ? Math.round((_state.winCount / _state.totalTrades) * 100)
    : 0;

  return {
    // Bakiye
    balanceUsd:    parseFloat(_state.balanceUsd.toFixed(2)),
    balanceTry:    Math.round(balanceTry),
    dailyPnlUsd:   parseFloat(_state.dailyPnlUsd.toFixed(2)),
    dailyPnlTry:   Math.round(dailyPnlTry),
    totalPnlUsd:   parseFloat(_state.totalPnlUsd.toFixed(2)),
    totalPnlTry:   Math.round(totalPnlTry),
    usdToTry:      _state.usdToTry,

    // Pozisyonlar
    positions:     getPositions(),
    openCount:     _state.positions.length,
    canOpen:       canOpenPosition() && !_state.isBlocked && _state.isRunning,

    // Motor
    isRunning:     _state.isRunning,
    isBlocked:     _state.isBlocked,
    blockReason:   _state.blockReason,
    lastTickAt:    _state.lastTickAt,

    // İstatistikler
    totalTrades:   _state.totalTrades,
    winCount:      _state.winCount,
    lossCount:     _state.lossCount,
    winRate,

    // Market
    lastMarket:    _state.lastMarket,
    lastPrice:     _state.lastPrice,
    historyCount:  _state.priceHistory.length,

    // Trade history (son 50)
    tradeHistory:  _state.tradeHistory.slice(0, 50),
  };
}

// ─────────────────────────────────────────────────────────────
// Demo Reset
// ─────────────────────────────────────────────────────────────

function resetDemo(balanceUsd = DEFAULT_BALANCE_USD) {
  _state.balanceUsd             = balanceUsd;
  _state.dailyStartBalanceUsd   = balanceUsd;
  _state.dailyPnlUsd            = 0;
  _state.totalPnlUsd            = 0;
  _state.positions              = [];
  _state.tradeHistory           = [];
  _state.totalTrades            = 0;
  _state.winCount               = 0;
  _state.lossCount              = 0;
  _state.isBlocked              = false;
  _state.blockReason            = null;
  _state.isRunning              = true;
  _state.lastResetDate          = new Date().toDateString();
  console.log(`[STATE] 🔄 Demo sıfırlandı. Bakiye: $${balanceUsd}`);
}

module.exports = {
  // State erişimi
  get state() { return _state; },

  // Fiyat
  addPricePoint,
  getCloses,
  getCandles,

  // Pozisyon
  getPositions,
  getPosition,
  addPosition,
  updatePosition,
  removePosition,
  canOpenPosition,

  // Trade history
  addTradeToHistory,

  // Bakiye / PnL
  applyPnl,
  blockEngine,
  unblockEngine,

  // Yardımcı
  checkDailyReset,
  getFullState,
  resetDemo,

  // Sabitler
  MAX_OPEN_POSITIONS,
  DEFAULT_BALANCE_USD,
};

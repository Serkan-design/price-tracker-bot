/**
 * xauusd.js — Engine Adapter
 * ──────────────────────────
 * Yeni modüler engine'i eski server.js API'sine bağlar.
 * Geriye dönük uyumlu: server.js'deki tüm çağrılar çalışmaya devam eder.
 *
 * Yeni engine: engine/strategy.js (tek giriş noktası)
 */

'use strict';

const strategy = require('./engine/strategy');
const state    = require('./engine/state');
const position = require('./engine/position');
const signal   = require('./engine/signal');
const news     = require('./engine/news');
const risk     = require('./engine/risk');

// ─────────────────────────────────────────────────────────────
// Alert Callback (Telegram / Email için)
// ─────────────────────────────────────────────────────────────

function setAlertCallback(fn) {
  strategy.setAlertCallback(fn);
}

// ─────────────────────────────────────────────────────────────
// Engine Başlat / Durdur
// ─────────────────────────────────────────────────────────────

/**
 * @param {number} intervalMs — eski API uyumluluğu için alınır ama kullanılmaz
 *                              (yeni engine her 10–15sn tick atar)
 */
function startPolling(_intervalMs = 15_000) {
  strategy.startEngine();
}

function stopPolling() {
  strategy.stopEngine();
}

// ─────────────────────────────────────────────────────────────
// Piyasa Analizi
// ─────────────────────────────────────────────────────────────

/**
 * Son tick'ten market analizini döner.
 * Eski API: xauusd.getAnalysis()
 */
function getAnalysis() {
  const s = state.getFullState();
  const m = s.lastMarket;
  if (!m) return null;

  return {
    price:         m.price,
    change:        0,
    changePct:     0,
    rsi:           m.rsi,
    rsiSignal:     m.rsi >= 70 ? 'OVERBOUGHT' : m.rsi <= 30 ? 'OVERSOLD' : 'NEUTRAL',
    trend:         m.trend,
    signal:        m.entrySignal,
    confidence:    m.trendStrength,
    ema50:         m.ema50,
    ema200:        m.ema200,
    atr:           m.atr,
    newsSignal:    m.newsSignal,
    newsState:     m.newsState,
    entryReason:   m.entryReason,
    score:         m.score,
    blocked:       m.blocked,
    historyCount:  m.historyCount,
    timestamp:     m.timestamp,
    // Legacy fields
    confidenceText: m.trendStrength > 80 ? 'Yüksek Güven' : m.trendStrength > 50 ? 'Orta Güven' : 'Düşük Güven',
    insights: {
      main:   `Trend: ${m.trend} | RSI: ${m.rsi?.toFixed(1) ?? '--'} | Haber: ${m.newsSignal}`,
      detail: m.entryReason,
    },
    support:    [],
    resistance: [],
    pattern:    null,
    sma20:      m.sma20,
    globalStats: { totalAlerts: 0, lastAlertAt: m.timestamp },
  };
}

/**
 * Fiyat geçmişini döner.
 * Eski API: xauusd.getHistory(n)
 */
function getHistory(n = 200) {
  const closes = state.getCloses();
  return closes.slice(-n).map((price, i, arr) => ({
    price,
    timestamp: new Date(Date.now() - (arr.length - i) * 12000).toISOString(),
  }));
}

/**
 * Manuel canlı analiz (server.js /api/xauusd/live için).
 */
async function fetchAndAnalyze() {
  await strategy.manualTick();
  return getAnalysis();
}

// ─────────────────────────────────────────────────────────────
// Backtest (Legacy)
// ─────────────────────────────────────────────────────────────

function runBacktest(n = 500) {
  const closes = state.getCloses().slice(-n);
  if (closes.length < 50) return { error: 'Yeterli veri yok (min 50 bar)' };

  const { calcEMA, calcRSI } = require('./engine/indicators');
  const trades = [];
  let openTrade = null;

  for (let i = 50; i < closes.length; i++) {
    const window = closes.slice(0, i + 1);
    const ema50  = calcEMA(window, 50);
    const ema200 = calcEMA(window, 200);
    const rsi    = calcRSI(window, 14);
    const { detectTrend } = require('./engine/trend');
    const trend  = detectTrend(ema50, ema200);
    const entry  = signal.computeEntrySignal({ trend, rsi, newsSignal: 'NEUTRAL' });
    const cur    = window[window.length - 1];

    if (!openTrade && entry.signal !== 'NEUTRAL') {
      const sl = risk.calcInitialSL(cur, entry.signal);
      openTrade = { signal: entry.signal, entryPrice: cur, sl, entryIdx: i };
      continue;
    }

    if (openTrade) {
      const bars = i - openTrade.entryIdx;
      const hitSL = openTrade.signal === 'BUY' ? cur <= openTrade.sl : cur >= openTrade.sl;
      const shouldExit = hitSL || bars >= 20;

      if (shouldExit) {
        const pnl = openTrade.signal === 'BUY'
          ? cur - openTrade.entryPrice
          : openTrade.entryPrice - cur;
        trades.push({
          signal:     openTrade.signal,
          entryPrice: Math.round(openTrade.entryPrice * 100) / 100,
          exitPrice:  Math.round(cur * 100) / 100,
          pnl:        Math.round(pnl * 100) / 100,
          bars,
          win:        pnl > 0,
          exitReason: hitSL ? 'SL' : 'TIMEOUT',
        });
        openTrade = null;
      }
    }
  }

  if (trades.length === 0) return { error: 'Bu pencerede sinyal üretilmedi' };

  const wins     = trades.filter(t => t.win).length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  let peak = 0, equity = 0, maxDrawdown = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    barsAnalyzed: closes.length,
    totalTrades:  trades.length,
    winRate:      Math.round((wins / trades.length) * 100),
    totalPnl:     Math.round(totalPnl * 100) / 100,
    avgPnl:       Math.round((totalPnl / trades.length) * 100) / 100,
    maxDrawdown:  Math.round(maxDrawdown * 100) / 100,
    trades:       trades.slice(-50),
  };
}

// ─────────────────────────────────────────────────────────────
// Trading Stats (Legacy API)
// ─────────────────────────────────────────────────────────────

function getTradingStats() {
  const s = state.getFullState();
  const pos = s.positions[0] || null; // İlk pozisyon (legacy uyumu)

  let unrealizedPnlTl = 0;
  if (pos && s.lastPrice) {
    unrealizedPnlTl = Math.round(
      risk.calcUnrealizedPnl(pos, s.lastPrice) * s.usdToTry
    );
  }

  return {
    // Legacy fields
    virtualBalance:  Math.round(s.balanceTry),
    currentPosition: pos ? {
      entryPrice:   pos.entryPrice,
      entryPriceTL: Math.round(pos.entryPrice * pos.size * s.usdToTry),
      type:         pos.direction,
      amount:       pos.size,
      cost:         pos.entryPrice * pos.size * s.usdToTry,
      time:         pos.entryAt,
      sl:           pos.currentSL,
      trailingStage: pos.trailingStage,
    } : null,
    totalProfit:     s.totalPnlTry,
    dailyProfit:     s.dailyPnlTry,
    totalProfitTl:   s.totalPnlTry,
    dailyProfitTl:   s.dailyPnlTry,
    unrealizedPnlTl,
    tradeHistory:    s.tradeHistory.map(t => ({
      ...t,
      pnlTl:     t.pnlTry,
      result:    t.result,
      exitPrice: t.exitPrice,
    })),
    isEnabled:       s.isRunning && !s.isBlocked,
    isBlocked:       s.isBlocked,
    blockReason:     s.blockReason,

    // Yeni alanlar (dashboard'da kullanılır)
    positions:       s.positions,
    openCount:       s.openCount,
    winRate:         s.winRate,
    totalTrades:     s.totalTrades,
    winCount:        s.winCount,
    lossCount:       s.lossCount,
    balanceUsd:      s.balanceUsd,
    dailyPnlUsd:     s.dailyPnlUsd,
    totalPnlUsd:     s.totalPnlUsd,
    usdToTry:        s.usdToTry,
    tlRate:          s.usdToTry,
    newsSignal:      state.state.lastMarket?.newsSignal,
    newsState:       state.state.lastMarket?.newsState,
    lastTickAt:      s.lastTickAt,
    cooldownRemaining: 0,
    minProfitTl:     0,
    tradeAmountOz:   s.positions[0]?.size || 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Demo Reset
// ─────────────────────────────────────────────────────────────

function resetTradingStats() {
  state.resetDemo();
}

// ─────────────────────────────────────────────────────────────
// Manual Trade (Legacy API — server.js'den çağrılır)
// ─────────────────────────────────────────────────────────────

function openPosition(type, price) {
  return position.manualOpenPosition(type, price);
}

function closePositionManual(price) {
  const positions = state.getPositions();
  if (positions.length === 0) return { success: false, message: 'Açık pozisyon yok' };
  return position.manualClosePosition(positions[0].id, price);
}

// ─────────────────────────────────────────────────────────────
// Alert Seviyeleri (Legacy — artık pasif, sinyal kurallarla geliyor)
// ─────────────────────────────────────────────────────────────

function setAlertLevels() {
  // Yeni engine'de dinamik olarak hesaplanıyor, bu fonksiyon artık no-op
}

// ─────────────────────────────────────────────────────────────
// Exports (Geriye Dönük Uyumlu)
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Engine lifecycle
  startPolling,
  stopPolling,

  // Market data
  getAnalysis,
  getHistory,
  fetchAndAnalyze,

  // Trading
  getTradingStats,
  resetTradingStats,
  openPosition,
  closePositionManual,

  // Backtest
  runBacktest,

  // Alerts
  setAlertCallback,
  setAlertLevels,

  // New engine API (server.js yeni endpoint'leri için)
  getFullState: () => state.getFullState(),
  getPositions: () => state.getPositions(),
  engineStatus: () => ({
    isRunning:    strategy.isEngineRunning(),
    isBlocked:    state.state.isBlocked,
    blockReason:  state.state.blockReason,
    historyCount: state.state.priceHistory.length,
    lastTickAt:   state.state.lastTickAt,
  }),
  toggleEngine: () => {
    if (strategy.isEngineRunning()) {
      strategy.stopEngine();
      return { isRunning: false };
    } else {
      strategy.startEngine();
      return { isRunning: true };
    }
  },
  manualCloseAll: (price) => position.manualCloseAll(price),
};

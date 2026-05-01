/**
 * strategy.js
 * ────────────
 * Ana trading orchestrator — "tick" döngüsü burada çalışır.
 *
 * Her tick (10–15 saniyede bir):
 *   1. Canlı fiyat çek
 *   2. İndikatörleri hesapla (EMA50/200, RSI, ATR)
 *   3. Trend, RSI, haber sinyalini birleştir
 *   4. Açık pozisyonlar → trailing stop güncelle → exit kontrolü
 *   5. Yeni pozisyon açılabilir mi? → entry sinyali kontrol et
 *   6. Günlük limit kontrolü
 *   7. State güncelle
 */

'use strict';

const axios      = require('axios');
const indicators = require('./indicators');
const trendMod   = require('./trend');
const newsMod    = require('./news');
const signal     = require('./signal');
const risk       = require('./risk');
const position   = require('./position');
const state      = require('./state');

// ─────────────────────────────────────────────────────────────
// Sabitler
// ─────────────────────────────────────────────────────────────

const MIN_TICK_MS        = 10_000;       // 10 saniye
const MAX_TICK_MS        = 15_000;       // 15 saniye
const MIN_CANDLES        = 205;          // EMA200 için minimum bar
const TRADE_COOLDOWN_MS  = 2 * 60_000;  // Aynı yönde art arda işlem arası minimum 2 dk
const MAX_AUTO_POSITIONS = 1;            // Aynı anda max 1 otomatik pozisyon

let _tickTimeout       = null;
let _isRunning         = false;
let _alertCallback     = null;
let _lastTradeAt       = 0;     // Son trade zamanı (cooldown için)
let _lastTradePrice    = null;  // Son trade fiyatı (aynı fiyat koruması için)
let _lastTradeDir      = null;  // Son trade yönü

// ─────────────────────────────────────────────────────────────
// Fiyat Kaynakları
// ─────────────────────────────────────────────────────────────

async function fetchFromGoldApi() {
  const res = await axios.get('https://api.gold-api.com/price/XAU', {
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const price = parseFloat(res.data?.price);
  if (!isNaN(price) && price > 100) return price;
  throw new Error('gold-api: geçersiz veri');
}

async function fetchFromYahoo() {
  const res = await axios.get(
    'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d',
    {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }
  );
  const price = parseFloat(res.data?.chart?.result?.[0]?.meta?.regularMarketPrice);
  if (!isNaN(price) && price > 100) return price;
  throw new Error('Yahoo: geçersiz veri');
}

async function fetchLivePrice() {
  for (const fn of [fetchFromGoldApi, fetchFromYahoo]) {
    try { return await fn(); } catch (_) {}
  }
  return null;
}

// USD/TL kuru çek
async function fetchUsdTryRate() {
  try {
    const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 8000,
    });
    const rate = parseFloat(res.data?.rates?.TRY);
    if (!isNaN(rate) && rate > 10) return rate;
  } catch (_) {}
  return state.state.usdToTry; // fallback mevcut değer
}

// ─────────────────────────────────────────────────────────────
// Ana Tick
// ─────────────────────────────────────────────────────────────

async function tick() {
  // Günlük sıfırlama kontrolü
  state.checkDailyReset();

  // ── 1. Canlı fiyat al ────────────────────────────────────
  const price = await fetchLivePrice();
  if (price === null) {
    console.warn('[STRAT] ⚠️ Fiyat alınamadı, tick atlanıyor');
    return null;
  }

  // Fiyat noktasını kaydet
  state.addPricePoint({ price, timestamp: new Date().toISOString() });
  state.state.lastTickAt = new Date().toISOString();

  const closes  = state.getCloses();
  const candles = state.getCandles();

  // ── 2. İndikatörler ─────────────────────────────────────
  const { ema50, ema200, rsi, atr, sma20 } = indicators.calcAll(closes, candles);

  // ── 3. Trend ─────────────────────────────────────────────
  const trend    = trendMod.detectTrend(ema50, ema200);
  const strength = trendMod.trendStrength(ema50, ema200);

  // ── 4. Haber Sinyali ─────────────────────────────────────
  const newsSignal = newsMod.getNewsSignal();
  const newsState  = newsMod.getNewsState();

  // ── 5. Entry Sinyali ─────────────────────────────────────
  const entryResult = signal.computeEntrySignal({ trend, rsi, newsSignal });

  // ── 6. Market State Güncelle ─────────────────────────────
  const prevTrend = state.state.lastMarket?.trend;
  state.state.lastMarket = {
    price,
    ema50:       ema50   ? parseFloat(ema50.toFixed(2))   : null,
    ema200:      ema200  ? parseFloat(ema200.toFixed(2))  : null,
    rsi:         rsi     ? parseFloat(rsi.toFixed(1))     : null,
    atr:         atr     ? parseFloat(atr.toFixed(2))     : null,
    sma20:       sma20   ? parseFloat(sma20.toFixed(2))   : null,
    trend,
    trendStrength: strength,
    newsSignal,
    newsState,
    entrySignal: entryResult.signal,
    entryReason: entryResult.reason,
    score:       entryResult.score,
    blocked:     entryResult.blocked,
    historyCount: closes.length,
    timestamp:   new Date().toISOString(),
  };

  // Veri birikiyor mu? Yeterli bar yoksa işlem yok
  if (closes.length < MIN_CANDLES) {
    console.log(
      `[STRAT] 📊 Veri birikimi: ${closes.length}/${MIN_CANDLES} bar | ` +
      `Fiyat=$${price.toFixed(2)} | RSI=${rsi?.toFixed(1) ?? '--'} | Trend=${trend}`
    );
    return buildTickResult(price, trend, rsi, entryResult);
  }

  // ── 7. Günlük Limit Kontrolü ─────────────────────────────
  const dailyCheck = risk.checkDailyLimit(
    state.state.dailyStartBalanceUsd,
    state.state.dailyPnlUsd
  );
  if (dailyCheck.blocked && !state.state.isBlocked) {
    state.blockEngine(dailyCheck.reason);
    fireAlert('DAILY_LIMIT', { message: `🚫 ${dailyCheck.reason}` });
  }

  // ── 8. Açık Pozisyonları Yönet ───────────────────────────
  const positions = state.getPositions();

  for (const pos of positions) {
    // Trailing stop güncelle
    position.updatePositionTrailing(pos.id, price);

    // Güncel SL'yi al (trailing sonrası değişmiş olabilir)
    const updatedPos = state.getPosition(pos.id);
    if (!updatedPos) continue; // Arada kapatıldıysa atla

    // Exit koşullarını kontrol et
    const exitResult = signal.computeExitSignal(updatedPos, {
      trend,
      rsi,
      newsSignal,
      ema200,
      currentSL: updatedPos.currentSL,
    });

    if (exitResult.shouldExit) {
      const closeResult = position.closePosition(pos.id, price, exitResult.reason);

      if (closeResult.success) {
        const trade = closeResult.trade;
        const icon = trade.result === 'WIN' ? '💰' : '💸';
        fireAlert('TRADE_CLOSED', {
          message: `${icon} İşlem kapandı (${trade.result})\nPnL: $${trade.pnlUsd} (${trade.pnlPct}%)\nNeden: ${exitResult.reason}`,
          trade,
        });

        // Günlük limit tekrar kontrol et (kapandıktan sonra)
        const updatedCheck = risk.checkDailyLimit(
          state.state.dailyStartBalanceUsd,
          state.state.dailyPnlUsd
        );
        if (updatedCheck.blocked && !state.state.isBlocked) {
          state.blockEngine(updatedCheck.reason);
        }
      }
    }
  }

  // ── 9. Yeni Pozisyon Aç ───────────────────────────────────
  const openPositions = state.getPositions();
  const canAutoOpen   = (
    !state.state.isBlocked &&
    openPositions.length < MAX_AUTO_POSITIONS && // Max 1 otomatik pozisyon
    entryResult.signal !== 'NEUTRAL'
  );

  if (canAutoOpen) {
    const now = Date.now();

    // Cooldown kontrolü: son işlemden 2 dk geçmeli
    const cooldownLeft = TRADE_COOLDOWN_MS - (now - _lastTradeAt);
    if (cooldownLeft > 0) {
      console.log(`[STRAT] ⏳ Trade cooldown: ${Math.ceil(cooldownLeft/1000)}sn kaldı`);
    }
    // Aynı fiyat koruması: fark < $1 ise açma
    else if (_lastTradePrice && Math.abs(price - _lastTradePrice) < 1.0 && _lastTradeDir === entryResult.signal) {
      console.log(`[STRAT] 🔒 Aynı fiyat koruması: son=${_lastTradePrice?.toFixed(2)} şu=${price.toFixed(2)} — trade atlandı`);
    }
    else {
      const openResult = position.openPosition(entryResult.signal, price, entryResult.reason);

      if (openResult.success) {
        _lastTradeAt    = now;
        _lastTradePrice = price;
        _lastTradeDir   = entryResult.signal;

        fireAlert('TRADE_OPENED', {
          message: `📈 Pozisyon açıldı (${entryResult.signal}) SKOR:${entryResult.score}\nGiriş=$${price.toFixed(2)} | SL=$${openResult.position.currentSL.toFixed(2)}\nNeden: ${entryResult.reason}`,
          position: openResult.position,
        });
      }
    }
  }

  const result = buildTickResult(price, trend, rsi, entryResult);

  // Log (her tick)
  const posCount = state.getPositions().length;
  console.log(
    `[STRAT] 🕐 Fiyat=$${price.toFixed(2)} | EMA50=${ema50?.toFixed(1) ?? '--'} EMA200=${ema200?.toFixed(1) ?? '--'} | ` +
    `RSI=${rsi?.toFixed(1) ?? '--'} | Trend=${trend} | Haber=${newsSignal} | ` +
    `Sinyal=${entryResult.signal} | Pos=${posCount} | ${dailyCheck.reason}`
  );

  return result;
}

// ─────────────────────────────────────────────────────────────
// Tick Sonucu (API'ye döner)
// ─────────────────────────────────────────────────────────────

function buildTickResult(price, trend, rsi, entryResult) {
  return {
    price,
    trend,
    rsi,
    signal: entryResult.signal,
    reason: entryResult.reason,
    ...state.getFullState(),
  };
}

// ─────────────────────────────────────────────────────────────
// Alert Callback
// ─────────────────────────────────────────────────────────────

function setAlertCallback(fn) {
  _alertCallback = fn;
}

function fireAlert(type, data) {
  if (_alertCallback) {
    try { _alertCallback(type, data); } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────
// Polling Döngüsü (rastgele 10–15 saniye)
// ─────────────────────────────────────────────────────────────

async function scheduleTick() {
  if (!_isRunning) return;

  try {
    await tick();
  } catch (err) {
    console.error('[STRAT] Tick hatası:', err.message);
  }

  if (!_isRunning) return;

  // Rastgele 10–15 saniye bekle
  const delay = MIN_TICK_MS + Math.random() * (MAX_TICK_MS - MIN_TICK_MS);
  _tickTimeout = setTimeout(scheduleTick, delay);
}

function startEngine() {
  if (_isRunning) return;
  _isRunning = true;

  // Haber motorunu başlat
  newsMod.startNewsPolling().catch(err =>
    console.warn('[STRAT] Haber başlatma hatası:', err.message)
  );

  // USD/TL kurunu periyodik güncelle (30 dk)
  const updateRate = async () => {
    const rate = await fetchUsdTryRate();
    state.state.usdToTry = rate;
    console.log(`[STRAT] 💱 USD/TL kuru: ${rate}`);
  };
  updateRate();
  setInterval(updateRate, 30 * 60 * 1000);

  // İlk tick'i hemen başlat
  scheduleTick();
  console.log('[STRAT] 🚀 Trading engine başlatıldı (10–15sn tick)');
}

function stopEngine() {
  _isRunning = false;
  if (_tickTimeout) {
    clearTimeout(_tickTimeout);
    _tickTimeout = null;
  }
  newsMod.stopNewsPolling();
  console.log('[STRAT] ⏹️ Trading engine durduruldu');
}

function isEngineRunning() {
  return _isRunning;
}

// Manuel tick (test/debug için)
async function manualTick() {
  return await tick();
}

module.exports = {
  startEngine,
  stopEngine,
  isEngineRunning,
  manualTick,
  setAlertCallback,
  fetchLivePrice,
};

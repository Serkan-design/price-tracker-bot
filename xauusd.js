const axios = require("axios");

const HISTORY_MAX = 2000;
const RSI_PERIOD = 14;
const SMA_PERIOD = 20;
const SUPPORT_RESISTANCE_WINDOW = 100;
const PRICE_TOLERANCE = 3;

let priceHistory = [];
let lastPrice = null;

let alertConfig = {
  support: [],
  resistance: [],
  spikeUp: 5,
  spikeDown: 5,
  dropThreshold: null,
  riseThreshold: null,
  referencePrice: null,
  lastAlertTime: {},
  globalStats: {
    totalAlerts: 0,
    lastAlertAt: null,
    lastSignalType: null
  }
};

// ──────────────────────────────────────────────────
// STRATEJI AYARLARI
// LOT BAZLI sistem: 1 lot = altın fiyatı / 10 birim
// Örn: Altın $3300 ise 1 lot = $330 maliyet
// Kaldıraç simülasyonu: gerçek maliyet / 10 ile aç
// ──────────────────────────────────────────────────
const MIN_PROFIT_TL = 300;        // Minimum 300 TL kâr olmadan satma
const TL_RATE = 32.5;             // 1 USD = 32.5 TL (yaklaşık)
const LOT_SIZE = 0.1;             // 0.1 lot işlem büyüklüğü
const TARGET_PROFIT_USD = 9.23;   // 300 TL / 32.5 = ~$9.23 hedef
const STOP_LOSS_USD = 15.0;       // $15 stop loss (~487 TL)
const REBUY_COOLDOWN_MS = 60_000; // Satış sonrası 60 saniye bekleme süresi

let tradingState = {
  virtualBalance: 0,        // Başlangıçta sıfır, 'Hesabı Sıfırla' ile 5000 olur.
  currentPosition: null, 
  totalProfit: 0, 
  dailyProfit: 0, 
  tradeHistory: [],
  isEnabled: true,
  lastResetDate: new Date().toDateString(),
  lastEntryPrice: null,     // Son giriş fiyatı (tekrar alım bandı için)
  lastCloseTime: 0,         // Son satış zamanı (cooldown için)
  waitingForRebuy: false,   // Satış sonrası alım bekliyor mu?
};

let _alertCallback = null;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

function setAlertCallback(fn) {
  _alertCallback = fn;
}

function fireAlert(type, data) {
  const now = Date.now();

  // İşlem eventleri (alım/satım) cooldown'dan MUAf — her seferinde bildirim gider
  const isTradeEvent = type === 'TRADE_OPENED' || type === 'TRADE_CLOSED';

  if (!isTradeEvent) {
    const last = alertConfig.lastAlertTime[type] || 0;
    if (now - last < ALERT_COOLDOWN_MS) return;
    alertConfig.lastAlertTime[type] = now;
  }

  // Update global stats
  alertConfig.globalStats.totalAlerts++;
  alertConfig.globalStats.lastAlertAt = new Date().toISOString();
  alertConfig.globalStats.lastSignalType = type;

  if (_alertCallback) {
    try { _alertCallback(type, data); } catch (e) {}
  }
}

async function fetchFromGoldApiCom() {
  const res = await axios.get("https://api.gold-api.com/price/XAU", {
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36" },
  });
  const price = parseFloat(res.data?.price);
  if (!isNaN(price) && price > 100) return price;
  throw new Error("gold-api.com: geçersiz veri");
}

async function fetchFromYahooFinance() {
  const res = await axios.get(
    "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d",
    {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36" },
    }
  );
  const price = parseFloat(res.data?.chart?.result?.[0]?.meta?.regularMarketPrice);
  if (!isNaN(price) && price > 100) return price;
  throw new Error("Yahoo Finance: geçersiz veri");
}

async function fetchLivePrice() {
  for (const fn of [fetchFromGoldApiCom, fetchFromYahooFinance]) {
    try { return await fn(); } catch (_) {}
  }
  return null;
}

function calculateRSI(prices, period = RSI_PERIOD) {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = recent[i] - recent[i - 1];
    if (d >= 0) gains += d; else losses += Math.abs(d);
  }
  const ag = gains / period;
  const al = losses / period;
  if (al === 0) return 100;
  return Math.round(100 - 100 / (1 + ag / al));
}

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const s = prices.slice(-period);
  return s.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateMomentum(prices, period = 10) {
  if (prices.length < period + 1) return null;
  return prices[prices.length - 1] - prices[prices.length - 1 - period];
}

function detectTrend(prices) {
  if (prices.length < 20) return "NEUTRAL";
  const ema5 = calculateEMA(prices, 5);
  const ema20 = calculateEMA(prices, 20);
  const sma = calculateSMA(prices, SMA_PERIOD);
  const current = prices[prices.length - 1];
  if (ema5 && ema20 && sma) {
    if (ema5 > ema20 && current > sma) return "UP";
    if (ema5 < ema20 && current < sma) return "DOWN";
  }
  return "NEUTRAL";
}

function detectPattern(prices) {
  if (prices.length < 20) return null;
  const w = prices.slice(-20);
  const pivots = [];
  for (let i = 2; i < w.length - 2; i++) {
    const isLow = w[i] < w[i-1] && w[i] < w[i-2] && w[i] < w[i+1] && w[i] < w[i+2];
    const isHigh = w[i] > w[i-1] && w[i] > w[i-2] && w[i] > w[i+1] && w[i] > w[i+2];
    if (isLow) pivots.push({ type: "low", price: w[i], idx: i });
    if (isHigh) pivots.push({ type: "high", price: w[i], idx: i });
  }
  const lows = pivots.filter(p => p.type === "low");
  const highs = pivots.filter(p => p.type === "high");
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (Math.abs(a.price - b.price) / a.price < 0.002) return "DOUBLE_BOTTOM";
  }
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (Math.abs(a.price - b.price) / a.price < 0.002) return "DOUBLE_TOP";
  }
  return null;
}

function computeSignal(prices) {
  if (prices.length < 20) return { signal: "NEUTRAL", confidence: 0 };

  const rsi = calculateRSI(prices);
  const trend = detectTrend(prices);
  const momentum = calculateMomentum(prices);
  const pattern = detectPattern(prices);

  let score = 0;
  let maxScore = 0;

  if (rsi !== null) {
    maxScore += 40;
    if (rsi <= 30) score += 40;
    else if (rsi >= 70) score -= 40;
    else if (rsi < 45) score += 15;
    else if (rsi > 55) score -= 15;
  }

  maxScore += 30;
  if (trend === "UP") score += 30;
  else if (trend === "DOWN") score -= 30;

  if (momentum !== null) {
    maxScore += 20;
    if (momentum > 0) score += Math.min(20, momentum / 2);
    else score += Math.max(-20, momentum / 2);
  }

  if (pattern === "DOUBLE_BOTTOM") score += 15;
  if (pattern === "DOUBLE_TOP") score -= 15;

  const last3 = prices.slice(-3);
  const allUp = last3.every((p, i) => i === 0 || p > last3[i - 1]);
  const allDown = last3.every((p, i) => i === 0 || p < last3[i - 1]);

  let signal = "NEUTRAL";
  let rawConfidence = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  if ((score > 0 && allUp) || (rsi !== null && rsi <= 30)) { 
    signal = "BUY"; 
    if (rsi <= 30) rawConfidence = Math.max(rawConfidence, 85); // High confidence for extreme oversold
  }
  else if (score < 0 && allDown) { signal = "SELL"; }
  else if (Math.abs(score) > maxScore * 0.3) {
    signal = score > 0 ? "BUY" : "SELL";
    rawConfidence = Math.round(rawConfidence * 0.7);
  }

  const confidence = Math.min(100, Math.max(0, Math.abs(rawConfidence)));

  return { signal, confidence };
}

function generateInsights(prices, analysis) {
  if (prices.length < 20) return { main: "Veri toplanıyor...", detail: `Analiz için ${20 - prices.length} bar daha gerekli.` };
  
  const { rsi, trend, signal, confidence, pattern } = analysis;
  let main = "Piyasa durgun seyrediyor.";
  let detail = "RSI nötr bölgede, belirgin bir trend oluşumu yok.";

  if (pattern === "DOUBLE_BOTTOM") {
    main = "Güçlü bir dip oluşumu var.";
    detail = "Çift dip (Double Bottom) formasyonu tamamlanmak üzere, yükseliş beklenebilir.";
  } else if (pattern === "DOUBLE_TOP") {
    main = "Zirvede direnç görüldü.";
    detail = "Çift tepe (Double Top) formasyonu aşağı yönlü baskıyı artırabilir.";
  } else if (signal === "BUY" && confidence > 70) {
    main = "Fiyat yukarı yönlü ivme kazanıyor.";
    detail = `RSI (${rsi}) ve trend uyumlu. Alıcılar piyasaya hakim durumda.`;
  } else if (signal === "SELL" && confidence > 70) {
    main = "Satış baskısı artıyor.";
    detail = `Fiyat SMA seviyelerinin altında, trend aşağı yönlü güçleniyor.`;
  } else if (rsi >= 70) {
    main = "Aşırı alım bölgesindeyiz.";
    detail = "Fiyat düzeltme yapabilir, RSI 70 üzerine çıktı.";
  } else if (rsi <= 30) {
    main = "Aşırı satım bölgesindeyiz.";
    detail = "Fiyat çok düştü, 'Dip Avcısı' moduyla tepki yükselişi bekleniyor (RSI 30 altı).";
  } else if (trend === "UP") {
    main = "Trend pozitif görünüyor.";
    detail = "EMA kesişimi yukarı yönü destekliyor, momentum stabil.";
  } else if (trend === "DOWN") {
    main = "Baskı devam ediyor.";
    detail = "EMA kesişimi aşağı yönü gösteriyor, kısa vadede düşüş sürebilir.";
  }

  return { main, detail };
}

function findSupportResistance(prices) {
  const w = prices.slice(-SUPPORT_RESISTANCE_WINDOW);
  if (w.length < 5) return { support: [], resistance: [] };
  const supports = [], resistances = [];
  for (let i = 2; i < w.length - 2; i++) {
    const c = w[i];
    if (w[i-2] > c && w[i-1] > c && w[i+1] > c && w[i+2] > c) supports.push(Math.round(c * 100) / 100);
    if (w[i-2] < c && w[i-1] < c && w[i+1] < c && w[i+2] < c) resistances.push(Math.round(c * 100) / 100);
  }
  const cluster = (lvls) => {
    const merged = [];
    for (const lvl of [...new Set(lvls)].sort((a, b) => a - b)) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(lvl - last) <= PRICE_TOLERANCE * 2) {
        merged[merged.length - 1] = Math.round(((lvl + last) / 2) * 100) / 100;
      } else merged.push(lvl);
    }
    return merged.slice(-5);
  };
  return { support: cluster(supports), resistance: cluster(resistances) };
}

function analyzeMarket(prices) {
  if (prices.length === 0) return null;
  const current = prices[prices.length - 1];
  const prev = prices.length > 1 ? prices[prices.length - 2] : current;
  const change = current - prev;
  const changePct = prev !== 0 ? (change / prev) * 100 : 0;
  const rsi = calculateRSI(prices);
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const trend = detectTrend(prices);
  const pattern = detectPattern(prices);
  const { signal, confidence } = computeSignal(prices);
  const { support, resistance } = findSupportResistance(prices);

  let rsiSignal = "NEUTRAL";
  if (rsi !== null) {
    if (rsi <= 30) rsiSignal = "OVERSOLD";
    else if (rsi >= 70) rsiSignal = "OVERBOUGHT";
  }

  const basicAnalysis = { price: current, change, changePct, rsi, rsiSignal, trend, signal, confidence };
  const insights = generateInsights(prices, basicAnalysis);
  
  let confidenceText = "Düşük Güven";
  if (confidence > 80) confidenceText = "Yüksek Güven";
  else if (confidence > 50) confidenceText = "Orta Güven";

  return {
    price: current,
    change: Math.round(change * 100) / 100,
    changePct: parseFloat(changePct.toFixed(3)),
    rsi,
    rsiSignal,
    trend,
    signal,
    confidence,
    confidenceText,
    insights,
    pattern,
    sma20: sma20 ? Math.round(sma20 * 100) / 100 : null,
    sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
    support,
    resistance,
    historyCount: prices.length,
    historyPercent: Math.min(100, Math.round((prices.length / HISTORY_MAX) * 100)),
    timestamp: new Date().toISOString(),
    globalStats: alertConfig.globalStats
  };
}

function checkAlerts(analysis) {
  if (!analysis) return;
  const { price, change, rsi, rsiSignal, signal, confidence, pattern } = analysis;

  if (signal !== "NEUTRAL" && confidence >= 60) {
    fireAlert(`SIGNAL_${signal}`, {
      price, change, rsi, signal, confidence, pattern,
      message: `${signal === "BUY" ? "📈 ALIŞ" : "📉 SATIŞ"} sinyali! Güven: %${confidence} | RSI: ${rsi ?? "--"}`,
    });
  }

  if (alertConfig.referencePrice !== null) {
    const diff = price - alertConfig.referencePrice;
    if (alertConfig.riseThreshold && diff >= alertConfig.riseThreshold) {
      fireAlert("THRESHOLD_RISE", {
        price, diff, signal, confidence,
        message: `🚀 Fiyat referanstan +$${diff.toFixed(2)} yükseldi ($${alertConfig.referencePrice} → $${price.toFixed(2)})`,
      });
      alertConfig.referencePrice = price;
    }
    if (alertConfig.dropThreshold && diff <= -alertConfig.dropThreshold) {
      fireAlert("THRESHOLD_DROP", {
        price, diff, signal, confidence,
        message: `🔻 Fiyat referanstan -$${Math.abs(diff).toFixed(2)} düştü ($${alertConfig.referencePrice} → $${price.toFixed(2)})`,
      });
      alertConfig.referencePrice = price;
    }
  }

  for (const lvl of alertConfig.support) {
    if (Math.abs(price - lvl) <= PRICE_TOLERANCE) {
      fireAlert(`SUPPORT_${lvl}`, { price, level: lvl, signal, confidence, message: `🟢 $${lvl} desteğine yaklaştı (şu an: $${price.toFixed(2)})` });
    }
  }
  for (const lvl of alertConfig.resistance) {
    if (Math.abs(price - lvl) <= PRICE_TOLERANCE) {
      fireAlert(`RESISTANCE_${lvl}`, { price, level: lvl, signal, confidence, message: `🔴 $${lvl} direncine yaklaştı (şu an: $${price.toFixed(2)})` });
    }
  }
}

function runBacktest(n = 500) {
  const slice = priceHistory.slice(-n);
  if (slice.length < 30) return { error: "Yeterli veri yok (min 30 bar)" };

  const trades = [];
  let openTrade = null;

  for (let i = 20; i < slice.length; i++) {
    const window = slice.slice(0, i + 1).map(h => h.price);
    const { signal, confidence } = computeSignal(window);
    const current = window[window.length - 1];

    if (!openTrade && signal !== "NEUTRAL" && confidence >= 60) {
      openTrade = {
        entryIdx: i,
        entryPrice: current,
        signal,
        confidence,
        entryTime: slice[i].timestamp,
      };
      continue;
    }

    if (openTrade) {
      const bars = i - openTrade.entryIdx;
      const closeSignal = computeSignal(window).signal;
      const shouldClose =
        (openTrade.signal === "BUY" && (closeSignal === "SELL" || bars >= 10)) ||
        (openTrade.signal === "SELL" && (closeSignal === "BUY" || bars >= 10));

      if (shouldClose) {
        const pnl = openTrade.signal === "BUY"
          ? current - openTrade.entryPrice
          : openTrade.entryPrice - current;

        trades.push({
          signal: openTrade.signal,
          confidence: openTrade.confidence,
          entryPrice: Math.round(openTrade.entryPrice * 100) / 100,
          exitPrice: Math.round(current * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          bars,
          entryTime: openTrade.entryTime,
          exitTime: slice[i].timestamp,
          win: pnl > 0,
        });
        openTrade = null;
      }
    }
  }

  if (trades.length === 0) return { error: "Bu pencerede sinyal üretilmedi", barsAnalyzed: slice.length };

  const wins = trades.filter(t => t.win).length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgPnl = totalPnl / trades.length;
  let peak = 0, equity = 0, maxDrawdown = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    barsAnalyzed: slice.length,
    totalTrades: trades.length,
    winRate: Math.round((wins / trades.length) * 100),
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgPnl: Math.round(avgPnl * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    trades: trades.slice(-50),
  };
}

let _interval = null;

function executeStrategy(analysis) {
  if (!analysis || !tradingState.isEnabled) return;
  if (tradingState.virtualBalance <= 0) return; // Bakiye yoksa işlem yapma

  // Günlük kâr sıfırlama kontrolü
  const today = new Date().toDateString();
  if (tradingState.lastResetDate !== today) {
    tradingState.dailyProfit = 0;
    tradingState.lastResetDate = today;
  }

  const { price, signal, confidence, rsi, trend } = analysis;

  // ── 1. AÇIK POZİSYON VARSA ÇIKIŞ KOŞULLARINI KONTROL ET ──
  if (tradingState.currentPosition) {
    const pos = tradingState.currentPosition;
    // LOT BAZLI kâr/zarar: fiyat farkı x lot büyüklüğü x kaldıraç (100 birim)
    const priceDiff = price - pos.entryPrice;   // $/oz fark
    const pnl = priceDiff * pos.lotSize * 100;  // Gerçek USD kâr/zarar
    const pnlTl = pnl * TL_RATE;

    // Minimum 300 TL kar olmadan satma (stop loss hariç)
    const isProfitEnough = pnlTl >= MIN_PROFIT_TL;
    // Stop loss: $15 kayıp (~487 TL)
    const isStopLoss = pnl <= -STOP_LOSS_USD;

    const shouldSell =
      isStopLoss ||                                              // Stop loss zorunlu çıkış
      (pnl >= TARGET_PROFIT_USD && isProfitEnough) ||           // Hedef kâra ulaşıldı
      (pos.type === 'BUY' && signal === 'SELL' && confidence >= 65 && isProfitEnough) || // Ters sinyal + min kâr
      (pos.type === 'BUY' && rsi >= 78 && isProfitEnough);    // Aşırı alım + min kâr

    if (shouldSell) {
      tradingState.totalProfit += pnl;
      tradingState.dailyProfit += pnl;
      tradingState.virtualBalance += pos.cost + pnl; // Maliyet + kâr/zarar geri döner
      tradingState.lastCloseTime = Date.now();
      tradingState.waitingForRebuy = true; // Satış sonrası tekrar alım bekle

      const trade = {
        ...pos,
        exitPrice: price,
        exitTime: new Date().toISOString(),
        pnl: parseFloat(pnl.toFixed(2)),
        pnlTl: Math.round(pnlTl),
        result: pnl > 0 ? 'WIN' : 'LOSS'
      };

      tradingState.tradeHistory.push(trade);
      if (tradingState.tradeHistory.length > 50) tradingState.tradeHistory.shift();
      tradingState.currentPosition = null;

      const emoji = pnl > 0 ? '✅' : '🔴';
      fireAlert('TRADE_CLOSED', {
        message: `🤖 <b>İşlem Kapandı! ${emoji}</b>\n\nPNL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}$ (${pnlTl >= 0 ? '+' : ''}${Math.round(pnlTl)} TL)\nBakiye: $${tradingState.virtualBalance.toFixed(2)}\nFiyat: $${price.toFixed(2)}`,
        pnl, price
      });

      console.log(`[TRADING] Pozisyon kapatıldı. PNL: $${pnl.toFixed(2)} (${Math.round(pnlTl)} TL) | Bakiye: $${tradingState.virtualBalance.toFixed(2)}`);
    }
    return; // Açık pozisyon varken alım yapma
  }

  // ── 2. POZİSYON YOKSA ALIŞ KOŞULLARINI KONTROL ET ──
  const now = Date.now();
  const cooldownOk = (now - tradingState.lastCloseTime) >= REBUY_COOLDOWN_MS;

  if (!cooldownOk) return; // Cooldown devam ediyor
  tradingState.waitingForRebuy = false;

  const shouldBuy =
    signal === 'BUY' &&
    confidence >= 65 &&        // Eşiği biraz düşürdük ki daha aktif işlem yapsın
    (trend === 'UP' || rsi <= 35) && // UP trend VEYA aşırı satım
    rsi < 55;                  // RSI orta bölgenin altında

  if (shouldBuy) {
    // LOT maliyeti: fiyatın sadece %1'i (kaldıraç simülasyonu)
    const lotCost = price * LOT_SIZE; // ~$330 (altın $3300'da 0.1 lot)
    if (tradingState.virtualBalance >= lotCost) {
      console.log(`[TRADING] Alım sinyali! Fiyat=$${price} | Sinyal=${signal} | Güven=${confidence}% | RSI=${rsi} | Trend=${trend}`);
      openPosition('BUY', price);
    } else {
      console.warn(`[TRADING] Yetersiz bakiye: $${tradingState.virtualBalance.toFixed(2)} < $${lotCost.toFixed(2)} (lot maliyeti)`);
    }
  }
}

function openPosition(type, price) {
  try {
    if (tradingState.currentPosition) return { success: false, message: "Zaten açık bir pozisyonunuz var." };

    // LOT BAZLI maliyet: 0.1 lot, kaldıraçlı sistem
    const lotCost = price * LOT_SIZE; // fiyat x lot büyüklüğü (~$330)
    if (tradingState.virtualBalance < lotCost) {
      return { success: false, message: `Yetersiz bakiye! Gerekli: $${lotCost.toFixed(2)}, Mevcut: $${tradingState.virtualBalance.toFixed(2)}` };
    }

    tradingState.virtualBalance -= lotCost; // Sadece lot maliyetini düş
    tradingState.lastEntryPrice = price;

    tradingState.currentPosition = {
      entryPrice: price,
      type: type,
      lotSize: LOT_SIZE,
      cost: lotCost,           // Geri ödeme için maliyeti sakla
      time: new Date().toISOString(),
    };

    const expectedProfitTl = TARGET_PROFIT_USD * TL_RATE;
    fireAlert('TRADE_OPENED', {
      message: `🤖 <b>İşlem Açıldı (${type})!</b>\n\nGiriş: $${price.toFixed(2)}\nLot: ${LOT_SIZE} | Maliyet: $${lotCost.toFixed(2)}\nHedef Kâr: ~${Math.round(expectedProfitTl)} TL\nBakiye: $${tradingState.virtualBalance.toFixed(2)}`,
      price
    });

    console.log(`[TRADING] Pozisyon açıldı: ${type} @ $${price.toFixed(2)} | Lot: ${LOT_SIZE} | Maliyet: $${lotCost.toFixed(2)} | Bakiye: $${tradingState.virtualBalance.toFixed(2)}`);
    return { success: true, message: "İşlem başarıyla açıldı!" };
  } catch (err) {
    console.error("[TRADING ERROR] Failed to open position:", err.message);
    return { success: false, message: "Sistem hatası oluştu." };
  }
}

function closePositionManual(price) {
  if (!tradingState.currentPosition) return { success: false, message: "Açık pozisyon bulunamadı." };

  const pos = tradingState.currentPosition;
  const priceDiff = price - pos.entryPrice;
  const pnl = priceDiff * (pos.lotSize || LOT_SIZE) * 100; // LOT BAZLI kâr/zarar
  const pnlTl = Math.round(pnl * TL_RATE);

  tradingState.totalProfit += pnl;
  tradingState.dailyProfit += pnl;
  tradingState.virtualBalance += pos.cost + pnl; // Maliyet + kâr/zarar geri döner
  tradingState.lastCloseTime = Date.now();

  const trade = {
    ...pos,
    exitPrice: price,
    exitTime: new Date().toISOString(),
    pnl: parseFloat(pnl.toFixed(2)),
    pnlTl,
    result: pnl > 0 ? 'WIN' : 'LOSS',
    manual: true
  };

  tradingState.tradeHistory.push(trade);
  if (tradingState.tradeHistory.length > 50) tradingState.tradeHistory.shift();
  tradingState.currentPosition = null;

  fireAlert('TRADE_CLOSED', {
    message: `🤖 <b>İşlem El ile Kapatıldı!</b>\n\nPNL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}$ (${pnlTl >= 0 ? '+' : ''}${pnlTl} TL)\nBakiye: $${tradingState.virtualBalance.toFixed(2)}\nFiyat: $${price.toFixed(2)}`,
    pnl, price
  });

  console.log(`[TRADING] Manuel kapatma. PNL: $${pnl.toFixed(2)} (${pnlTl} TL) | Bakiye: $${tradingState.virtualBalance.toFixed(2)}`);
  return { success: true, message: "Pozisyon el ile kapatıldı." };
}

async function tick() {
  const price = await fetchLivePrice();
  if (price === null) return null;

  priceHistory.push({ price, timestamp: new Date().toISOString() });
  if (priceHistory.length > HISTORY_MAX) priceHistory = priceHistory.slice(-HISTORY_MAX);
  lastPrice = price;

  const prices = priceHistory.map(h => h.price);
  const analysis = analyzeMarket(prices);
  
  if (analysis) {
    checkAlerts(analysis);
    executeStrategy(analysis);
  }
  
  return analysis;
}

function startPolling(intervalMs = 60_000) {
  if (_interval) return;
  tick();
  _interval = setInterval(tick, intervalMs);
}

function stopPolling() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function getAnalysis() {
  const prices = priceHistory.map(h => h.price);
  return analyzeMarket(prices);
}

function getHistory(n = 200) {
  return priceHistory.slice(-n);
}

function setAlertLevels({ support = [], resistance = [], spikeThreshold, dropThreshold, riseThreshold } = {}) {
  alertConfig.support = support;
  alertConfig.resistance = resistance;
  if (spikeThreshold) { alertConfig.spikeUp = spikeThreshold; alertConfig.spikeDown = spikeThreshold; }
  if (dropThreshold !== undefined) alertConfig.dropThreshold = dropThreshold;
  if (riseThreshold !== undefined) alertConfig.riseThreshold = riseThreshold;
  if ((dropThreshold || riseThreshold) && lastPrice) {
    alertConfig.referencePrice = lastPrice;
    alertConfig.lastAlertTime = {};
    console.log(`📌 Alert referans fiyatı: $${lastPrice}`);
  }
}

function getTradingStats() {
  // Eğer açık pozisyon varsa gerçek zamanlı PNL hesapla
  let unrealizedPnl = 0;
  let unrealizedPnlTl = 0;
  if (tradingState.currentPosition) {
    // Son fiyatı xauusd modülünden al (priceHistory'den)
    const lastP = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : null;
    if (lastP) {
      const diff = lastP - tradingState.currentPosition.entryPrice;
      unrealizedPnl = diff * (tradingState.currentPosition.lotSize || LOT_SIZE) * 100;
      unrealizedPnlTl = Math.round(unrealizedPnl * TL_RATE);
    }
  }

  return {
    ...tradingState,
    totalProfitTl: Math.round(tradingState.totalProfit * TL_RATE),
    dailyProfitTl: Math.round(tradingState.dailyProfit * TL_RATE),
    unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
    unrealizedPnlTl,
    minProfitTl: MIN_PROFIT_TL,
    lotSize: LOT_SIZE,
    tlRate: TL_RATE,
    cooldownRemaining: Math.max(0, Math.ceil((REBUY_COOLDOWN_MS - (Date.now() - tradingState.lastCloseTime)) / 1000)),
  };
}

function resetTradingStats() {
  tradingState.virtualBalance = 5000;
  tradingState.currentPosition = null;
  tradingState.totalProfit = 0;
  tradingState.dailyProfit = 0;
  tradingState.tradeHistory = [];
  tradingState.lastResetDate = new Date().toDateString();
  tradingState.lastEntryPrice = null;
  tradingState.lastCloseTime = 0;
  tradingState.waitingForRebuy = false;
  console.log('[TRADING] Demo hesap sıfırlandı. Bakiye: $5000');
}

async function fetchAndAnalyze() {
  return await tick();
}

module.exports = {
  startPolling, stopPolling,
  getAnalysis, getHistory, runBacktest,
  setAlertLevels, setAlertCallback, fetchAndAnalyze,
  getTradingStats, resetTradingStats, openPosition, closePositionManual
};

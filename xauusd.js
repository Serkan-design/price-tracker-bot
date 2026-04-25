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
// STRATEJI AYARLARI (Spot No-Loss Modu)
// ──────────────────────────────────────────────────
const MIN_PROFIT_TL = 150;        // Minimum 150 TL kâr olmadan satma (Kullanıcı talebi)
const TL_RATE = 45.0;             // 1 USD = 45 TL (Kullanıcı talebi ile güncellendi)
const TRADE_AMOUNT_OZ = 0.01;     // 1 işlemde alınan miktar (Yüksek kurlarda 5000 TL bakiye yetmesi için düşürüldü)
// Not: 0.01 oz * $4700 * 45 ≈ 2115 TL (5000 TL bakiye ile uyumlu)

let tradingState = {
  virtualBalance: 0,        // Başlangıç bakiyesi 0 TL (Yükleme yapılması gerekir)
  currentPosition: null,    // { entryPrice, amount, cost }
  totalProfit: 0, 
  dailyProfit: 0, 
  tradeHistory: [],
  isEnabled: true,
  lastResetDate: new Date().toDateString(),
  lastCloseTime: 0,
  lastEntryPrice: null,     // Son giriş fiyatı (tekrar alım bandı için)
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
  if (prices.length < 5) return "NEUTRAL";
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
  if (prices.length < 5) return null;
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
  if (prices.length < 5) return { signal: "NEUTRAL", confidence: 0 };

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
    if (rsi <= 30) rawConfidence = Math.max(rawConfidence, 85);
  }
  else if (score < 0 && allDown) { signal = "SELL"; }
  else if (Math.abs(score) > maxScore * 0.3) {
    signal = score > 0 ? "BUY" : "SELL";
    rawConfidence = Math.round(rawConfidence * 0.7);
  }

  const confidence = Math.min(100, Math.max(0, Math.abs(rawConfidence)));

  const sorted = [...prices].sort((a,b) => a-b);
  const support = [
    sorted[Math.floor(prices.length * 0.1)],
    sorted[Math.floor(prices.length * 0.2)]
  ].filter(v => v !== undefined);
  
  const resistance = [
    sorted[Math.floor(prices.length * 0.9)],
    sorted[Math.floor(prices.length * 0.8)]
  ].filter(v => v !== undefined);

  const ema = prices.slice(-8).reduce((s,p) => s+p, 0) / 8;

  return { 
    signal, 
    confidence, 
    rsi: Math.round(rsi), 
    trend, 
    support: support.map(v => parseFloat(v.toFixed(2))), 
    resistance: resistance.map(v => parseFloat(v.toFixed(2))),
    ema: parseFloat(ema.toFixed(2))
  };
}

function generateInsights(prices, analysis) {
  if (prices.length < 5) return { main: "Veri toplanıyor...", detail: `Analiz için ${5 - prices.length} bar daha gerekli.` };
  
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

  // Günlük kâr sıfırlama kontrolü
  const today = new Date().toDateString();
  if (tradingState.lastResetDate !== today) {
    tradingState.dailyProfit = 0;
    tradingState.lastResetDate = today;
  }
  
  const { price, signal, confidence, rsi } = analysis;
  const currentPriceTL = price * TL_RATE * TRADE_AMOUNT_OZ;

  // ── 1. AÇIK POZİSYON VARSA ÇIKIŞ KOŞULLARINI KONTROL ET ──
  if (tradingState.currentPosition) {
    const pos = tradingState.currentPosition;
    const entryPriceTL = pos.entryPrice * TL_RATE * TRADE_AMOUNT_OZ;
    const currentProfitTL = currentPriceTL - entryPriceTL;

    // KRİTİK KURAL 4 & 5 & 6: Zararına satış yapılmaz VE minimum kâr hedefi (150 TL)
    const isProfitable = currentPriceTL >= entryPriceTL;
    const isProfitEnough = currentProfitTL >= MIN_PROFIT_TL;

    // Sadece her iki şart da sağlanıyorsa satış yapılır
    if (isProfitable && isProfitEnough) {
      // Satış gerçekleşir
      tradingState.totalProfit += currentProfitTL;
      tradingState.dailyProfit += currentProfitTL;
      
      // Satılan miktar bakiyeye geri eklenir (Alım fiyatı + Kâr = Satış Fiyatı)
      tradingState.virtualBalance += currentPriceTL;
      tradingState.lastCloseTime = Date.now();

      const trade = {
        ...pos,
        exitPrice: price,
        exitPriceTL: Math.round(currentPriceTL),
        exitTime: new Date().toISOString(),
        pnl: parseFloat((currentProfitTL / TL_RATE).toFixed(2)), // USD karşılığı
        pnlTl: Math.round(currentProfitTL),
        result: 'WIN'
      };

      tradingState.tradeHistory.push(trade);
      if (tradingState.tradeHistory.length > 50) tradingState.tradeHistory.shift();
      tradingState.currentPosition = null;

      fireAlert('TRADE_CLOSED', {
        message: `🤖 <b>İşlem Kapandı! ✅</b>\n\nKâr: +${Math.round(currentProfitTL)} TL\nYeni Bakiye: ${Math.round(tradingState.virtualBalance)} TL\nFiyat: $${price.toFixed(2)}`,
        pnl: currentProfitTL, price
      });

      console.log(`[TRADING] Pozisyon kapatıldı. Kâr: ${Math.round(currentProfitTL)} TL | Bakiye: ${Math.round(tradingState.virtualBalance)} TL`);
    } else {
      // HOLD durumu - loglamayı azaltmak için sadece önemli değişimlerde yazılabilir
      if (Math.random() > 0.95) console.log(`[TRADING] Pozisyon Beklemede (HOLD). Kâr: ${Math.round(currentProfitTL)} TL (Hedef: ${MIN_PROFIT_TL} TL)`);
    }
    return;
  }

  // ── 2. POZİSYON YOKSA ALIŞ KOŞULLARINI KONTROL ET ──
  // Alım için bakiyenin yetmesi lazım
  const costTL = currentPriceTL;
  
  if (tradingState.virtualBalance < costTL) return; // Bakiye yetersiz

  const shouldBuy =
    signal === 'BUY' &&
    confidence >= 55 &&
    rsi < 60;

  if (shouldBuy) {
    console.log(`[TRADING] Alım sinyali! Fiyat=$${price} | Güven=${confidence}% | Maliyet=${Math.round(costTL)} TL`);
    openPosition('BUY', price);
  }
}

function openPosition(type, price) {
  try {
    if (tradingState.currentPosition) return { success: false, message: "Zaten açık bir pozisyonunuz var." };

    if (!price || isNaN(price)) return { success: false, message: "Fiyat bilgisi alınamadı, işlem yapılamıyor." };
    
    const costTL = price * TL_RATE * TRADE_AMOUNT_OZ;
    if (tradingState.virtualBalance < costTL) {
      return { success: false, message: `Yetersiz bakiye! Gerekli: ${Math.round(costTL)} TL, Mevcut: ${Math.round(tradingState.virtualBalance)} TL` };
    }

    tradingState.virtualBalance -= costTL; // Alım tutarı ana bakiyeden düşülür

    tradingState.currentPosition = {
      entryPrice: price,
      entryPriceTL: Math.round(costTL),
      type: type,
      amount: TRADE_AMOUNT_OZ,
      cost: costTL,
      time: new Date().toISOString(),
    };

    fireAlert('TRADE_OPENED', {
      message: `🤖 <b>İşlem Açıldı!</b>\n\nMaliyet: ${Math.round(costTL)} TL\nKalan Bakiye: ${Math.round(tradingState.virtualBalance)} TL\nGiriş Fiyatı: $${price.toFixed(2)}`,
      price
    });

    console.log(`[TRADING] Pozisyon açıldı. Maliyet: ${Math.round(costTL)} TL | Kalan Bakiye: ${Math.round(tradingState.virtualBalance)} TL`);
    return { success: true, message: "İşlem başarıyla açıldı!" };
  } catch (err) {
    console.error("[TRADING ERROR] Failed to open position:", err.message);
    return { success: false, message: "Sistem hatası oluştu." };
  }
}

function closePositionManual(price) {
  if (!tradingState.currentPosition) return { success: false, message: "Açık pozisyon bulunamadı." };

  const pos = tradingState.currentPosition;
  const currentPriceTL = price * TL_RATE * TRADE_AMOUNT_OZ;
  const profitTL = currentPriceTL - pos.cost;

  tradingState.totalProfit += profitTL;
  tradingState.dailyProfit += profitTL;
  tradingState.virtualBalance += currentPriceTL; // Satış tutarı ana bakiyeye eklenir
  tradingState.lastCloseTime = Date.now();

  const trade = {
    ...pos,
    exitPrice: price,
    exitPriceTL: Math.round(currentPriceTL),
    exitTime: new Date().toISOString(),
    pnl: parseFloat((profitTL / TL_RATE).toFixed(2)),
    pnlTl: Math.round(profitTL),
    result: profitTL >= 0 ? 'WIN' : 'LOSS',
    manual: true
  };

  tradingState.tradeHistory.push(trade);
  if (tradingState.tradeHistory.length > 50) tradingState.tradeHistory.shift();
  tradingState.currentPosition = null;

  fireAlert('TRADE_CLOSED', {
    message: `🤖 <b>İşlem El ile Kapatıldı!</b>\n\nKâr: ${Math.round(profitTL)} TL\nYeni Bakiye: ${Math.round(tradingState.virtualBalance)} TL`,
    pnl: profitTL, price
  });

  return { success: true, message: "Pozisyon el ile kapatıldı." };
}

async function tick() {
  const price = await fetchLivePrice();
  if (price === null) {
    console.warn("[XAUUSD] Fiyat alınamadı.");
    return null;
  }
  console.log(`[XAUUSD] Canlı Fiyat: $${price}`);

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
  let unrealizedPnlTl = 0;
  if (tradingState.currentPosition) {
    const lastP = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : null;
    if (lastP) {
      const currentValTL = lastP * TL_RATE * TRADE_AMOUNT_OZ;
      unrealizedPnlTl = Math.round(currentValTL - tradingState.currentPosition.cost);
    }
  }

  return {
    ...tradingState,
    totalProfitTl: Math.round(tradingState.totalProfit),
    dailyProfitTl: Math.round(tradingState.dailyProfit),
    unrealizedPnlTl,
    minProfitTl: MIN_PROFIT_TL,
    tradeAmountOz: TRADE_AMOUNT_OZ,
    tlRate: TL_RATE,
    cooldownRemaining: 0, // Spot modunda cooldown yok
  };
}

function resetTradingStats() {
  tradingState.virtualBalance = 5000;
  tradingState.currentPosition = null;
  tradingState.totalProfit = 0;
  tradingState.dailyProfit = 0;
  tradingState.tradeHistory = [];
  tradingState.lastResetDate = new Date().toDateString();
  tradingState.lastCloseTime = 0;
  console.log('[TRADING] Demo hesap sıfırlandı. Bakiye: 5000 TL');
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

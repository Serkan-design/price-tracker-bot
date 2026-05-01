/**
 * news.js
 * ────────
 * Keyword tabanlı haber analizi — AI KULLANILMAZ.
 *
 * Mantık:
 *   SELL keywords tespit edilirse → SELL (altın için negatif)
 *   BUY keywords tespit edilirse  → BUY  (altın için pozitif)
 *   Her ikisi de varsa            → CONFLICT (NEUTRAL gibi davranılır)
 *   Hiçbiri yoksa                 → NEUTRAL
 *
 * Gerçek haber kaynağı:
 *   - https://newsapi.org/v2/everything?q=gold+XAU (ücretsiz tier: 100 req/gün)
 *   - API key olmadan mock başlıklar kullanılır
 *
 * Canlıda kullanmak için NEWSAPI_KEY env değişkeni tanımlayın.
 */

'use strict';

const axios = require('axios');

// ─────────────────────────────────────────────────────────────
// Keyword Listeleri
// ─────────────────────────────────────────────────────────────

/** Altın için SATIŞ baskısı yaratan anahtar kelimeler */
const SELL_KEYWORDS = [
  'interest rate hike',
  'rate hike',
  'hawkish',
  'strong dollar',
  'dollar rally',
  'fed hike',
  'tightening',
  'inflation cooling',
  'risk on',
];

/** Altın için ALIŞ talebi yaratan anahtar kelimeler */
const BUY_KEYWORDS = [
  'rate cut',
  'dovish',
  'crisis',
  'war',
  'geopolitical',
  'inflation surge',
  'safe haven',
  'gold rally',
  'recession',
  'fed pivot',
  'quantitative easing',
  'dollar weakness',
];

// ─────────────────────────────────────────────────────────────
// Haber State
// ─────────────────────────────────────────────────────────────

let _newsState = {
  signal: 'NEUTRAL',         // 'BUY' | 'SELL' | 'NEUTRAL' | 'CONFLICT'
  matchedBuy: [],
  matchedSell: [],
  lastFetchAt: null,
  headlines: [],
  error: null,
};

// Haberler 30 dakikada bir çekilir (API limiti)
const NEWS_FETCH_INTERVAL_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Keyword Analizi
// ─────────────────────────────────────────────────────────────

/**
 * Başlıklar listesinden keyword analizi yapar.
 *
 * @param {string[]} headlines
 * @returns {{ signal: string, matchedBuy: string[], matchedSell: string[] }}
 */
function analyzeHeadlines(headlines) {
  const text = headlines.join(' ').toLowerCase();

  const matchedBuy  = BUY_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
  const matchedSell = SELL_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));

  let signal = 'NEUTRAL';

  if (matchedBuy.length > 0 && matchedSell.length > 0) {
    signal = 'CONFLICT'; // Karışık sinyal — işlem açılmaz
  } else if (matchedBuy.length > 0) {
    signal = 'BUY';
  } else if (matchedSell.length > 0) {
    signal = 'SELL';
  }

  return { signal, matchedBuy, matchedSell };
}

// ─────────────────────────────────────────────────────────────
// Haber Çekme (NewsAPI)
// ─────────────────────────────────────────────────────────────

/**
 * NewsAPI'dan XAU/Gold haberleri çeker.
 * API key yoksa mock başlıklar döner.
 *
 * @returns {Promise<string[]>} headlines dizisi
 */
async function fetchHeadlines() {
  const key = process.env.NEWSAPI_KEY;

  if (!key) {
    // API key yoksa statik mock başlıklar — gerçek ortamda bunlar gerçek haberlerdir
    console.log('[NEWS] NEWSAPI_KEY yok, mock başlıklar kullanılıyor.');
    return [
      'Gold prices remain stable amid global uncertainty',
      'Federal Reserve signals steady rates for now',
      'Investors seek safe haven assets amid market volatility',
    ];
  }

  try {
    const res = await axios.get('https://newsapi.org/v2/everything', {
      timeout: 10000,
      params: {
        q: 'gold XAU OR "interest rate" OR "federal reserve" OR "dollar"',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 20,
        apiKey: key,
      },
    });

    const articles = res.data?.articles || [];
    return articles.map(a => `${a.title || ''} ${a.description || ''}`);
  } catch (err) {
    console.warn('[NEWS] Haber çekme hatası:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Periyodik Güncelleme
// ─────────────────────────────────────────────────────────────

let _newsInterval = null;

/**
 * Haber motorunu başlatır — belirtilen aralıkta otomatik günceller.
 */
async function startNewsPolling() {
  const update = async () => {
    const headlines = await fetchHeadlines();
    const { signal, matchedBuy, matchedSell } = analyzeHeadlines(headlines);

    _newsState = {
      signal,
      matchedBuy,
      matchedSell,
      lastFetchAt: new Date().toISOString(),
      headlines: headlines.slice(0, 5), // İlk 5 başlığı sakla
      error: null,
    };

    console.log(`[NEWS] Sinyal: ${signal} | BUY kw: [${matchedBuy.join(', ')}] | SELL kw: [${matchedSell.join(', ')}]`);
  };

  await update(); // İlk çekimi hemen yap
  if (!_newsInterval) {
    _newsInterval = setInterval(update, NEWS_FETCH_INTERVAL_MS);
  }
}

function stopNewsPolling() {
  if (_newsInterval) {
    clearInterval(_newsInterval);
    _newsInterval = null;
  }
}

/**
 * Mevcut haber sinyalini döner (cache'den okur — API çağrısı yapmaz).
 *
 * @returns {'BUY'|'SELL'|'NEUTRAL'|'CONFLICT'}
 */
function getNewsSignal() {
  return _newsState.signal;
}

/**
 * Tam haber state'ini döner (dashboard için).
 */
function getNewsState() {
  return { ..._newsState };
}

/**
 * Manuel analiz — dışarıdan başlık dizisi vererek test edebilirsiniz.
 */
function analyzeNews(headlines) {
  return analyzeHeadlines(headlines);
}

module.exports = {
  startNewsPolling,
  stopNewsPolling,
  getNewsSignal,
  getNewsState,
  analyzeNews,
  BUY_KEYWORDS,
  SELL_KEYWORDS,
};

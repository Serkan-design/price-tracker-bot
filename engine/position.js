/**
 * position.js
 * ────────────
 * Pozisyon açma / kapama mantığı.
 * State modülüne yazar, risk modülünden SL değerleri alır.
 */

'use strict';

const { v4: uuidv4 } = (() => {
  // uuid yoksa basit ID üret
  try { return require('uuid'); }
  catch { return { v4: () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }; }
})();

const state   = require('./state');
const risk    = require('./risk');

// ─────────────────────────────────────────────────────────────
// Pozisyon Aç
// ─────────────────────────────────────────────────────────────

/**
 * Yeni pozisyon açar.
 *
 * @param {'BUY'|'SELL'} direction
 * @param {number} currentPrice
 * @param {string} reason — sinyalin neden açıldığı (log için)
 * @returns {{ success: boolean, position?: object, message: string }}
 */
function openPosition(direction, currentPrice, reason = '') {
  // ── Ön kontroller ─────────────────────────────────────────
  if (!state.canOpenPosition()) {
    return { success: false, message: `Maks açık pozisyon sayısına ulaşıldı (${state.MAX_OPEN_POSITIONS})` };
  }

  if (state.state.isBlocked) {
    return { success: false, message: `Motor bloke: ${state.state.blockReason}` };
  }

  if (!state.state.isRunning) {
    return { success: false, message: 'Motor çalışmıyor' };
  }

  // ── Pozisyon büyüklüğü & SL ───────────────────────────────
  const initialSL = risk.calcInitialSL(currentPrice, direction);
  const size      = risk.calcPositionSize(
    state.state.balanceUsd,
    currentPrice,
    initialSL
  );

  if (size <= 0) {
    return { success: false, message: 'Pozisyon büyüklüğü hesaplanamadı (bakiye yetersiz?)' };
  }

  // ── Pozisyon nesnesi ──────────────────────────────────────
  const id = typeof uuidv4 === 'function'
    ? uuidv4()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const position = {
    id,
    direction,
    entryPrice:    currentPrice,
    currentSL:     initialSL,
    initialSL,
    size,           // oz
    entryAt:       new Date().toISOString(),
    reason,
    trailingStage: 'INITIAL',
    peakPricePct:  0,
  };

  state.addPosition(position);

  const costUsd = currentPrice * size;
  console.log(
    `[POS] ✅ Açıldı #${id.slice(0, 8)} | ${direction} | ` +
    `Giriş=$${currentPrice.toFixed(2)} | SL=$${initialSL.toFixed(2)} | ` +
    `Miktar=${size}oz | Maliyet=$${costUsd.toFixed(2)} | Neden: ${reason}`
  );

  return { success: true, position, message: 'Pozisyon açıldı' };
}

// ─────────────────────────────────────────────────────────────
// Pozisyon Kapat
// ─────────────────────────────────────────────────────────────

/**
 * Mevcut pozisyonu kapatır, PnL uygular ve trade history'e ekler.
 *
 * @param {string} positionId
 * @param {number} exitPrice
 * @param {string} reason — kapanış nedeni
 * @returns {{ success: boolean, trade?: object, message: string }}
 */
function closePosition(positionId, exitPrice, reason = '') {
  const pos = state.getPosition(positionId);
  if (!pos) {
    return { success: false, message: `Pozisyon bulunamadı: ${positionId}` };
  }

  // ── PnL Hesaplama ─────────────────────────────────────────
  const pnlUsd = risk.calcUnrealizedPnl(pos, exitPrice);
  const pnlPct = risk.calcProfitPct(pos.entryPrice, exitPrice, pos.direction);
  const usdToTry = state.state.usdToTry;

  // ── Trade Kaydı ───────────────────────────────────────────
  const trade = {
    id:          pos.id,
    direction:   pos.direction,
    entryPrice:  pos.entryPrice,
    exitPrice,
    size:        pos.size,
    pnlUsd:      parseFloat(pnlUsd.toFixed(2)),
    pnlTry:      Math.round(pnlUsd * usdToTry),
    pnlPct:      parseFloat(pnlPct.toFixed(3)),
    result:      pnlUsd >= 0 ? 'WIN' : 'LOSS',
    openAt:      pos.entryAt,
    closeAt:     new Date().toISOString(),
    reason,
    trailingStage: pos.trailingStage,
  };

  // ── State Güncelle ────────────────────────────────────────
  state.applyPnl(pnlUsd);
  state.removePosition(positionId);
  state.addTradeToHistory(trade);

  const icon = pnlUsd >= 0 ? '💰' : '💸';
  console.log(
    `[POS] ${icon} Kapatıldı #${pos.id.slice(0, 8)} | ${pos.direction} | ` +
    `Giriş=$${pos.entryPrice.toFixed(2)} Çıkış=$${exitPrice.toFixed(2)} | ` +
    `PnL=$${pnlUsd.toFixed(2)} (%${pnlPct.toFixed(2)}) | Neden: ${reason}`
  );

  return { success: true, trade, message: `Pozisyon kapatıldı: ${reason}` };
}

// ─────────────────────────────────────────────────────────────
// Trailing Stop Güncelle
// ─────────────────────────────────────────────────────────────

/**
 * Açık pozisyon için trailing stop'u günceller.
 * SL değişirse state'e yazar.
 *
 * @param {string} positionId
 * @param {number} currentPrice
 */
function updatePositionTrailing(positionId, currentPrice) {
  const pos = state.getPosition(positionId);
  if (!pos) return;

  const { newSL, slMoved, trailingStage } = risk.updateTrailingStop(pos, currentPrice);

  if (slMoved) {
    state.updatePosition(positionId, { currentSL: newSL, trailingStage });
    const dir = pos.direction === 'BUY' ? '⬆️' : '⬇️';
    console.log(
      `[TRAIL] ${dir} #${positionId.slice(0, 8)} | ` +
      `Yeni SL=$${newSL.toFixed(2)} | Aşama: ${trailingStage}`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Manuel İşlemler (dashboard'dan tetiklenir)
// ─────────────────────────────────────────────────────────────

function manualOpenPosition(direction, currentPrice) {
  return openPosition(direction, currentPrice, 'MANUAL');
}

function manualClosePosition(positionId, currentPrice) {
  return closePosition(positionId, currentPrice, 'MANUAL_CLOSE');
}

function manualCloseAll(currentPrice) {
  const positions = state.getPositions();
  const results = positions.map(p =>
    closePosition(p.id, currentPrice, 'MANUAL_CLOSE_ALL')
  );
  return { closed: results.length, results };
}

module.exports = {
  openPosition,
  closePosition,
  updatePositionTrailing,
  manualOpenPosition,
  manualClosePosition,
  manualCloseAll,
};

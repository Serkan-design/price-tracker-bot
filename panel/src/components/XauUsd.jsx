import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Bell, RefreshCw,
  Activity, BarChart2, Target, Zap, Shield, ChevronUp, ChevronDown, Info, PlayCircle, Clock, Trash2, Power,
  DollarSign, TrendingUp as ProfitIcon, List as HistoryIcon
} from 'lucide-react'

const API = (path) => path

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` }
}

function clamp(min, val, max) { return Math.min(max, Math.max(min, val)) }

function formatRelativeTime(timestamp) {
  if (!timestamp) return '---'
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (diff < 5) return 'az önce'
  if (diff < 60) return `${diff} sn önce`
  return `${Math.floor(diff / 60)} dk önce`
}

function rsiColor(rsi) {
  if (rsi === null) return '#6b7280'
  if (rsi <= 30) return '#22c55e'
  if (rsi >= 70) return '#ef4444'
  return '#f59e0b'
}

function signalStyle(signal) {
  if (signal === 'BUY') return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', label: '📈 ALIŞ' }
  if (signal === 'SELL') return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', label: '📉 SATIŞ' }
  return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', label: '⚖️ NÖTR' }
}

function TrendIcon({ trend, size = 20 }) {
  if (trend === 'UP') return <TrendingUp size={size} color="#22c55e" />
  if (trend === 'DOWN') return <TrendingDown size={size} color="#ef4444" />
  return <Minus size={size} color="#f59e0b" />
}

function ConfidenceBar({ value, text }) {
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4, letterSpacing: '0.05em' }}>
        <span>{text || 'Güven Skoru'}</span><span style={{ color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#1e293b', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 10, transition: 'width 1s ease' }} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent = '#6366f1', icon, progress, className = "" }) {
  return (
    <div className={className} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent}33`, borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 16, right: 16, opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: '11px', color: '#cbd5e1', letterSpacing: '0.12em', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{sub}</div>}
      {progress !== undefined && (
        <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', marginTop: 4 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: accent }} />
        </div>
      )}
    </div>
  )
}

function MiniChart({ history }) {
  if (!history || history.length < 2) {
    return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Grafik verisi analiz ediliyor...</div>
  }
  const prices = history.map(h => h.price)
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1
  const W = 600, H = 120
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * W},${H - ((p - min) / range) * (H - 10) - 5}`).join(' ')
  const isUp = prices[prices.length - 1] >= prices[0]
  const color = isUp ? '#22c55e' : '#ef4444'
  const fillId = isUp ? 'greenFill' : 'redFill'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${fillId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function RSIGauge({ rsi }) {
  const color = rsiColor(rsi)
  const pct = rsi !== null ? clamp(0, rsi, 100) : 0
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 100, height: 50, margin: '0 auto 8px' }}>
        <svg viewBox="0 0 100 50" style={{ width: 100, height: 50 }}>
          <path d="M5,45 A45,45,0,0,1,95,45" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
          <path d="M5,45 A45,45,0,0,1,95,45" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 141.37} 141.37`} style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        </svg>
        <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', fontSize: 18, fontWeight: 900, color }}>
          {rsi ?? '--'}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>Hız Göstergesi (RSI)</div>
    </div>
  )
}

function LevelRow({ price, level, type }) {
  const isClose = price && Math.abs(price - level) <= 2
  const color = type === 'support' ? '#22c55e' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: isClose ? `${color}18` : 'rgba(255,255,255,0.02)', border: `1px solid ${isClose ? color : '#1e293b'}`, marginBottom: 6, transition: 'all 0.3s' }}>
      <span style={{ fontSize: 13, color }}>{type === 'support' ? '🛡️ Destek' : '📊 Direnç'} ${level.toFixed(2)}</span>
      {isClose && <span style={{ fontSize: 10, fontWeight: 800, color, background: `${color}22`, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase' }}>Kritik Bölge</span>}
    </div>
  )
}

function TradingPanel({ token, analysis }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(API('/api/xauusd/trade-stats'), { headers: { Authorization: `Bearer ${token}` } })
      setStats(res.data)
    } catch (_) {}
  }, [token])

  useEffect(() => {
    fetchStats()
    const timer = setInterval(fetchStats, 10000)
    return () => clearInterval(timer)
  }, [fetchStats])

  const resetDemo = async () => {
    setLoading(true)
    try {
      await axios.post(API('/api/xauusd/reset-demo'), {}, { headers: { Authorization: `Bearer ${token}` } })
      await fetchStats()
      // alert("✅ Likidite Başarıyla Yüklendi! Terminal aktif.") // Removing alert for speed
    } catch (_) {
      alert("❌ Sıfırlama başarısız. Lütfen tekrar deneyin.")
    }
    finally { setLoading(false) }
  }

  const handleManualTrade = async (type = 'BUY') => {
    if (loading || stats.currentPosition) return;
    setLoading(true)
    try {
      const res = await axios.post(API('/api/xauusd/manual-trade'), { type }, { headers: { Authorization: `Bearer ${token}` } })
      if (res.data) await fetchStats()
    } catch (err) {
      console.error('Manual trade error:', err)
      alert(err.response?.data?.message || 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.')
    } finally { 
      setTimeout(() => setLoading(false), 500)
    }
  }

  const handleClosePosition = async () => {
    if (loading || !stats.currentPosition) return;
    setLoading(true)
    try {
      await axios.post(API('/api/xauusd/close-position'), {}, { headers: { Authorization: `Bearer ${token}` } })
      await fetchStats()
    } catch (err) {
      alert(err.response?.data?.message || 'İşlem kapatılamadı.')
    } finally {
      setTimeout(() => setLoading(false), 500)
    }
  }

  if (!stats) return null

  return (
    <div className="glass" style={{ margin: '0 32px 24px', padding: '24px', border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 900, color: '#22c55e' }}>
          <ProfitIcon size={22} /> Canlı Al-Sat Simülatörü
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {stats.currentPosition ? (
            <button onClick={handleClosePosition} disabled={loading} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
              {loading ? 'KAPATILIYOR...' : 'İŞLEMİ KAPAT (SAT)'}
            </button>
          ) : (
            <button onClick={() => handleManualTrade('BUY')} disabled={loading} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: 'pointer', opacity: loading ? 0.5 : 1, transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(34,197,94,0.2)' }}>
              {loading ? 'İŞLEM YAPILIYOR...' : 'MANUEL SATIN AL'}
            </button>
          )}
          <button onClick={resetDemo} disabled={loading} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '10px 20px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>
            {loading ? 'YÜKLENİYOR...' : 'SANAL BAKİYE YÜKLE'}
          </button>
        </div>
      </div>

      {stats.virtualBalance === 0 && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, color: '#fca5a5', fontSize: 14, fontWeight: 800, textAlign: 'center', boxShadow: '0 0 20px rgba(239,68,68,0.1)' }}>
          🚨 Hesap Aktif Değil (Sanal bakiye yükleyerek başlayın)
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label={stats.virtualBalance > 0 ? "SANAL BAKİYE" : "BAKİYE"} value={stats.virtualBalance ? `$${stats.virtualBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'} accent="#22c55e" icon={<DollarSign size={40} />} className="balance-glow" />
        <StatCard label="Bugünkü Kâr (TL)" value={`${(stats.dailyProfitTl || 0).toLocaleString('tr-TR')} TL`} sub={`$${(stats.dailyProfit || 0).toFixed(2)} USD`} accent={(stats.dailyProfit || 0) >= 0 ? '#22c55e' : '#ef4444'} icon={<ProfitIcon size={40} />} />
        <StatCard label="Toplam Kâr" value={`${(stats.totalProfitTl || 0).toLocaleString('tr-TR')} TL`} sub={`$${(stats.totalProfit || 0).toFixed(2)} USD`} accent={(stats.totalProfit || 0) >= 0 ? '#22c55e' : '#ef4444'} icon={<Activity size={40} />} />
        <StatCard label="Durum" value={stats.currentPosition ? 'İŞLEMDE' : 'FIRSAT KOLLUYOR'} accent={stats.currentPosition ? '#f59e0b' : '#64748b'} icon={<Zap size={40} />} />
      </div>

      {stats.currentPosition && (
        <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '16px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 800, marginBottom: 8 }}>AKTİF POZİSYON</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#f1f5f9' }}>BUY XAUUSD</span>
              <span style={{ marginLeft: 12, fontSize: 14, color: '#94a3b8' }}>Giriş: ${stats.currentPosition.entryPrice?.toFixed(2)}</span>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Lot: {stats.currentPosition.lotSize || 0.1} | Maliyet: ${(stats.currentPosition.cost || 0).toFixed(2)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {/* Gerçek zamanlı PNL: sunucudan gelen unrealizedPnlTl değerini kullan */}
              {stats.unrealizedPnlTl !== undefined ? (
                <div style={{ fontSize: 18, fontWeight: 900, color: stats.unrealizedPnlTl >= 0 ? '#22c55e' : '#ef4444' }}>
                  {stats.unrealizedPnlTl >= 0 ? '+' : ''}{stats.unrealizedPnlTl} TL
                  <span style={{ fontSize: 12, marginLeft: 8, opacity: 0.8 }}>
                    ({stats.unrealizedPnl >= 0 ? '+' : ''}{stats.unrealizedPnl?.toFixed(2)}$)
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 900, color: '#94a3b8' }}>Hesaplanıyor...</div>
              )}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Anlık Kâr/Zarar</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Min. satış eşiği: {stats.minProfitTl || 300} TL
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cooldown bilgisi */}
      {!stats.currentPosition && stats.cooldownRemaining > 0 && (
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#a5b4fc', fontWeight: 700 }}>
          ⏳ Sonraki alım için bekleniyor: {stats.cooldownRemaining} saniye
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 900, color: '#cbd5e1', marginBottom: 12 }}>
          <HistoryIcon size={16} /> SON İŞLEMLER
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8', fontWeight: 800 }}>TİP</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8', fontWeight: 800 }}>GİRİŞ</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8', fontWeight: 800 }}>ÇIKIŞ</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8', fontWeight: 800 }}>KÂR/ZARAR</th>
                <th style={{ padding: '10px', textAlign: 'right', color: '#94a3b8', fontWeight: 800 }}>TARİH</th>
              </tr>
            </thead>
            <tbody>
              {stats.tradeHistory?.slice().reverse().map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '10px', color: '#22c55e', fontWeight: 800 }}>BUY</td>
                  <td style={{ padding: '10px', color: '#f1f5f9' }}>${t.entryPrice?.toFixed(2)}</td>
                  <td style={{ padding: '10px', color: '#f1f5f9' }}>${t.exitPrice?.toFixed(2)}</td>
                  <td style={{ padding: '10px', color: t.pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
                    {t.pnlTl} TL ({t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}$)
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#94a3b8' }}>{new Date(t.exitTime).toLocaleTimeString()}</td>
                </tr>
              ))}
              {(!stats.tradeHistory || stats.tradeHistory.length === 0) && (
                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Henüz işlem yapılmadı.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function BacktestPanel({ token }) {
  const [bars, setBars] = useState(500)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const res = await axios.get(API(`/api/xauusd/backtest?n=${bars}`), { headers: { Authorization: `Bearer ${token}` } })
      setResult(res.data)
    } catch (_) { setResult({ error: 'Strateji simülasyonu başarısız.' }) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ margin: '0 32px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 16, padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 800 }}>
          <PlayCircle size={20} color="#6366f1" /> Strateji Simülasyonu (Backtest)
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={bars} onChange={e => setBars(Number(e.target.value))}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1e293b', borderRadius: 10, color: '#f1f5f9', padding: '8px 14px', fontSize: 13, outline: 'none' }}>
            {[100, 200, 500, 1000, 2000].map(n => <option key={n} value={n} style={{ background: '#0f172a' }}>Son {n} bar verisi</option>)}
          </select>
          <button onClick={run} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--primary)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.2s' }}>
            {loading ? <RefreshCw size={16} className="animate-spin" /> : 'BACKTEST BAŞLAT'}
          </button>
        </div>
      </div>

      {!result && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 12 }}>
          Lütfen analiz edilecek veri miktarını seçip simülasyonu başlatın.
        </div>
      )}

      {result?.error && <div style={{ color: '#f87171', fontSize: 13, padding: '12px 0' }}>⚠️ {result.error}</div>}

      {result && !result.error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Kazanma Oranı', value: `%${result.winRate}`, color: result.winRate >= 50 ? '#22c55e' : '#ef4444' },
              { label: 'Toplam İşlem', value: result.totalTrades, color: '#6366f1' },
              { label: 'Net Kâr/Zarar', value: `$${result.totalPnl}`, color: result.totalPnl >= 0 ? '#22c55e' : '#ef4444' },
              { label: 'Ort. İşlem Kârı', value: `$${result.avgPnl}`, color: result.avgPnl >= 0 ? '#22c55e' : '#ef4444' },
              { label: 'Max Kayıp', value: `$${result.maxDrawdown}`, color: '#f59e0b' },
              { label: 'Aktif Veri', value: result.barsAnalyzed, color: '#94a3b8' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>{s.label.toUpperCase()}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {result.trades?.length > 0 && (
            <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#94a3b8' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    {['SİNYAL', 'GÜVEN', 'GİRİŞ', 'ÇIKIŞ', 'P&L', 'SÜRE'].map(h => (
                      <th key={h} style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontWeight: 800 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(-10).map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px', color: t.signal === 'BUY' ? '#22c55e' : '#ef4444', fontWeight: 800 }}>{t.signal === 'BUY' ? '📈 BUY' : '📉 SELL'}</td>
                      <td style={{ padding: '12px' }}>%{t.confidence}</td>
                      <td style={{ padding: '12px' }}>${t.entryPrice}</td>
                      <td style={{ padding: '12px' }}>${t.exitPrice}</td>
                      <td style={{ padding: '12px', color: t.pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 800 }}>{t.pnl >= 0 ? '+' : ''}${t.pnl}</td>
                      <td style={{ padding: '12px' }}>{t.bars} bar</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function XauUsd() {
  const [analysis, setAnalysis] = useState(null)
  const [history, setHistory] = useState([])
  const [activeAlerts, setActiveAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [alertInput, setAlertInput] = useState({ supportRaw: '', resistanceRaw: '', spike: '5', drop: '', rise: '' })
  const [alertSaved, setAlertSaved] = useState(false)
  const prevPrice = useRef(null)
  const [flash, setFlash] = useState(null)
  const token = localStorage.getItem('token')

  const fetchActiveAlerts = useCallback(async () => {
    try {
      const res = await axios.get(API('/api/xauusd/active-alerts'), { headers: authHeader() })
      setActiveAlerts(res.data)
    } catch (_) {}
  }, [])

  const deleteAlert = async (id) => {
    try {
      await axios.delete(API(`/api/xauusd/active-alerts/${id}`), { headers: authHeader() })
      fetchActiveAlerts()
    } catch (_) {}
  }

  const fetchData = useCallback(async (live = false) => {
    try {
      const endpoint = live ? '/api/xauusd/live' : '/api/xauusd/analysis'
      const [aRes, hRes] = await Promise.all([
        axios.get(API(endpoint), { headers: authHeader() }),
        axios.get(API('/api/xauusd/history?n=200'), { headers: authHeader() }),
      ])
      const newAnalysis = aRes.data
      
      if (prevPrice.current !== null && newAnalysis?.price) {
        if (Math.abs(newAnalysis.price - prevPrice.current) > 0.01) {
          setFlash(newAnalysis.price > prevPrice.current ? 'up' : 'down')
          setTimeout(() => setFlash(null), 700)
        }
      }
      prevPrice.current = newAnalysis?.price || null
      setAnalysis(newAnalysis)
      setHistory(hRes.data)
      setError('')
    } catch (err) {
      if (err.response?.status === 503) setError('Sistem ısınırken analizler hazırlanıyor, 60 sn bekleyin...')
      else setError('Canlı bağlantı hatası.')
    }
  }, [])

  useEffect(() => {
    fetchData(false).finally(() => setLoading(false))
    fetchActiveAlerts()
    const timer = setInterval(() => fetchData(false), 60_000)
    return () => clearInterval(timer)
  }, [fetchData, fetchActiveAlerts])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData(true)
    setRefreshing(false)
  }

  const saveAlerts = async () => {
    const support = alertInput.supportRaw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
    const resistance = alertInput.resistanceRaw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
    const spikeThreshold = parseFloat(alertInput.spike) || 5
    const dropThreshold = parseFloat(alertInput.drop) || null
    const riseThreshold = parseFloat(alertInput.rise) || null
    try {
      await axios.post(API('/api/xauusd/alerts'), { support, resistance, spikeThreshold, dropThreshold, riseThreshold }, { headers: authHeader() })
      setAlertSaved(true)
      fetchActiveAlerts()
      setTimeout(() => setAlertSaved(false), 3000)
    } catch (err) { alert('Hata oluştu') }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', paddingTop: '15vh' }}>
          <div style={styles.spinner} />
          <p style={{ color: '#94a3b8', marginTop: 24, fontSize: 13, letterSpacing: '0.05em' }}>TERMINAL BAŞLATILIYOR...</p>
        </div>
      </div>
    )
  }

  const sig = analysis ? signalStyle(analysis.signal) : signalStyle('NEUTRAL')
  const flashClass = flash === 'up' ? 'price-flash-up' : flash === 'down' ? 'price-flash-down' : ''

  return (
    <div style={styles.page} className="animate-entrance">
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={styles.goldIcon}><TrendingUp size={24} color="#1c1917" /></div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#f8fafc' }}>XAUUSD CANLI ANALİZ TERMİNALİ</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Canlı Analiz Akışı</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>SON GÜNCELLEME</div>
            <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{formatRelativeTime(analysis?.timestamp)}</div>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} style={styles.refreshBtn}>
            <RefreshCw size={16} style={refreshing ? styles.spinning : {}} />
            {refreshing ? 'Veri Çekiliyor...' : 'YENİLE'}
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBanner}><AlertTriangle size={16} /> {error}</div>}

      <div style={styles.mainGrid}>
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {analysis && (
            <div className={`glass ${flashClass}`} style={styles.priceCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 4 }}>SPOT MARKET PRICE</div>
                  <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.02em', color: '#f8fafc' }} className="trading-vibe-text">
                    ${analysis.price?.toFixed(2) ?? '---'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: analysis.change >= 0 ? '#22c55e' : '#ef4444' }}>
                      {analysis.change >= 0 ? '▲' : '▼'} {Math.abs(analysis.change)?.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: 6 }}>
                      %{analysis.changePct >= 0 ? '+' : ''}{analysis.changePct?.toFixed(3)}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 160 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: sig.bg, border: `1px solid ${sig.border}`, borderRadius: 12, padding: '12px 24px', marginBottom: 16 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: sig.color }}>{sig.label}</span>
                  </div>
                  <ConfidenceBar value={analysis.confidence ?? 0} text={analysis.confidenceText} />
                </div>
              </div>

              {analysis.insights && (
                <div className="insight-card">
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>💡 {analysis.insights.main}</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{analysis.insights.detail}</div>
                </div>
              )}

              <div style={{ marginTop: 24 }}>
                <MiniChart history={history} />
              </div>
            </div>
          )}

          <div style={styles.statsGrid}>
            <StatCard label="Trend" value={analysis?.trend === 'UP' ? 'YUKARI' : analysis?.trend === 'DOWN' ? 'AŞAĞI' : 'YATAY'}
              sub={analysis?.trend === 'UP' ? 'Alıcılar güçlü' : analysis?.trend === 'DOWN' ? 'Satıcılar güçlü' : 'Piyasa kararsız'}
              accent={analysis?.trend === 'UP' ? '#22c55e' : analysis?.trend === 'DOWN' ? '#ef4444' : '#f59e0b'}
              icon={<TrendIcon trend={analysis?.trend} size={40} />} />
            
            <StatCard label="RSI Durumu" 
              value={analysis?.rsiSignal === 'OVERSOLD' ? 'AŞIRI SATIM' : analysis?.rsiSignal === 'OVERBOUGHT' ? 'AŞIRI ALIM' : 'NÖTR'}
              sub={analysis?.rsi !== null ? `RSI: ${analysis.rsi}` : 'Hesaplanıyor...'}
              accent={rsiColor(analysis?.rsi)} icon={<Activity size={40} />} />

            <StatCard label="Veri Durumu" value={`%${analysis?.historyPercent || 0}`}
              sub={`${analysis?.historyCount || 0} bar analiz edildi`}
              progress={analysis?.historyPercent} accent="#8b5cf6" icon={<Shield size={40} />} />
          </div>

          <div style={styles.srGrid}>
            <div className="glass" style={{ padding: 24 }}>
              <div style={styles.srTitle}><Shield size={16} color="#ef4444" /><span>DİRENÇ BÖLGELERİ</span></div>
              {analysis?.resistance?.length > 0 ? analysis.resistance.slice().reverse().map((lvl, i) => <LevelRow key={i} price={analysis.price} level={lvl} type="resistance" />) : <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, padding: '10px 0' }}>Sistem direnç seviyelerini hesaplıyor...</p>}
            </div>
            <div className="glass" style={{ padding: 24 }}>
              <div style={styles.srTitle}><Target size={16} color="#22c55e" /><span>DESTEK BÖLGELERİ</span></div>
              {analysis?.support?.length > 0 ? [...analysis.support].reverse().map((lvl, i) => <LevelRow key={i} price={analysis.price} level={lvl} type="support" />) : <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, padding: '10px 0' }}>Sistem destek seviyelerini hesaplıyor...</p>}
            </div>
          </div>
        </div>

        <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="glass" style={{ padding: 24, background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 900, marginBottom: 20 }}>
              <Bell size={20} color="#f59e0b" /> Alarm Merkezi
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={styles.alertLabel}>Düşüş Alarmı ($)</label>
                  <input type="number" placeholder="Örn: 50" value={alertInput.drop} onChange={e => setAlertInput(p => ({ ...p, drop: e.target.value }))} style={styles.alertInput} />
                </div>
                <div>
                  <label style={styles.alertLabel}>Yükseliş Alarmı ($)</label>
                  <input type="number" placeholder="Örn: 30" value={alertInput.rise} onChange={e => setAlertInput(p => ({ ...p, rise: e.target.value }))} style={styles.alertInput} />
                </div>
              </div>
              <button onClick={saveAlerts} style={styles.saveBtn}>
                {alertSaved ? '✅ ALARM KURULDU' : 'ALARM KUR (BİLDİRİM AL)'}
              </button>
            </div>

            {activeAlerts.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 12, letterSpacing: '0.05em' }}>AKTİF ALARMLAR</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeAlerts.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{a.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => deleteAlert(a.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass" style={{ padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <BarChart2 size={18} color="#6366f1" /> Global İstatistikler
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#94a3b8' }}>Toplam Bildirim:</span>
                <span style={{ color: '#f1f5f9', fontWeight: 800 }}>{analysis?.globalStats?.totalAlerts || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#94a3b8' }}>Son Sinyal:</span>
                <span style={{ color: '#f1f5f9', fontWeight: 800 }}>{analysis?.globalStats?.lastSignalType ? analysis.globalStats.lastSignalType.replace('SIGNAL_', '') : 'Yok'}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <RSIGauge rsi={analysis?.rsi} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <TradingPanel token={token} analysis={analysis} />
      <BacktestPanel token={token} />

      <div style={styles.disclaimer}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <b>Risk Protokolü:</b> Bu terminal yüksek volatilite içeren teknik analiz verileri sunar. Yatırım tavsiyesi değildir.
          Sermayenizi korumak için kendi analizlerinizi yapınız.
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '0 0 40px', display: 'flex', flexDirection: 'column', gap: 24 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '28px 32px 0' },
  goldIcon: { width: 52, height: 52, background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 25px rgba(245,158,11,0.4)' },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '10px 20px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.2s' },
  errorBanner: { margin: '0 32px', padding: '14px 18px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, color: '#f87171', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 },
  mainGrid: { display: 'flex', gap: 24, margin: '0 32px', flexWrap: 'wrap' },
  priceCard: { width: '100%', padding: '32px', borderRadius: 24, position: 'relative', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 },
  srGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  srTitle: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.1em' },
  alertLabel: { display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 800, marginBottom: 8, letterSpacing: '0.05em' },
  alertInput: { width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, outline: 'none' },
  saveBtn: { width: '100%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#1c1917', padding: '14px', borderRadius: 12, cursor: 'pointer', fontWeight: 900, fontSize: 14, transition: 'all 0.2s' },
  disclaimer: { margin: '0 32px', padding: '16px 20px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)', borderRadius: 12, fontSize: 12, color: '#64748b', display: 'flex', gap: 12, lineHeight: 1.6 },
  spinner: { width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.05)', borderTopColor: '#f59e0b', animation: 'spin 0.8s linear infinite', margin: '0 auto' },
  spinning: { animation: 'spin 0.8s linear infinite' },
}

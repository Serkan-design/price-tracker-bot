import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })
const fmt = (n, d=2) => (n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtT = ts => { if (!ts) return '--'; const s = Math.floor((Date.now()-new Date(ts))/1000); return s<60?`${s}sn`:`${Math.floor(s/60)}dk`; }

const COLORS = { BUY:'#22c55e', SELL:'#ef4444', NEUTRAL:'#f59e0b', UP:'#22c55e', DOWN:'#ef4444' }
const col = (v) => v >= 0 ? '#22c55e' : '#ef4444'

function Badge({ label, color='#f59e0b' }) {
  return <span style={{ padding:'3px 10px', borderRadius:8, background:`${color}22`, color, fontWeight:800, fontSize:11, border:`1px solid ${color}44` }}>{label}</span>
}

function Card({ title, value, sub, color='#6366f1', extra }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${color}33`, borderRadius:16, padding:'18px 20px' }}>
      <div style={{ fontSize:10, color:'#94a3b8', fontWeight:800, letterSpacing:'0.1em', marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:22, fontWeight:900, color:'#f1f5f9' }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>{sub}</div>}
      {extra}
    </div>
  )
}

function MiniChart({ data=[], color='#6366f1', h=60 }) {
  if (data.length < 2) return null
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx-mn||1
  const W=200, H=h
  const pts = data.map((v,i) => `${(i/(data.length-1))*W},${H-((v-mn)/rng)*(H-4)-2}`)
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:h, display:'block' }} preserveAspectRatio="none">
    <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

function RSIBar({ rsi }) {
  const c = rsi >= 70 ? '#ef4444' : rsi <= 30 ? '#22c55e' : '#f59e0b'
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#94a3b8', marginBottom:4 }}>
        <span>RSI(14)</span><span style={{ color:c, fontWeight:900 }}>{rsi?.toFixed(1) ?? '--'}</span>
      </div>
      <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:10 }}>
        <div style={{ height:'100%', width:`${rsi ?? 50}%`, background:c, borderRadius:10, transition:'width 0.5s ease', boxShadow:`0 0 8px ${c}88` }}/>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#475569', marginTop:3 }}>
        <span>0 AŞIRI SATIM</span><span>50</span><span>AŞIRI ALIM 100</span>
      </div>
    </div>
  )
}

function PositionRow({ pos, onClose, usdToTry, currentPrice }) {
  const pnl = pos.direction === 'BUY' ? (currentPrice - pos.entryPrice)*pos.size : (pos.entryPrice - currentPrice)*pos.size
  const pnlPct = pos.direction === 'BUY' ? ((currentPrice-pos.entryPrice)/pos.entryPrice)*100 : ((pos.entryPrice-currentPrice)/pos.entryPrice)*100
  const pnlTry = pnl * usdToTry
  return (
    <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, padding:'14px 16px', marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div>
          <Badge label={pos.direction} color={COLORS[pos.direction]}/>
          <span style={{ marginLeft:10, fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Giriş: ${pos.entryPrice?.toFixed(2)}</span>
          <span style={{ marginLeft:8, fontSize:11, color:'#64748b' }}>SL: ${pos.currentSL?.toFixed(2)}</span>
          {pos.trailingStage !== 'INITIAL' && <Badge label={pos.trailingStage} color="#8b5cf6"/>}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:18, fontWeight:900, color:col(pnl) }}>{pnl>=0?'+':''}{fmt(pnlTry,0)} TL</div>
          <div style={{ fontSize:11, color:'#94a3b8' }}>{pnlPct>=0?'+':''}{pnlPct.toFixed(2)}% • {pos.size}oz</div>
          <button onClick={() => onClose(pos.id)} style={{ marginTop:6, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', padding:'4px 12px', borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:700 }}>KAPAT</button>
        </div>
      </div>
    </div>
  )
}

export default function XauUsd() {
  const [analysis, setAnalysis] = useState(null)
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [closingId, setClosingId] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const prevPrice = useRef(null)
  const [flash, setFlash] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [a, s, h] = await Promise.all([
        axios.get('/api/xauusd/analysis', { headers: tok() }),
        axios.get('/api/xauusd/trade-stats', { headers: tok() }),
        axios.get('/api/xauusd/history?n=120', { headers: tok() }),
      ])
      if (prevPrice.current && a.data?.price) {
        if (Math.abs(a.data.price - prevPrice.current) > 0.01) {
          setFlash(a.data.price > prevPrice.current ? 'up' : 'down')
          setTimeout(() => setFlash(null), 600)
        }
      }
      prevPrice.current = a.data?.price
      setAnalysis(a.data)
      setStats(s.data)
      setHistory(h.data)
      setErr('')
    } catch (e) {
      const status = e.response?.status
      if (status === 401) {
        // Token süresi dolmuş — oturumu temizle ve login'e yönlendir
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setErr('⏱ Oturum süresi doldu, yeniden giriş yapılıyor...')
        setTimeout(() => { window.location.href = '/' }, 1500)
        return
      }
      if (status === 503) {
        setErr('📊 Veri toplanıyor (EMA200 için veri birikimi bekleniyor)...')
      } else {
        setErr('⚠️ Sunucuya ulaşılamıyor — backend çalışıyor mu?')
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 8000)
    return () => clearInterval(t)
  }, [fetchAll])

  const closePos = async (id) => {
    setClosingId(id)
    try {
      await axios.post('/api/xauusd/close-position', {}, { headers: tok() })
      await fetchAll()
    } catch (e) { alert(e.response?.data?.message || 'Kapatma hatası') }
    setClosingId(null)
  }

  const resetDemo = async () => {
    try { await axios.post('/api/xauusd/reset-demo', {}, { headers: tok() }); await fetchAll() }
    catch (_) {}
  }

  const manualBuy = async () => {
    try { await axios.post('/api/xauusd/manual-trade', { type:'BUY' }, { headers: tok() }); await fetchAll() }
    catch (e) { alert(e.response?.data?.message || 'Hata') }
  }

  const manualSell = async () => {
    try { await axios.post('/api/xauusd/manual-trade', { type:'SELL' }, { headers: tok() }); await fetchAll() }
    catch (e) { alert(e.response?.data?.message || 'Hata') }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:16 }}>
      <div style={{ width:48, height:48, border:'3px solid rgba(245,158,11,0.2)', borderTopColor:'#f59e0b', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <div style={{ color:'#94a3b8', fontSize:13, fontWeight:700 }}>XAUUSD TERMİNAL BAŞLATILIYOR...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const a = analysis
  const s = stats
  const prices = history.map(h => h.price)
  const trendColor = a?.trend === 'UP' ? '#22c55e' : a?.trend === 'DOWN' ? '#ef4444' : '#f59e0b'
  const sigColor = a?.signal === 'BUY' ? '#22c55e' : a?.signal === 'SELL' ? '#ef4444' : '#f59e0b'
  const flashBg = flash === 'up' ? 'rgba(34,197,94,0.15)' : flash === 'down' ? 'rgba(239,68,68,0.15)' : 'transparent'

  return (
    <div style={{ fontFamily:"'Inter',sans-serif", padding:'16px', maxWidth:1400, margin:'0 auto' }}>
      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:44, height:44, background:'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>⚡</div>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:'#f8fafc' }}>XAUUSD TERMİNAL</div>
            <div style={{ fontSize:11, color:'#64748b' }}>Deterministik Algo Trading • EMA50/200 + RSI + Haber</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ fontSize:11, color:'#64748b' }}>Son: {fmtT(a?.timestamp)}</div>
          {['dashboard','positions','history'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:12, background: tab===t ? '#f59e0b' : 'rgba(255,255,255,0.05)', color: tab===t ? '#000' : '#94a3b8' }}>
              {t === 'dashboard' ? '📊 PANEL' : t === 'positions' ? '📈 POZİSYONLAR' : '📋 GEÇMİŞ'}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{ padding:'10px 16px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, color:'#f87171', marginBottom:16, fontSize:13 }}>⚠️ {err}</div>}

      {/* CANLÜ FİYAT BANDI */}
      {a && (
        <div style={{ background:flashBg, border:`1px solid ${trendColor}33`, borderRadius:16, padding:'20px 24px', marginBottom:20, display:'flex', flexWrap:'wrap', gap:20, alignItems:'center', transition:'background 0.3s' }}>
          <div>
            <div style={{ fontSize:11, color:'#64748b', fontWeight:800 }}>XAUUSD (ALTIN/DOLAR)</div>
            <div style={{ fontSize:42, fontWeight:900, color:'#f1f5f9', lineHeight:1.1 }}>${a.price?.toFixed(2)}</div>
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', flex:1 }}>
            <div style={{ minWidth:120 }}>
              <div style={{ fontSize:10, color:'#64748b', fontWeight:800 }}>TREND</div>
              <Badge label={a.trend === 'UP' ? '⬆ YUKARI' : a.trend === 'DOWN' ? '⬇ AŞAĞI' : '➡ YATAY'} color={trendColor}/>
              <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>EMA50: {a.ema50?.toFixed(1) ?? '--'} | EMA200: {a.ema200?.toFixed(1) ?? '--'}</div>
            </div>
            <div style={{ minWidth:120 }}>
              <div style={{ fontSize:10, color:'#64748b', fontWeight:800 }}>HABER SİNYALİ</div>
              <Badge label={a.newsSignal ?? 'NEUTRAL'} color={a.newsSignal === 'BUY' ? '#22c55e' : a.newsSignal === 'SELL' ? '#ef4444' : '#f59e0b'}/>
            </div>
            <div style={{ minWidth:120 }}>
              <div style={{ fontSize:10, color:'#64748b', fontWeight:800 }}>ENTRY SİNYALİ</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Badge label={a.signal === 'BUY' ? '📈 ALIŞ' : a.signal === 'SELL' ? '📉 SATIŞ' : '⚖ NÖTR'} color={sigColor}/>
                {a.score > 0 && <span style={{ fontSize:12, fontWeight:900, color:sigColor }}>{a.score}/100</span>}
              </div>
              <div style={{ fontSize:11, color:a.blocked ? '#ef4444' : '#64748b', marginTop:4, maxWidth:250, fontWeight: a.blocked ? 700 : 400 }}>
                {a.blocked && '🚫 '}{a.entryReason}
              </div>
            </div>
            <div style={{ minWidth:100 }}>
              <div style={{ fontSize:10, color:'#64748b', fontWeight:800 }}>ATR(14)</div>
              <div style={{ fontSize:18, fontWeight:900, color:'#8b5cf6' }}>${a.atr?.toFixed(2) ?? '--'}</div>
            </div>
            <div style={{ minWidth:100 }}>
              <div style={{ fontSize:10, color:'#64748b', fontWeight:800 }}>VERİ</div>
              <div style={{ fontSize:18, fontWeight:900, color:'#94a3b8' }}>{a.historyCount} bar</div>
              {a.historyCount < 205 && <div style={{ fontSize:10, color:'#f59e0b' }}>EMA200 için {205 - a.historyCount} bar daha</div>}
            </div>
          </div>
          {/* RSI */}
          <div style={{ minWidth:200, flex:1 }}>
            <RSIBar rsi={a.rsi}/>
          </div>
        </div>
      )}

      {/* MİNİ CHART */}
      {prices.length > 2 && (
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'16px', marginBottom:20 }}>
          <div style={{ fontSize:11, color:'#64748b', fontWeight:800, marginBottom:8 }}>FİYAT GEÇMİŞİ (SON 120 NOKTA)</div>
          <MiniChart data={prices} color={trendColor} h={80}/>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#475569', marginTop:4 }}>
            <span>${Math.min(...prices).toFixed(2)}</span>
            <span>${Math.max(...prices).toFixed(2)}</span>
          </div>
        </div>
      )}

      {tab === 'dashboard' && s && (
        <>
          {/* STAT KARTLAR */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:20 }}>
            <Card title="BAKİYE (USD)" value={`$${fmt(s.balanceUsd)}`} sub={`${fmt(s.balanceUsd * (s.usdToTry||38), 0)} TL`} color="#22c55e"/>
            <Card title="GÜNLÜK PNL" value={`$${fmt(s.dailyPnlUsd)}`} sub={`${fmt(s.dailyPnlUsd*(s.usdToTry||38),0)} TL`} color={col(s.dailyPnlUsd)}/>
            <Card title="TOPLAM PNL" value={`$${fmt(s.totalPnlUsd)}`} sub={`${fmt(s.totalPnlUsd*(s.usdToTry||38),0)} TL`} color={col(s.totalPnlUsd)}/>
            <Card title="KAZANMA ORANI" value={`%${s.winRate ?? 0}`} sub={`${s.winCount}W / ${s.lossCount}L / ${s.totalTrades} işlem`} color="#8b5cf6"/>
            <Card title="AÇIK POZİSYON" value={s.openCount ?? 0} sub={s.isBlocked ? `🚫 ${s.blockReason}` : 'Max 2 pozisyon'} color={s.isBlocked ? '#ef4444' : '#f59e0b'}/>
            <Card title="KUR USD/TL" value={`₺${fmt(s.usdToTry,2)}`} color="#6366f1"/>
          </div>

          {/* MOTOR DURUMU */}
          <div style={{ background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:16, padding:'16px 20px', marginBottom:20, display:'flex', flexWrap:'wrap', gap:12, alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:11, color:'#64748b', fontWeight:800 }}>MOTOR DURUMU</div>
              <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                <Badge label={s.isRunning && !s.isBlocked ? '🟢 ÇALIŞIYOR' : s.isBlocked ? '🔴 BLOKE' : '⏹ DURDURULDU'} color={s.isBlocked ? '#ef4444' : '#22c55e'}/>
                {s.isBlocked && <div style={{ fontSize:12, color:'#f87171' }}>{s.blockReason}</div>}
              </div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>Kural: Trend(EMA50/200) + RSI + Haber | Stop-Loss %1 | Günlük Max Zarar %2</div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={manualBuy} style={{ padding:'8px 16px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', color:'#22c55e', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12 }}>MANUEL AL</button>
              <button onClick={manualSell} style={{ padding:'8px 16px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12 }}>MANUEL SAT</button>
              <button onClick={resetDemo} style={{ padding:'8px 16px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)', color:'#a5b4fc', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12 }}>💰 BAKİYE YÜKLE ($10k)</button>
            </div>
          </div>
        </>
      )}

      {tab === 'positions' && (
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:'#f1f5f9', marginBottom:12 }}>📈 AÇIK POZİSYONLAR ({s?.openCount ?? 0}/2)</div>
          {s?.positions?.length > 0
            ? s.positions.map(p => <PositionRow key={p.id} pos={p} onClose={closePos} usdToTry={s?.usdToTry||38} currentPrice={a?.price||0}/>)
            : <div style={{ padding:'40px', textAlign:'center', color:'#475569', border:'1px dashed rgba(255,255,255,0.06)', borderRadius:12 }}>Açık pozisyon yok — motor sinyal bekliyor</div>}
        </div>
      )}

      {tab === 'history' && (
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:'#f1f5f9', marginBottom:12 }}>📋 İŞLEM GEÇMİŞİ</div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                  {['YÖN','GİRİŞ','ÇIKIŞ','PNL (USD)','PNL (TL)','%','NEDEN','TARİH'].map(h => (
                    <th key={h} style={{ padding:'10px 12px', textAlign:'left', color:'#64748b', fontWeight:800, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s?.tradeHistory?.length > 0 ? s.tradeHistory.map((t,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding:'10px 12px' }}><Badge label={t.direction} color={COLORS[t.direction]}/></td>
                    <td style={{ padding:'10px 12px', color:'#f1f5f9' }}>${t.entryPrice?.toFixed(2)}</td>
                    <td style={{ padding:'10px 12px', color:'#f1f5f9' }}>${t.exitPrice?.toFixed(2)}</td>
                    <td style={{ padding:'10px 12px', color:col(t.pnlUsd), fontWeight:800 }}>{t.pnlUsd>=0?'+':''}{fmt(t.pnlUsd)}</td>
                    <td style={{ padding:'10px 12px', color:col(t.pnlTry), fontWeight:800 }}>{t.pnlTry>=0?'+':''}{fmt(t.pnlTry,0)} ₺</td>
                    <td style={{ padding:'10px 12px', color:col(t.pnlPct) }}>{t.pnlPct>=0?'+':''}{t.pnlPct?.toFixed(2)}%</td>
                    <td style={{ padding:'10px 12px', color:'#64748b', maxWidth:200, fontSize:11 }}>{t.reason}</td>
                    <td style={{ padding:'10px 12px', color:'#475569' }}>{t.closeAt ? new Date(t.closeAt).toLocaleTimeString('tr-TR') : '--'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} style={{ padding:'40px', textAlign:'center', color:'#475569' }}>Henüz kapatılmış işlem yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

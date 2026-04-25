import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Trash2, Bell, ExternalLink, Settings, LogOut, Package, TrendingDown, DollarSign, Loader2, HelpCircle, Clock, Mail } from 'lucide-react'
import XauUsd from './XauUsd'

const Dashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('products')
  const [products, setProducts] = useState([])
  const [newUrl, setNewUrl] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [notificationSettings, setNotificationSettings] = useState({ type: 'telegram', chat_id: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchProducts()
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get('/api/user/settings', { headers: { Authorization: `Bearer ${token}` } })
      if (res.data) {
        setNotificationSettings({
          type: res.data.notificationPref?.type || 'telegram',
          chat_id: res.data.telegramChatId || '',
          email: res.data.notificationEmail || '',
        })
      }
    } catch (_) {}
  }

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get('/api/products', { headers: { Authorization: `Bearer ${token}` } })
      setProducts(res.data)
    } catch (_) { setError('Ürünler yüklenemedi') }
  }

  const addProduct = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      await axios.post('/api/products', {
        url: newUrl,
        targetPrice: targetPrice ? Number(targetPrice) : null
      }, { headers: { Authorization: `Bearer ${token}` } })
      setNewUrl('')
      setTargetPrice('')
      fetchProducts()
    } catch (err) {
      setError(err.response?.data?.message || 'Eklenemedi')
    } finally { setLoading(false) }
  }

  const deleteProduct = async (id) => {
    if (!confirm('Bu ürünü takipten çıkarmak istediğine emin misin?')) return
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`/api/products/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      fetchProducts()
    } catch (_) { setError('Silinemedi') }
  }

  const updateSettings = async () => {
    setSettingsLoading(true)
    try {
      const token = localStorage.getItem('token')
      await axios.post('/api/settings', { notification: notificationSettings }, { headers: { Authorization: `Bearer ${token}` } })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } catch (_) { setError('Ayarlar kaydedilemedi') }
    finally { setSettingsLoading(false) }
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return '---'
    return new Date(dateStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }

  const showChatHelp = () => {
    alert("Chat ID Nasıl Alınır?\n\n1. Telegram'da @userinfobot'a gidin.\n2. /start gönderin.\n3. Gelen 'Id: XXXXXXX' numarasını kopyalayın.")
  }

  return (
    <div className="dashboard-container">
      {/* ── HEADER ── */}
      <header className="glass dashboard-header">
        {/* Brand */}
        <div className="header-brand">
          <div style={{ width: '40px', height: '40px', flexShrink: 0, background: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(99,102,241,0.3)' }}>
            <TrendingDown color="white" size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="header-brand-title" style={{ fontSize: '18px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Kontrol Paneli</h1>
            <p style={{ color: '#4ade80', fontSize: '11px', fontWeight: 700 }}>● {user?.name?.split(' ')[0] || 'Kullanıcı'}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="header-tabs">
          <button
            onClick={() => setActiveTab('products')}
            className="header-tab"
            style={{
              background: activeTab === 'products' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'products' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <Package size={14} />
            <span className="tab-text">Ürün Takip</span>
          </button>
          <button
            onClick={() => setActiveTab('xauusd')}
            className="header-tab"
            style={{
              background: activeTab === 'xauusd' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'transparent',
              color: activeTab === 'xauusd' ? '#1c1917' : 'var(--text-muted)',
            }}
          >
            🥇
            <span className="tab-text">XAUUSD</span>
          </button>
        </div>

        {/* Logout */}
        <button onClick={onLogout} className="header-logout">
          <LogOut size={16} />
          <span className="logout-text">Çıkış</span>
        </button>
      </header>

      {/* ── XAUUSD TAB ── */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {activeTab === 'xauusd' && <XauUsd />}
      </div>

      {/* ── PRODUCTS TAB ── */}
      {activeTab === 'products' && (
        <div className="dashboard-grid">
          {/* Main */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Add product card */}
            <div className="glass animate-entrance" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} color="var(--primary)" /> Yeni Ürün Ekle
              </h2>
              {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#f87171', fontSize: 13 }}>{error}</div>}
              <form onSubmit={addProduct} className="add-product-form">
                <input
                  type="url"
                  placeholder="Ürün Linki"
                  className="glass-input"
                  style={{ flex: 1, minWidth: '0' }}
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  required
                />
                <div className="target-input-wrapper">
                  <DollarSign style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={15} />
                  <input
                    type="number"
                    placeholder="Hedef TL"
                    className="glass-input"
                    style={{ paddingLeft: '32px' }}
                    value={targetPrice}
                    onChange={e => setTargetPrice(e.target.value)}
                  />
                </div>
                <button disabled={loading} type="submit" className="btn-primary add-btn">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Ekle'}
                </button>
              </form>
            </div>

            {/* Product list */}
            {products.length === 0 && !loading ? (
              <div className="empty-state-info animate-entrance">
                <Package size={40} color="var(--border)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Henüz ürün eklenmedi</h3>
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>Takip etmek istediğin ürünün linkini yapıştır!</p>
              </div>
            ) : (
              <div className="products-grid">
                {products.filter(p => p).map((p, i) => (
                  <div key={p.id || i} className="glass" style={{ padding: '18px', animation: `slideUpFade 0.5s ease-out ${i * 0.08}s forwards`, opacity: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div className="status-badge"><div className="status-dot"></div>Takipte</div>
                      <button
                        onClick={() => deleteProduct(p.id)}
                        style={{ padding: '6px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', opacity: 0.6, flexShrink: 0 }}
                        onMouseOver={e => e.currentTarget.style.opacity = 1}
                        onMouseOut={e => e.currentTarget.style.opacity = 0.6}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div style={{ marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {p.name || 'Bilinmeyen Ürün'}
                      </h3>
                      <a href={p.url || '#'} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {p.site?.toUpperCase() || 'SİTE'} <ExternalLink size={9} />
                      </a>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '3px' }}>MEVCUT</div>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: 'var(--primary)' }}>{p.currentPrice || '---'} TL</div>
                      </div>
                      <div style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '3px' }}>HEDEF</div>
                        <div style={{ fontWeight: '800', fontSize: '14px' }}>{p.targetPrice || '---'} TL</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#94a3b8', fontSize: '11px' }}>
                      <Clock size={11} /> {formatTime(p.lastCheck)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="glass animate-entrance sidebar-settings">
            <h2 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={18} color="var(--primary)" /> Bildirim Ayarları
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.08em' }}>BİLDİRİM TÜRÜ</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['telegram', 'email'].map(t => (
                    <button key={t} onClick={() => setNotificationSettings(p => ({ ...p, type: t }))}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                        background: notificationSettings.type === t ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                        color: notificationSettings.type === t ? '#fff' : 'var(--text-muted)',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}>
                      {t === 'telegram' ? '✈️ Telegram' : '📧 E-posta'}
                    </button>
                  ))}
                </div>
              </div>

              {notificationSettings.type === 'telegram' && (
                <div className="animate-entrance">
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.08em' }}>TELEGRAM CHAT ID</label>
                  <input type="text" className="glass-input" placeholder="Örn: 123456789"
                    value={notificationSettings.chat_id}
                    onChange={e => setNotificationSettings(p => ({ ...p, chat_id: e.target.value }))} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <p style={{ fontSize: '11px', color: '#94a3b8' }}>@userinfobot'tan alabilirsin</p>
                    <button onClick={showChatHelp} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                      <HelpCircle size={11} /> Nasıl alınır?
                    </button>
                  </div>
                </div>
              )}

              {notificationSettings.type === 'email' && (
                <div className="animate-entrance">
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.08em' }}>E-POSTA ADRESİ</label>
                  <input type="email" className="glass-input" placeholder="örn: sen@gmail.com"
                    value={notificationSettings.email}
                    onChange={e => setNotificationSettings(p => ({ ...p, email: e.target.value }))} />
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: 8 }}>Fiyat düşüşleri ve XAUUSD sinyalleri bu adrese gönderilir.</p>
                </div>
              )}

              <button disabled={settingsLoading} onClick={updateSettings} className="btn-primary" style={{ width: '100%', padding: '14px', marginTop: '4px' }}>
                {settingsLoading ? <Loader2 size={18} className="animate-spin" /> :
                 settingsSaved ? '✅ Yapılandırma Uygulandı' :
                 notificationSettings.type === 'email' ? <><Mail size={16} /> Kaydet &amp; Analiz Başlat</> : <><Bell size={16} /> Bildirimleri Aktifleştir</>}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default Dashboard

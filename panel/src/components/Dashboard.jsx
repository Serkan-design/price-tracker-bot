import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Trash2, Bell, ExternalLink, Settings, LogOut, Package, TrendingDown, DollarSign, Loader2, HelpCircle, Clock } from 'lucide-react'

const Dashboard = ({ user, onLogout }) => {
  const [products, setProducts] = useState([])
  const [newUrl, setNewUrl] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [notificationSettings, setNotificationSettings] = useState({ type: 'telegram', chat_id: '' })
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
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
          chat_id: res.data.telegramChatId || ''
        })
      }
    } catch (err) {
      console.error('Ayarlar yuklenemedi')
    }
  }

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get('/api/products', { headers: { Authorization: `Bearer ${token}` } })
      setProducts(res.data)
    } catch (err) {
      setError('Urunler yuklenirken hata olustu')
    }
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
      setError(err.response?.data?.message || 'Urun eklenemedi')
    } finally {
      setLoading(false)
    }
  }

  const deleteProduct = async (id) => {
    // Skip confirm in test mode or just use standard it's fine for user
    if (localStorage.getItem('test_mode') !== 'true') {
       if (!confirm('Bu ürünü takipten çıkarmak istediğine emin misin knk?')) return
    }
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`/api/products/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      fetchProducts()
    } catch (err) {
      setError('Urun silinemedi')
    }
  }

  const updateSettings = async () => {
    setSettingsLoading(true)
    try {
      const token = localStorage.getItem('token')
      await axios.post('/api/settings', { 
        notification: notificationSettings 
      }, { headers: { Authorization: `Bearer ${token}` } })
      alert('Tebrikler knk, ayarlar başarıyla kaydedildi! 🎉')
    } catch (err) {
      setError('Ayarlar kaydedilemedi')
    } finally {
      setSettingsLoading(false)
    }
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return '---'
    const d = new Date(dateStr)
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }

  const showChatHelp = () => {
    alert("Chat ID Nasıl Alınır?\n\n1. Telegram'da @userinfobot adresine gidin.\n2. /start komutunu gönderin.\n3. Size 'Id: 12345678' şeklinde bir mesaj verecek.\n4. O numarayı kopyalayıp buraya yapıştırın!\n\nKolay gelsin knk! 💪")
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="glass dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', background: 'var(--primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px rgba(99,102,241,0.3)' }}>
            <TrendingDown color="white" size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800' }}>Fiyat Paneli</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Merhaba, {user.name.split(' ')[0]}</p>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}>
          <LogOut size={18} /> Cikis
        </button>
      </header>

      {/* Grid Layout */}
      <div className="dashboard-grid">
        
        {/* Main Content (Products) */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Add Product Glass Card */}
          <div className="glass animate-entrance" style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Plus size={20} color="var(--primary)" /> Yeni Urun Takibi
            </h2>
            <form onSubmit={addProduct} className="add-product-form">
              <input
                type="url"
                placeholder="Trendyol / Amazon Linki"
                className="glass-input"
                style={{ flex: 1, minWidth: '180px' }}
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                required
              />
              <div className="target-input-wrapper">
                <DollarSign style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
                <input
                  type="number"
                  placeholder="Hedef"
                  className="glass-input"
                  style={{ paddingLeft: '32px' }}
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                />
              </div>
              <button disabled={loading} type="submit" className="btn-primary add-btn">
                {loading ? <Loader2 size={20} className="animate-spin" /> : 'Ekle'}
              </button>
            </form>
          </div>

          {/* Product Grid or Empty State */}
          {products.length === 0 && !loading ? (
            <div className="empty-state-info animate-entrance">
              <Package size={48} color="var(--border)" style={{ marginBottom: '20px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>Henüz ürün eklemedin 👇</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Takip etmek istediğin ürün linkini yukarıdaki kutuya yapıştır!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {products.map((p, i) => (
                <div key={p.id} className="glass" style={{ padding: '24px', animation: `slideUpFade 0.6s ease-out ${i * 0.1}s forwards`, opacity: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                    <div className="status-badge">
                      <div className="status-dot"></div>
                      Takip Ediliyor
                    </div>
                    <button onClick={() => deleteProduct(p.id)} style={{ padding: '8px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', opacity: 0.6 }} onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.6}>
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '6px', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {p.name || 'Ürün Yükleniyor...'}
                    </h3>
                    <a href={p.url} target="_blank" style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {p.site?.toUpperCase() || 'MAĞAZA'} <ExternalLink size={10} />
                    </a>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>MEVCUT</div>
                      <div style={{ fontWeight: '800', fontSize: '16px', color: 'var(--primary)' }}>{p.currentPrice || '---'} TL</div>
                    </div>
                    <div style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>HEDEF</div>
                      <div style={{ fontWeight: '800', fontSize: '16px' }}>{p.targetPrice || '---'} TL</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    <Clock size={12} /> Son Kontrol: {formatTime(p.lastCheck)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar (Settings) */}
        <aside className="glass animate-entrance sidebar-settings">
          <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={20} color="var(--primary)" /> Bildirim Ayarlari
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>KANAL SECIN</label>
              <select 
                className="glass-input"
                style={{ appearance: 'none', cursor: 'pointer' }}
                value={notificationSettings.type}
                onChange={(e) => setNotificationSettings({ ...notificationSettings, type: e.target.value })}
              >
                <option value="telegram">Telegram (Bot)</option>
                <option value="webpush">Browser Push</option>
              </select>
            </div>

            {notificationSettings.type === 'telegram' && (
              <div className="animate-entrance">
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>TELEGRAM CHAT ID</label>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="12345678"
                  value={notificationSettings.chat_id}
                  onChange={(e) => setNotificationSettings({ ...notificationSettings, chat_id: e.target.value })}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                   <p style={{ fontSize: '11px', color: '#64748b' }}>Örn: 1775328685</p>
                   <button onClick={showChatHelp} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                     <HelpCircle size={12} /> Chat ID nasıl alınır?
                   </button>
                </div>
              </div>
            )}
            
            {notificationSettings.type === 'webpush' && (
              <div className="animate-entrance" style={{ padding: '16px', background: 'rgba(99,102,241,0.05)', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '12px' }}>
                ℹ️ Browser push bildirimi için panelin sekmede açık kalması önerilir.
              </div>
            )}

            <button disabled={settingsLoading} onClick={updateSettings} className="btn-primary" style={{ width: '100%', padding: '14px', marginTop: '10px' }}>
              {settingsLoading ? <Loader2 size={18} className="animate-spin" /> : <><Bell size={18} /> Kaydet</>}
            </button>
          </div>
        </aside>

      </div>
    </div>
  )
}

export default Dashboard

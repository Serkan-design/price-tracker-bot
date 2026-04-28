import { useState, useEffect } from 'react'
import axios from 'axios'
import { User, Lock, Mail, ArrowRight, Sparkles } from 'lucide-react'

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fade, setFade] = useState(true) // For smooth transitions

  const toggleAuth = () => {
    setFade(false)
    setTimeout(() => {
      setIsLogin(!isLogin)
      setError('')
      setFade(true)
    }, 200)
  }

  const humanizeError = (msg) => {
    if (!msg) return "Bağlantı hatası: Sunucuya ulaşılamıyor.";
    if (typeof msg !== 'string') msg = JSON.stringify(msg);

    if (msg.includes("PERMISSION_DENIED")) {
      return "Sistem izni hatası. Lütfen yönetici panelinden Firestore API'yi etkinleştirin.";
    }
    if (msg.includes("NOT_FOUND") || msg.includes("5 NOT_FOUND")) {
      return "Veritabanı bağlantı hatası. Lütfen yönetici ile iletişime geçin.";
    }
    if (msg.includes("auth/invalid-email")) return "Geçersiz e-posta adresi.";
    if (msg.includes("auth/wrong-password")) return "Hatalı şifre.";
    if (msg.includes("Hatalı e-posta") || msg.includes("şifre")) return "E-posta veya şifre hatalı.";
    if (msg.includes("already exists") || msg.includes("zaten mevcut")) return "Bu hesap zaten kayıtlı.";
    
    return msg; // Show original message if no match
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    const url = isLogin ? '/api/login' : '/api/register'
    const payload = isLogin ? { email, password } : { email, password, name }

    try {
      const res = await axios.post(url, payload)
      if (isLogin) {
        onLogin(res.data.token, res.data.user)
      } else {
        setFade(false)
        setTimeout(() => {
          setIsLogin(true)
          setFade(true)
          setError('Kayit basarili! Lutfen simdi giris yapin.')
        }, 200)
      }
    } catch (err) {
      if (!err.response) {
        setError(humanizeError(null));
      } else {
        setError(humanizeError(err.response?.data?.message || 'Bir hata oluştu'));
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-center">
      <div className="glass auth-glass animate-entrance" style={{ padding: '32px 28px' }}>
        {/* Subtle Decorative Glow */}
        <div style={{ 
          position: 'absolute', 
          top: '-100px', 
          left: '-100px', 
          width: '200px', 
          height: '200px', 
          background: 'var(--primary)', 
          filter: 'blur(100px)', 
          opacity: 0.1,
          pointerEvents: 'none'
        }} />

        <div style={{ 
          opacity: fade ? 1 : 0, 
          transform: fade ? 'translateX(0)' : (isLogin ? 'translateX(-20px)' : 'translateX(20px)'),
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          textAlign: 'center'
        }}>
          <div className="center-all" style={{ 
            width: '72px', 
            height: '72px', 
            background: 'rgba(255,255,255,0.03)', 
            borderRadius: '20px', 
            margin: '0 auto 20px',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
          }}>
            <Sparkles style={{ color: 'var(--primary)' }} size={32} />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '900', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            {isLogin ? 'Hoş Geldiniz' : 'Hesap Oluştur'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px' }}>
            {isLogin ? 'Premium Fiyat Takip Deneyimi' : 'Kral Sistemine Katılın'}
          </p>

          {error && (
            <div className="animate-entrance" style={{ 
              marginBottom: '24px', 
              padding: '14px', 
              borderRadius: '14px', 
              fontSize: '13px', 
              lineHeight: '1.5',
              border: '1px solid',
              background: error.includes('başarılı') || error.includes('Kayit') ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
              borderColor: error.includes('başarılı') || error.includes('Kayit') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
              color: error.includes('başarılı') || error.includes('Kayit') ? '#4ade80' : '#f87171'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {!isLogin && (
              <div style={{ position: 'relative' }}>
                <User style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                <input
                  type="text"
                  placeholder="Ad Soyad"
                  className="glass-input"
                  style={{ paddingLeft: '48px' }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <Mail style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input
                type="email"
                placeholder="E-posta Adresi"
                className="glass-input"
                style={{ paddingLeft: '48px' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input
                type="password"
                placeholder="Sifreniz"
                className="glass-input"
                style={{ paddingLeft: '48px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ padding: '16px' }}
            >
              {loading ? 'Bağlanılıyor...' : (isLogin ? 'Giriş Yap' : 'Kaydı Tamamla')}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div style={{ marginTop: '36px' }}>
            <button 
              onClick={toggleAuth}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', opacity: 0.8, transition: 'opacity 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.opacity = 1}
              onMouseOut={(e) => e.currentTarget.style.opacity = 0.8}
            >
              {isLogin ? 'Hesabınız yok mu? Kayıt olun' : 'Zaten hesabınız var mı? Giriş yapın'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Auth

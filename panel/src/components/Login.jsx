import { useState } from 'react'
import axios from 'axios'
import { Lock, ShieldCheck, Mail } from 'lucide-react'

const Login = ({ onLogin }) => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post('/api/login', { password })
      onLogin(data.token)
    } catch (err) {
      setError(err.response?.data?.message || 'Giriş başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '1rem' }}>
      <div className="glass animate-in" style={{ padding: '2.5rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ background: 'var(--primary)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)' }}>
          <ShieldCheck size={32} color="white" />
        </div>
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Giriş Yap</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Fiyat Botu Yönetim Paneli</p>
        
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Admin Şifresi</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', paddingLeft: '40px' }}
                required
              />
            </div>
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}

          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: '0.8rem', 
              background: 'var(--primary)', 
              color: 'white', 
              borderRadius: '8px', 
              fontWeight: '600',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Giriş Yapılıyor...' : 'Panele Eriş'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login

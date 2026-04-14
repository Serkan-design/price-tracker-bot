import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null)
  const navigate = useNavigate()

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    navigate('/')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="app-container">
      <Routes>
        <Route 
          path="/login" 
          element={!user ? <Auth onLogin={handleLogin} /> : <Navigate to="/" />} 
        />
        <Route 
          path="/" 
          element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      {/* FIXED ASSETS AFTER CONTENT TO PREVENT FLOW SHIFT */}
      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="noise"></div>
    </div>
  )
}

export default App

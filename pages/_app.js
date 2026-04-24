import '../styles/globals.css'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500 text-sm">Chargement...</p>
      </div>
    </div>
  )

  return (
    <AuthContext.Provider value={{ user, supabase }}>
      {!user ? <LoginPage /> : <Component {...pageProps} />}
    </AuthContext.Provider>
  )
}

function LoginPage() {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMsg({ text: error.message, type: 'err' })
    setLoading(false)
  }

  async function handleRegister(e) {
    e.preventDefault()
    if (password !== password2) { setMsg({ text: 'Les mots de passe ne correspondent pas', type: 'err' }); return }
    if (password.length < 6) { setMsg({ text: 'Mot de passe minimum 6 caractères', type: 'err' }); return }
    setLoading(true); setMsg(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setMsg({ text: error.message, type: 'err' })
    else setMsg({ text: 'Compte créé ! Vérifiez votre email.', type: 'ok' })
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-700 to-brand-500 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-50 rounded-2xl mb-4">
            <span className="text-2xl">🏗️</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">DAR SADIK</h1>
          <p className="text-gray-500 text-sm mt-1">Selouane — Nador | Gestion Commerciale</p>
        </div>

        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {['login','register'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${tab===t ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500'}`}>
              {t==='login' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>

        <form onSubmit={tab==='login' ? handleLogin : handleRegister} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="votre@email.com" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>
          {tab==='register' && (
            <div>
              <label className="label">Confirmer</label>
              <input className="input" type="password" placeholder="••••••••" value={password2} onChange={e=>setPassword2(e.target.value)} required />
            </div>
          )}
          {msg && (
            <div className={`text-sm p-3 rounded-lg ${msg.type==='err' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 text-base">
            {loading ? 'Chargement...' : tab==='login' ? 'Se connecter' : 'Créer un compte'}
          </button>
        </form>
      </div>
    </div>
  )
}

import '../styles/globals.css'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const SUPER_ADMIN = 'abdelhafidbaadi@gmail.com'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) checkAccess(session.user)
      else { setUser(null); setLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) checkAccess(session.user)
      else { setUser(null); setAccessDenied(false); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function checkAccess(u) {
    // Super admin always allowed
    if (u.email === SUPER_ADMIN) {
      setUser(u); setAccessDenied(false); setLoading(false); return
    }
    // Check if email is in allowed_users table
    const { data } = await supabase
      .from('allowed_users')
      .select('id')
      .eq('email', u.email.toLowerCase())
      .single()
    if (data) {
      setUser(u); setAccessDenied(false)
    } else {
      setUser(null); setAccessDenied(true)
      await supabase.auth.signOut()
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f5f6fa'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:'48px',height:'48px',border:'4px solid #c5d8f5',borderTopColor:'#1a5fa8',borderRadius:'50%',animation:'spin .7s linear infinite',margin:'0 auto 16px'}}></div>
        <p style={{color:'#94a3b8',fontSize:'14px'}}>Chargement...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <AuthContext.Provider value={{ user, supabase }}>
      {!user ? <LoginPage accessDenied={accessDenied} /> : <Component {...pageProps} />}
    </AuthContext.Provider>
  )
}

function LoginPage({ accessDenied }) {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [msg, setMsg] = useState(accessDenied ? { text: '⛔ Accès refusé. Votre email n\'est pas autorisé. Contactez l\'administrateur.', type: 'err' } : null)
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

    // Check if email is allowed BEFORE creating account
    const { data: allowed } = await supabase
      .from('allowed_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (!allowed && email.toLowerCase() !== SUPER_ADMIN) {
      setMsg({ text: '⛔ Votre email n\'est pas autorisé. Contactez l\'administrateur.', type: 'err' })
      setLoading(false); return
    }

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setMsg({ text: error.message, type: 'err' })
    else setMsg({ text: '✅ Compte créé ! Vous pouvez maintenant vous connecter.', type: 'ok' })
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#071f3a 0%,#0d3d6e 50%,#1a5fa8 100%)',padding:'16px'}}>
      <div style={{background:'white',borderRadius:'24px',padding:'40px',width:'100%',maxWidth:'420px',boxShadow:'0 25px 60px rgba(0,0,0,0.3)'}}>
        <div style={{textAlign:'center',marginBottom:'28px'}}>
          <div style={{margin:'0 auto 14px',width:'72px',height:'72px'}}>
            <svg width="72" height="72" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="9" fill="#1a5fa8"/>
              <rect x="7"  y="10" width="11" height="6" rx="1" fill="white"/>
              <rect x="21" y="10" width="12" height="6" rx="1" fill="white"/>
              <rect x="7"  y="18" width="7"  height="6" rx="1" fill="#e8f0fb"/>
              <rect x="17" y="18" width="11" height="6" rx="1" fill="white"/>
              <rect x="31" y="18" width="2"  height="6" rx="1" fill="#e8f0fb"/>
              <rect x="7"  y="26" width="11" height="6" rx="1" fill="white"/>
              <rect x="21" y="26" width="12" height="6" rx="1" fill="white"/>
            </svg>
          </div>
          <h1 style={{fontSize:'24px',fontWeight:'900',color:'#0f172a',letterSpacing:'-0.5px'}}>DAR SADIK</h1>
          <p style={{fontSize:'12px',color:'#64748b',marginTop:'4px',letterSpacing:'0.03em'}}>Selouane — Nador &nbsp;|&nbsp; Gestion Commerciale</p>
        </div>

        <div style={{display:'flex',background:'#f1f5f9',borderRadius:'12px',padding:'4px',marginBottom:'24px'}}>
          {['login','register'].map((t,i) => (
            <button key={t} onClick={() => { setTab(t); setMsg(null) }}
              style={{flex:1,padding:'8px',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer',background:tab===t?'white':'none',color:tab===t?'#145090':'#64748b',boxShadow:tab===t?'0 1px 4px rgba(0,0,0,.1)':'none',transition:'.2s'}}>
              {t==='login'?'Connexion':'Inscription'}
            </button>
          ))}
        </div>

        <form onSubmit={tab==='login'?handleLogin:handleRegister}>
          <div style={{marginBottom:'16px'}}>
            <label style={{display:'block',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'.05em',color:'#64748b',marginBottom:'6px'}}>Email</label>
            <input style={{width:'100%',padding:'10px 12px',border:'1.5px solid #e2e8f0',borderRadius:'10px',fontSize:'14px',outline:'none',boxSizing:'border-box'}} type="email" placeholder="votre@email.com" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div style={{marginBottom:'16px'}}>
            <label style={{display:'block',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'.05em',color:'#64748b',marginBottom:'6px'}}>Mot de passe</label>
            <input style={{width:'100%',padding:'10px 12px',border:'1.5px solid #e2e8f0',borderRadius:'10px',fontSize:'14px',outline:'none',boxSizing:'border-box'}} type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>
          {tab==='register' && (
            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'.05em',color:'#64748b',marginBottom:'6px'}}>Confirmer</label>
              <input style={{width:'100%',padding:'10px 12px',border:'1.5px solid #e2e8f0',borderRadius:'10px',fontSize:'14px',outline:'none',boxSizing:'border-box'}} type="password" placeholder="••••••••" value={password2} onChange={e=>setPassword2(e.target.value)} required />
            </div>
          )}
          {msg && (
            <div style={{padding:'10px 14px',borderRadius:'8px',fontSize:'13px',marginBottom:'12px',background:msg.type==='err'?'#fef2f2':msg.type==='warn'?'#fffbeb':'#f0fdf4',color:msg.type==='err'?'#b91c1c':msg.type==='warn'?'#b45309':'#15803d'}}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{width:'100%',padding:'12px',background:'#1a5fa8',color:'white',border:'none',borderRadius:'12px',fontSize:'15px',fontWeight:'700',cursor:'pointer',opacity:loading?.5:1}}>
            {loading?'Chargement...':tab==='login'?'Se connecter':'Créer un compte'}
          </button>
        </form>

        <div style={{marginTop:'24px',paddingTop:'16px',borderTop:'1px solid #f1f5f9',textAlign:'center'}}>
          <p style={{fontSize:'11px',color:'#94a3b8',margin:0}}>
            Designed by <span style={{fontWeight:'700',color:'#475569'}}>Abdelhafid Baadi</span>
          </p>
        </div>
      </div>
    </div>
  )
}

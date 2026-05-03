import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../pages/_app'

const SUPER_ADMIN = 'abdelhafidbaadi@gmail.com'
const nav = [
  { href: '/',           icon: '▦',  label: 'Dashboard' },
  { href: '/ventes',     icon: '◈',  label: 'Ventes' },
  { href: '/clients',    icon: '◎',  label: 'Clients' },
  { href: '/paiements',  icon: '◇',  label: 'Paiements' },
  { href: '/gasoil',     icon: '◉',  label: 'Gasoil' },
  { href: '/grignon',    icon: '✦',  label: 'Grignon' },
  { href: '/parametres', icon: '⊞',  label: 'Paramètres' },
]

function DsLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="#ffffff" fillOpacity="0.06"/>
      <rect x="7"  y="10" width="11" height="6" rx="1" fill="white"/>
      <rect x="21" y="10" width="12" height="6" rx="1" fill="white"/>
      <rect x="7"  y="18" width="7"  height="6" rx="1" fill="white" fillOpacity="0.25"/>
      <rect x="17" y="18" width="11" height="6" rx="1" fill="white"/>
      <rect x="31" y="18" width="2"  height="6" rx="1" fill="white" fillOpacity="0.25"/>
      <rect x="7"  y="26" width="11" height="6" rx="1" fill="white"/>
      <rect x="21" y="26" width="12" height="6" rx="1" fill="white"/>
    </svg>
  )
}

export default function Layout({ children, title, subtitle }) {
  const router = useRouter()
  const { user, supabase } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { setMobileMenuOpen(false) }, [router.pathname])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen" style={{background:'#0a0a0a'}}>
        <header style={{background:'#111', borderBottom:'1px solid #1e1e1e'}}
          className="px-4 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <DsLogo size={32} />
            <div>
              <div style={{color:'#e0e0e0', fontWeight:700, fontSize:13, letterSpacing:'0.15em', textTransform:'uppercase'}}>Dar Sadik</div>
              {title && <div style={{color:'#444', fontSize:11}}>{title}</div>}
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-lg"
            style={{background:'#1a1a1a', border:'1px solid #2a2a2a', color:'#666'}}>
            <span style={{fontSize:13, fontFamily:'monospace'}}>{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40" style={{background:'rgba(0,0,0,0.9)'}}
            onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute top-0 right-0 h-full w-64 flex flex-col"
              style={{background:'#111', borderLeft:'1px solid #1e1e1e'}}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-5 py-5" style={{borderBottom:'1px solid #1a1a1a'}}>
                <DsLogo size={34} />
                <div>
                  <div style={{color:'#e0e0e0', fontWeight:700, fontSize:13, letterSpacing:'0.15em', textTransform:'uppercase'}}>Dar Sadik</div>
                  <div style={{color:'#333', fontSize:11}}>Selouane — Nador</div>
                </div>
              </div>
              <nav className="flex-1 py-4 space-y-0.5 px-3">
                {nav.map(item => {
                  const active = router.pathname === item.href
                  return (
                    <Link key={item.href} href={item.href}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all"
                      style={active ? {background:'#fff', color:'#000'} : {color:'#444'}}>
                      <span className="w-5 text-center" style={{fontSize:15}}>{item.icon}</span>
                      <span style={{letterSpacing:'0.05em', fontSize:13}}>{item.label}</span>
                    </Link>
                  )
                })}
                {user?.email === SUPER_ADMIN && (
                  <Link href="/admin"
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all"
                    style={router.pathname === '/admin' ? {background:'#fff', color:'#000'} : {color:'#a78b4a'}}>
                    <span className="w-5 text-center">★</span>
                    <span style={{letterSpacing:'0.05em', fontSize:13}}>Admin</span>
                  </Link>
                )}
              </nav>
              <div className="p-4" style={{borderTop:'1px solid #1a1a1a'}}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{background:'#1e1e1e', border:'1px solid #2e2e2e'}}>
                    <span style={{color:'#fff', fontSize:11, fontWeight:700}}>{user?.email?.[0]?.toUpperCase()}</span>
                  </div>
                  <div style={{color:'#555', fontSize:11, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{user?.email}</div>
                </div>
                <button onClick={logout} className="w-full py-2 rounded-lg transition-all"
                  style={{background:'#161616', border:'1px solid #222', color:'#555', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase'}}>
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-3 pb-24">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 z-30 flex"
          style={{background:'#111', borderTop:'1px solid #1e1e1e'}}>
          {nav.slice(0, 5).map(item => {
            const active = router.pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center justify-center py-2.5 transition-all"
                style={active ? {color:'#fff'} : {color:'#333'}}>
                <span style={{fontSize:18, marginBottom:2}}>{item.icon}</span>
                <span style={{fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase'}}>{item.label}</span>
                {active && <div style={{width:20, height:1, background:'#fff', marginTop:2, borderRadius:1}} />}
              </Link>
            )
          })}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{background:'#0a0a0a'}}>
      <aside className="flex flex-col flex-shrink-0 transition-all duration-200"
        style={{width: sidebarOpen ? 220 : 60, background:'#111', borderRight:'1px solid #1a1a1a'}}>
        <div className="flex items-center gap-3 px-4 py-5" style={{borderBottom:'1px solid #181818', minHeight:64}}>
          <DsLogo size={sidebarOpen ? 34 : 28} />
          {sidebarOpen && (
            <div>
              <div style={{color:'#e0e0e0', fontWeight:700, fontSize:12, letterSpacing:'0.18em', textTransform:'uppercase'}}>Dar Sadik</div>
              <div style={{color:'#2e2e2e', fontSize:10, marginTop:2}}>Selouane — Nador</div>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {nav.map(item => {
            const active = router.pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                title={!sidebarOpen ? item.label : undefined}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
                style={active
                  ? {background:'#ffffff', color:'#000000'}
                  : {color:'#3a3a3a'}}>
                <span className="flex-shrink-0 w-5 text-center" style={{fontSize:14}}>{item.icon}</span>
                {sidebarOpen && <span style={{fontSize:12, letterSpacing:'0.06em', fontWeight:500}}>{item.label}</span>}
              </Link>
            )
          })}
          {user?.email === SUPER_ADMIN && (
            <Link href="/admin"
              title={!sidebarOpen ? 'Admin' : undefined}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
              style={router.pathname === '/admin' ? {background:'#fff', color:'#000'} : {color:'#7a6030'}}>
              <span className="flex-shrink-0 w-5 text-center" style={{fontSize:14}}>★</span>
              {sidebarOpen && <span style={{fontSize:12, letterSpacing:'0.06em', fontWeight:500}}>Admin</span>}
            </Link>
          )}
        </nav>

        <div className="p-3" style={{borderTop:'1px solid #181818'}}>
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{background:'#1a1a1a', border:'1px solid #262626'}}>
                  <span style={{color:'#888', fontSize:10, fontWeight:700}}>{user?.email?.[0]?.toUpperCase()}</span>
                </div>
                <div style={{color:'#444', fontSize:11, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{user?.email}</div>
              </div>
              <button onClick={logout} className="w-full py-1.5 rounded-lg transition-all"
                style={{background:'#141414', border:'1px solid #1e1e1e', color:'#3a3a3a', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase'}}>
                Déconnexion
              </button>
              <div className="mt-3 text-center" style={{borderTop:'1px solid #181818', paddingTop:10}}>
                <div style={{color:'#222', fontSize:9, letterSpacing:'0.15em', textTransform:'uppercase'}}>Designed by</div>
                <div style={{color:'#2a2a2a', fontSize:10, fontWeight:600, letterSpacing:'0.1em'}}>Abdelhafid Baadi</div>
              </div>
            </>
          ) : (
            <button onClick={logout} className="w-full flex justify-center py-1" style={{color:'#2e2e2e'}}>↪</button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 flex-shrink-0"
          style={{height:56, background:'#0d0d0d', borderBottom:'1px solid #181818'}}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{color:'#2e2e2e'}} className="transition-colors hover:opacity-60">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <div>
              {title && <h1 style={{color:'#c0c0c0', fontWeight:700, fontSize:12, letterSpacing:'0.2em', textTransform:'uppercase'}}>{title}</h1>}
              {subtitle && <p style={{color:'#2e2e2e', fontSize:10, letterSpacing:'0.1em'}}>{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" style={{color:'#2e2e2e', fontSize:11}}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'#22c55e'}}/>
              En ligne
            </div>
            <div className="px-3 py-1.5 rounded-lg"
              style={{background:'#141414', border:'1px solid #1e1e1e', color:'#3a3a3a', fontSize:10, letterSpacing:'0.08em'}}>
              {new Date().toLocaleDateString('fr-MA', { weekday:'long', day:'numeric', month:'long' })}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6" style={{background:'#0a0a0a'}}>
          {children}
        </main>
      </div>
    </div>
  )
}

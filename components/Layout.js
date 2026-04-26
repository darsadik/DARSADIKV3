import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../pages/_app'

const SUPER_ADMIN = 'abdelhafidbaadi@gmail.com'
const nav = [
  { href: '/',            icon: '📊', label: 'Dashboard' },
  { href: '/ventes',      icon: '📦', label: 'Ventes' },
  { href: '/clients',     icon: '👥', label: 'Clients' },
  { href: '/paiements',   icon: '💰', label: 'Paiements' },
  { href: '/gasoil',      icon: '⛽', label: 'Gasoil' },
  { href: '/parametres',  icon: '⚙️', label: 'Paramètres' },
]

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

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false) }, [router.pathname])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // ── MOBILE LAYOUT ──────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">

        {/* MOBILE TOP BAR */}
        <header className="bg-brand-700 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-brand-700 font-black text-sm">DS</span>
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">DAR SADIK</div>
              {title && <div className="text-brand-200 text-xs leading-tight">{title}</div>}
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-brand-600 hover:bg-brand-500 transition-all"
          >
            <span className="text-lg">{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </header>

        {/* MOBILE DROPDOWN MENU */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute top-0 right-0 h-full w-64 bg-brand-700 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-5 border-b border-brand-600">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-brand-700 font-black text-sm">DS</span>
                </div>
                <div>
                  <div className="text-white font-bold text-sm">DAR SADIK</div>
                  <div className="text-brand-200 text-xs">Nador</div>
                </div>
              </div>

              <nav className="flex-1 py-4 space-y-1 px-2">
                {nav.map(item => {
                  const active = router.pathname === item.href
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all
                        ${active ? 'bg-white text-brand-700' : 'text-brand-100 hover:bg-brand-600 hover:text-white'}`}>
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
                {user?.email === SUPER_ADMIN && (
                  <Link href="/admin"
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all
                      ${router.pathname === '/admin' ? 'bg-white text-brand-700' : 'text-amber-300 hover:bg-brand-600 hover:text-white'}`}>
                    <span className="text-base">👑</span>
                    <span>Admin</span>
                  </Link>
                )}
              </nav>

              <div className="border-t border-brand-600 p-4 absolute bottom-0 w-full">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{user?.email?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-medium truncate">{user?.email}</div>
                  </div>
                </div>
                <button onClick={logout} className="w-full bg-brand-600 hover:bg-brand-500 text-white text-sm py-2 rounded-lg transition-all">
                  ↪ Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MOBILE CONTENT */}
        <main className="flex-1 p-3 pb-24">
          {children}
        </main>

        {/* MOBILE BOTTOM NAV */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-30 flex">
          {nav.slice(0, 5).map(item => {
            const active = router.pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-all
                  ${active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
                <span className="text-xl mb-0.5">{item.icon}</span>
                <span className="text-[10px] leading-tight">{item.label}</span>
                {active && <div className="absolute bottom-0 w-8 h-0.5 bg-brand-500 rounded-full" />}
              </Link>
            )
          })}
        </nav>
      </div>
    )
  }

  // ── DESKTOP LAYOUT (UNCHANGED) ──────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* SIDEBAR */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-brand-700 flex flex-col transition-all duration-200 flex-shrink-0`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-brand-600">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-brand-700 font-black text-sm">DS</span>
          </div>
          {sidebarOpen && (
            <div>
              <div className="text-white font-bold text-sm">DAR SADIK</div>
              <div className="text-brand-200 text-xs">Nador</div>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {nav.map(item => {
            const active = router.pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${active ? 'bg-white text-brand-700' : 'text-brand-100 hover:bg-brand-600 hover:text-white'}`}>
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            )
          })}
          {user?.email === SUPER_ADMIN && (
            <Link href="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${router.pathname === '/admin' ? 'bg-white text-brand-700' : 'text-amber-300 hover:bg-brand-600 hover:text-white'}`}>
              <span className="text-base flex-shrink-0">👑</span>
              {sidebarOpen && <span>Admin</span>}
            </Link>
          )}
        </nav>

        <div className="border-t border-brand-600 p-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{user?.email?.[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs font-medium truncate">{user?.email}</div>
                <button onClick={logout} className="text-brand-300 text-xs hover:text-white transition-colors">Déconnexion</button>
              </div>
            </div>
          ) : (
            <button onClick={logout} className="w-full flex justify-center text-brand-300 hover:text-white text-lg">↪</button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <div>
              {title && <h1 className="page-title">{title}</h1>}
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              En ligne
            </div>
            <div className="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">
              {new Date().toLocaleDateString('fr-MA', { weekday:'long', day:'numeric', month:'long' })}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

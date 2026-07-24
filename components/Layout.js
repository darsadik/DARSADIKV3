import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../pages/_app'

const SUPER_ADMIN = 'abdelhafidbaadi@gmail.com'

const nav = [
  { href: '/',                    icon: 'grid',    label: 'Dashboard' },
  { href: '/voyages',             icon: 'truck',   label: 'Voyages',          highlight: true },
  { href: '/rentabilite',         icon: 'trending',label: 'Rentabilité',      highlight: true },
  { href: '/achats',              icon: 'box',     label: 'Achats' },
  { href: '/livraisons',          icon: 'truck',   label: 'Livraisons' },
  { href: '/clients',             icon: 'users',   label: 'Clients Briques' },
  { href: '/clients/grignon',     icon: 'users',   label: 'Clients Grignon' },
  { href: '/fournisseurs',        icon: 'building',label: 'Fourn. Briques' },
  { href: '/fournisseurs/grignon',icon: 'building',label: 'Fourn. Grignon' },
  { href: '/paiements',           icon: 'card',    label: 'Paiements' },
  { href: '/retours',     icon: 'undo',       label: 'Retours' },
  { href: '/gasoil',      icon: 'droplet',    label: 'Gasoil' },
  { href: '/camions',     icon: 'activity',   label: 'Performance Camions' },
  { href: '/charges',     icon: 'dollar',     label: 'Charges' },
  { href: '/grignon',     icon: 'leaf',       label: 'Grignon' },
  { href: '/loueurs',     icon: 'key',        label: 'Loueurs' },
  { href: '/parametres',  icon: 'settings',   label: 'Paramètres' },
]

// ── DAR SADIK LOGO ──────────────────────────────────────────────────────
function DsLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="40" height="40" rx="9" fill="#2563eb"/>
      <rect x="7"  y="10" width="11" height="6" rx="1.5" fill="white"/>
      <rect x="21" y="10" width="12" height="6" rx="1.5" fill="white"/>
      <rect x="7"  y="18" width="7"  height="6" rx="1.5" fill="rgba(255,255,255,0.35)"/>
      <rect x="17" y="18" width="11" height="6" rx="1.5" fill="white"/>
      <rect x="31" y="18" width="2"  height="6" rx="1.5" fill="rgba(255,255,255,0.35)"/>
      <rect x="7"  y="26" width="11" height="6" rx="1.5" fill="white"/>
      <rect x="21" y="26" width="12" height="6" rx="1.5" fill="white"/>
    </svg>
  )
}

// ── SVG ICON SYSTEM ──────────────────────────────────────────────────────
function Icon({ name, size = 18 }) {
  const content = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </>
    ),
    truck: (
      <>
        <rect x="1" y="3" width="15" height="13"/>
        <path d="M16 8h4l3 3v5H16V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </>
    ),
    trending: (
      <>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/>
      </>
    ),
    box: (
      <>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </>
    ),
    users: (
      <>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </>
    ),
    card: (
      <>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </>
    ),
    undo: (
      <>
        <polyline points="9 14 4 9 9 4"/>
        <path d="M20 20v-7a4 4 0 00-4-4H4"/>
      </>
    ),
    droplet: (
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
    ),
    activity: (
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    ),
    dollar: (
      <>
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </>
    ),
    leaf: (
      <>
        <path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5z"/>
        <line x1="16" y1="6" x2="2" y2="22"/>
        <line x1="17.5" y1="15" x2="9" y2="15"/>
      </>
    ),
    key: (
      <>
        <circle cx="7.5" cy="15.5" r="5.5"/>
        <path d="M21 2l-9.6 9.6"/>
        <path d="M15.5 7.5l3 3L22 7l-3-3"/>
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </>
    ),
    star: (
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    ),
    menu: (
      <>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </>
    ),
    x: (
      <>
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </>
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {content[name] || null}
    </svg>
  )
}

// ── AVATAR ───────────────────────────────────────────────────────────────
function Avatar({ email, size = 28 }) {
  const letter = email?.[0]?.toUpperCase() || '?'
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ color: 'white', fontSize: size * 0.38, fontWeight: 700 }}>{letter}</span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
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

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: '#f8fafc' }}>

        {/* TOP BAR */}
        <header
          className="text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50"
          style={{ background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2.5">
            <DsLogo size={30} />
            <div>
              <div className="font-bold text-sm leading-tight tracking-wide text-white">DAR SADIK</div>
              {title && <div className="text-slate-400 text-[11px] leading-tight">{title}</div>}
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all text-slate-300"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <Icon name={mobileMenuOpen ? 'x' : 'menu'} size={18} />
          </button>
        </header>

        {/* SLIDE-IN DRAWER */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setMobileMenuOpen(false)}>
            <div
              className="absolute top-0 right-0 h-full w-64 flex flex-col"
              style={{ background: '#0f172a' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer header */}
              <div className="flex items-center gap-3 px-4 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <DsLogo size={34} />
                <div>
                  <div className="text-white font-bold text-sm tracking-wide">DAR SADIK</div>
                  <div className="text-slate-500 text-xs">Selouane — Nador</div>
                </div>
              </div>

              {/* Nav */}
              <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
                {nav.map(item => {
                  const active = router.pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
                      style={{
                        color: active ? 'white' : '#94a3b8',
                        background: active ? '#2563eb' : 'transparent',
                      }}
                    >
                      <Icon name={item.icon} size={17} />
                      <span className="flex-1">{item.label}</span>
                      {item.highlight && !active && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                      )}
                    </Link>
                  )
                })}
                {user?.email === SUPER_ADMIN && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
                    style={{
                      color: router.pathname === '/admin' ? 'white' : '#fbbf24',
                      background: router.pathname === '/admin' ? '#2563eb' : 'transparent',
                    }}
                  >
                    <Icon name="star" size={17} />
                    <span>Admin</span>
                  </Link>
                )}
              </nav>

              {/* Contact info */}
              <div className="mx-3 mb-2 px-3 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>Contact</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: '#64748b' }}>Mohamed</span>
                    <span className="text-[11px] font-bold" style={{ color: '#93c5fd' }}>06 61 32 56 65</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: '#64748b' }}>Sadik</span>
                    <span className="text-[11px] font-bold" style={{ color: '#93c5fd' }}>06 61 97 87 47</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: '#64748b' }}>Bureau</span>
                    <span className="text-[11px] font-bold" style={{ color: '#93c5fd' }}>06 62 82 88 20</span>
                  </div>
                  <div className="pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-[10px]" style={{ color: '#475569' }}>✉️ Dar.sadik@hotmail.com</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#475569' }}>📍 Selouane - Nador</div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar email={user?.email} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-300 text-xs font-medium truncate">{user?.email}</div>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="w-full text-sm py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}
                >
                  <Icon name="logout" size={14} />
                  Déconnexion
                </button>
                <div className="mt-3 pt-3 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-slate-700 text-[10px]">Designed by</div>
                  <div className="text-slate-500 text-[11px] font-semibold">Abdelhafid Baadi</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE CONTENT */}
        <main className="flex-1 p-3 pb-24">{children}</main>

        {/* BOTTOM NAV */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-30 flex" style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }}>
          {nav.filter(i => ['/', '/voyages', '/rentabilite', '/clients'].includes(i.href)).map(item => {
            const active = router.pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center py-2.5 relative transition-all"
                style={{ color: active ? '#2563eb' : '#94a3b8' }}
              >
                <Icon name={item.icon} size={20} />
                <span className="text-[10px] font-medium mt-1 leading-tight">{item.label}</span>
                {active && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full"
                    style={{ width: 24, height: 2, background: '#2563eb' }}
                  />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    )
  }

  // ── DESKTOP LAYOUT ───────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8fafc' }}>

      {/* SIDEBAR */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-[68px]'} flex flex-col transition-all duration-200 ease-in-out flex-shrink-0 overflow-hidden`}
        style={{ background: '#0f172a' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 py-[18px] flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <DsLogo size={sidebarOpen ? 34 : 30} />
          {sidebarOpen && (
            <div>
              <div className="text-white font-bold text-sm tracking-wide leading-tight">DAR SADIK</div>
              <div className="text-slate-500 text-[11px] leading-tight mt-0.5">Selouane — Nador</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {nav.map(item => {
            const active = router.pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!sidebarOpen ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${!sidebarOpen ? 'justify-center' : ''}`}
                style={{
                  color: active ? 'white' : '#64748b',
                  background: active ? '#2563eb' : 'transparent',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' } }}
              >
                <Icon name={item.icon} size={17} />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 tracking-wide">{item.label}</span>
                    {item.highlight && !active && (
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                    )}
                  </>
                )}
              </Link>
            )
          })}

          {user?.email === SUPER_ADMIN && (
            <Link
              href="/admin"
              title={!sidebarOpen ? 'Admin' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${!sidebarOpen ? 'justify-center' : ''}`}
              style={{
                color: router.pathname === '/admin' ? 'white' : '#fbbf24',
                background: router.pathname === '/admin' ? '#2563eb' : 'transparent',
              }}
              onMouseEnter={e => { if (router.pathname !== '/admin') { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' } }}
              onMouseLeave={e => { if (router.pathname !== '/admin') { e.currentTarget.style.background = 'transparent' } }}
            >
              <Icon name="star" size={17} />
              {sidebarOpen && <span>Admin</span>}
            </Link>
          )}
        </nav>

        {/* User / Logout */}
        <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2.5 px-1 py-1">
                <Avatar email={user?.email} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-300 text-[11px] font-medium truncate">{user?.email}</div>
                  <button
                    onClick={logout}
                    className="text-[11px] transition-colors flex items-center gap-1 mt-0.5"
                    style={{ color: '#475569' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#475569' }}
                  >
                    <Icon name="logout" size={10} />
                    Déconnexion
                  </button>
                </div>
              </div>
              <div className="px-1 mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[10px]" style={{ color: '#334155' }}>Designed by</div>
                <div className="text-[11px] font-semibold" style={{ color: '#475569' }}>Abdelhafid Baadi</div>
              </div>
            </>
          ) : (
            <button
              onClick={logout}
              className="w-full flex justify-center p-2 rounded-lg transition-all"
              title="Déconnexion"
              style={{ color: '#475569' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#94a3b8' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569' }}
            >
              <Icon name="logout" size={17} />
            </button>
          )}
        </div>
      </aside>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* HEADER */}
        <header
          className="bg-white px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg transition-all"
              style={{ color: '#94a3b8' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#475569' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
            >
              <Icon name="menu" size={19} />
            </button>
            <div>
              {title    && <h1 className="page-title">{title}</h1>}
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">

            {/* Company contact — visible on large screens only */}
            <div className="hidden lg:flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-2.5 text-[11px] font-medium" style={{ color: '#64748b' }}>
                <span>📞 Mohamed&nbsp;<strong style={{ color: '#1d4ed8', fontWeight: 700 }}>06 61 32 56 65</strong></span>
                <span style={{ color: '#e2e8f0' }}>·</span>
                <span>Sadik&nbsp;<strong style={{ color: '#1d4ed8', fontWeight: 700 }}>06 61 97 87 47</strong></span>
                <span style={{ color: '#e2e8f0' }}>·</span>
                <span>Bureau&nbsp;<strong style={{ color: '#1d4ed8', fontWeight: 700 }}>06 62 82 88 20</strong></span>
              </div>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: '#94a3b8' }}>
                <span>✉️ Dar.sadik@hotmail.com</span>
                <span style={{ color: '#e2e8f0' }}>·</span>
                <span>📍 Selouane - Nador</span>
              </div>
            </div>

            <div className="hidden lg:block w-px h-7" style={{ background: '#f1f5f9' }} />

            <div className="flex items-center gap-2.5">
              <div
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
                style={{ background: '#f0fdf4', color: '#16a34a' }}
              >
                <span
                  className="rounded-full animate-pulse"
                  style={{ width: 6, height: 6, background: '#4ade80', display: 'inline-block' }}
                />
                En ligne
              </div>
              <div
                className="text-[11px] font-medium px-3 py-1.5 rounded-lg"
                style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #f1f5f9' }}
              >
                {new Date().toLocaleDateString('fr-MA', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>

          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

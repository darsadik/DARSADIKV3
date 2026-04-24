import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import Link from 'next/link'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD = n => parseFloat(n || 0).toFixed(2)

function StatCard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    green:  'bg-green-50 text-green-600 border-green-100',
    red:    'bg-red-50 text-red-600 border-red-100',
    amber:  'bg-amber-50 text-amber-600 border-amber-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  }
  const valColors = {
    blue: 'text-blue-700', green: 'text-green-700', red: 'text-red-700', amber: 'text-amber-700', purple: 'text-purple-700'
  }
  return (
    <div className={`stat-card border ${colors[color]}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="stat-label text-current opacity-70">{label}</div>
        <span className="text-xl">{icon}</span>
      </div>
      <div className={`stat-value ${valColors[color]}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const uid = user?.id
    const [
      { data: clients },
      { data: ventes },
      { data: gasoil },
      { data: paiements },
      { data: recentOps },
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', uid),
      supabase.from('ventes').select('*').eq('user_id', uid),
      supabase.from('gasoil').select('*').eq('user_id', uid),
      supabase.from('paiements').select('*').eq('user_id', uid),
      supabase.from('ventes').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(8),
    ])

    const totalCreances = (clients || []).reduce((s, c) => s + (c.solde || 0), 0)
    const totalVentes = (ventes || []).reduce((s, v) => s + (v.total_vente || 0), 0)
    const totalGasoil = (gasoil || []).reduce((s, g) => s + (g.total || 0), 0)
    const totalMarge = (ventes || []).reduce((s, v) => s + (v.marge || 0), 0)
    const totalPaiements = (paiements || []).reduce((s, p) => s + (p.montant || 0), 0)

    // By fournisseur
    const byFourn = {}
    ;(ventes || []).forEach(v => {
      if (!byFourn[v.fournisseur]) byFourn[v.fournisseur] = { qte: 0, vente: 0, marge: 0 }
      byFourn[v.fournisseur].qte += v.qte || 0
      byFourn[v.fournisseur].vente += v.total_vente || 0
      byFourn[v.fournisseur].marge += v.marge || 0
    })

    // By camion
    const byCamion = {}
    ;(ventes || []).forEach(v => {
      if (!byCamion[v.camion_plaque]) byCamion[v.camion_plaque] = { qte: 0, vente: 0, voyages: 0 }
      byCamion[v.camion_plaque].qte += v.qte || 0
      byCamion[v.camion_plaque].vente += v.total_vente || 0
      byCamion[v.camion_plaque].voyages += 1
    })

    // Top clients by solde
    const topClients = (clients || []).filter(c => (c.solde || 0) > 0).sort((a, b) => (b.solde || 0) - (a.solde || 0)).slice(0, 6)

    setData({ totalCreances, totalVentes, totalGasoil, totalMarge, totalPaiements, byFourn, byCamion, topClients, recentOps: recentOps || [], clients: clients || [] })
    setLoading(false)
  }

  const urgentClients = data?.clients?.filter(c => (c.solde || 0) >= 100000) || []

  return (
    <Layout title="Dashboard" subtitle="Vue d'ensemble de votre activité">
      {urgentClients.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
          <div>
            <div className="font-semibold text-red-700 text-sm">Soldes urgents — {urgentClients.length} client(s) ≥ 100 000 DHS</div>
            <div className="text-red-600 text-xs mt-1">{urgentClients.map(c => c.nom).join(' • ')}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <StatCard label="Créances totales" value={fmt(data.totalCreances)+' DHS'} sub="Dus par clients" color="red" icon="📋"/>
            <StatCard label="Total ventes" value={fmt(data.totalVentes)+' DHS'} sub="Enregistrées" color="blue" icon="📦"/>
            <StatCard label="Marge brute" value={fmt(data.totalMarge)+' DHS'} sub={data.totalVentes > 0 ? Math.round(data.totalMarge/data.totalVentes*100)+'%' : '0%'} color="green" icon="📈"/>
            <StatCard label="Total gasoil" value={fmt(data.totalGasoil)+' DHS'} sub="Consommé" color="amber" icon="⛽"/>
            <StatCard label="Marge nette" value={fmt(data.totalMarge - data.totalGasoil)+' DHS'} sub="Marge − Gasoil" color="purple" icon="💎"/>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* TOP CLIENTS */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">👥 Clients — Soldes</h2>
                <Link href="/clients" className="text-xs text-brand-500 hover:underline">Voir tout →</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Client</th>
                      <th className="th">Dépôt</th>
                      <th className="th text-right">Solde DHS</th>
                      <th className="th">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topClients.map(c => {
                      const s = c.solde || 0
                      const badge = s >= 100000 ? 'badge-red' : s >= 30000 ? 'badge-amber' : 'badge-blue'
                      const label = s >= 100000 ? 'Urgent' : s >= 30000 ? 'Attention' : 'En cours'
                      return (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                          <td className="td font-semibold text-gray-900">{c.nom}</td>
                          <td className="td text-gray-500">{c.depot}</td>
                          <td className="td text-right font-bold text-gray-900">{fmt(s)}</td>
                          <td className="td"><span className={badge}>{label}</span></td>
                        </tr>
                      )
                    })}
                    {data.topClients.length === 0 && (
                      <tr><td colSpan={4} className="td text-center text-gray-400 py-6">Aucun client avec solde</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RECENT VENTES */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">📦 Dernières ventes</h2>
                <Link href="/ventes" className="text-xs text-brand-500 hover:underline">Voir tout →</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Client</th>
                      <th className="th">Type</th>
                      <th className="th text-right">Vente DHS</th>
                      <th className="th text-right">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOps.map(v => (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="td text-gray-500">{v.date}</td>
                        <td className="td font-medium text-gray-900 max-w-[120px] truncate">{v.client_nom}</td>
                        <td className="td"><span className="badge-blue">{v.type_brique}</span></td>
                        <td className="td text-right font-semibold">{fmt(v.total_vente)}</td>
                        <td className="td text-right font-semibold text-green-600">{fmt(v.marge)}</td>
                      </tr>
                    ))}
                    {data.recentOps.length === 0 && (
                      <tr><td colSpan={5} className="td text-center text-gray-400 py-6">Aucune vente enregistrée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* BY FOURNISSEUR */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">📦 Par fournisseur</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Fournisseur</th>
                      <th className="th text-right">Quantité</th>
                      <th className="th text-right">Vente DHS</th>
                      <th className="th text-right">Marge DHS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.byFourn).sort((a, b) => b[1].vente - a[1].vente).map(([fourn, d]) => (
                      <tr key={fourn} className="hover:bg-gray-50">
                        <td className="td font-semibold text-gray-900">{fourn || '—'}</td>
                        <td className="td text-right">{fmt(d.qte)}</td>
                        <td className="td text-right font-semibold">{fmt(d.vente)}</td>
                        <td className="td text-right font-semibold text-green-600">{fmt(d.marge)}</td>
                      </tr>
                    ))}
                    {Object.keys(data.byFourn).length === 0 && (
                      <tr><td colSpan={4} className="td text-center text-gray-400 py-6">Aucune donnée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* BY CAMION */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">🚛 Par camion</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Camion</th>
                      <th className="th text-right">Briques</th>
                      <th className="th text-right">Voyages</th>
                      <th className="th text-right">Vente DHS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.byCamion).sort((a, b) => b[1].qte - a[1].qte).slice(0, 8).map(([plaque, d]) => (
                      <tr key={plaque} className="hover:bg-gray-50">
                        <td className="td font-semibold text-gray-900">{plaque}</td>
                        <td className="td text-right">{fmt(d.qte)}</td>
                        <td className="td text-right">{d.voyages}</td>
                        <td className="td text-right font-semibold">{fmt(d.vente)}</td>
                      </tr>
                    ))}
                    {Object.keys(data.byCamion).length === 0 && (
                      <tr><td colSpan={4} className="td text-center text-gray-400 py-6">Aucune donnée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}

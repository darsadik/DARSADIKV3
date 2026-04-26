import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD = n => parseFloat(n || 0).toFixed(2)
const today = () => new Date().toISOString().split('T')[0]

export default function Gasoil() {
  const { user } = useAuth()
  const [camions, setCamions] = useState([])
  const [gasoil, setGasoil] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCamion, setFilterCamion] = useState('')
  const [form, setForm] = useState({
    date: today(), camion_id: '', station: 'HMIDA ZAIO — Station Petrom',
    qte: '', prix_unitaire: '12.40', bon: '', km: '', note: ''
  })

  const qte = parseFloat(form.qte) || 0
  const pu = parseFloat(form.prix_unitaire) || 0
  const total = Math.round(qte * pu * 100) / 100

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: ga }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('gasoil').select('*').order('date', { ascending: false }),
    ])
    setCamions(ca || [])
    setGasoil(ga || [])
    setLoading(false)
  }

  async function saveGasoil(e) {
    e.preventDefault()
    if (!form.camion_id || !qte || !pu) return
    setSaving(true)
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    const rec = {
      date: form.date,
      camion_id: parseInt(form.camion_id),
      camion_plaque: camion?.plaque || '',
      chauffeur: camion?.chauffeur || '',
      station: form.station,
      qte, prix_unitaire: pu, total,
      bon: form.bon,
      km: parseFloat(form.km) || null,
      note: form.note,
      
    }
    await supabase.from('gasoil').insert(rec)
    if (camion) {
      await supabase.from('camions').update({
        gasoil_dhs: (camion.gasoil_dhs || 0) + total,
        pleins: (camion.pleins || 0) + 1,
        litres: (camion.litres || 0) + qte,
      }).eq('id', camion.id)
    }
    setSaving(false)
    setForm({ date: today(), camion_id: '', station: 'HMIDA ZAIO — Station Petrom', qte: '', prix_unitaire: '12.40', bon: '', km: '', note: '' })
    loadAll()
  }

  async function deleteGasoil(id, camionId, total, qte) {
    if (!confirm('Supprimer ce plein ?')) return
    const camion = camions.find(c => c.id === camionId)
    await supabase.from('gasoil').delete().eq('id', id)
    if (camion) {
      await supabase.from('camions').update({
        gasoil_dhs: Math.max(0, (camion.gasoil_dhs || 0) - total),
        pleins: Math.max(0, (camion.pleins || 0) - 1),
        litres: Math.max(0, (camion.litres || 0) - qte),
      }).eq('id', camion.id)
    }
    loadAll()
  }

  const filtered = gasoil.filter(g => {
    if (filterCamion && g.camion_id !== parseInt(filterCamion)) return false
    if (search && !(g.camion_plaque + g.station + (g.chauffeur || '')).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totLitres = filtered.reduce((s, g) => s + (g.qte || 0), 0)
  const totDHS = filtered.reduce((s, g) => s + (g.total || 0), 0)

  // Stats by camion
  const byCamion = {}
  gasoil.forEach(g => {
    if (!byCamion[g.camion_plaque]) byCamion[g.camion_plaque] = { litres: 0, total: 0, pleins: 0 }
    byCamion[g.camion_plaque].litres += g.qte || 0
    byCamion[g.camion_plaque].total += g.total || 0
    byCamion[g.camion_plaque].pleins += 1
  })

  return (
    <Layout title="Gasoil" subtitle="Suivi de consommation et coûts carburant">

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card border border-amber-100 bg-amber-50">
          <div className="stat-label text-amber-600">Total gasoil</div>
          <div className="stat-value text-amber-700">{fmt(gasoil.reduce((s,g)=>s+(g.total||0),0))} DHS</div>
          <div className="stat-sub">Toutes périodes</div>
        </div>
        <div className="stat-card border border-blue-100 bg-blue-50">
          <div className="stat-label text-blue-600">Total litres</div>
          <div className="stat-value text-blue-700">{fmt(gasoil.reduce((s,g)=>s+(g.qte||0),0))} L</div>
          <div className="stat-sub">Consommés</div>
        </div>
        <div className="stat-card border border-gray-100">
          <div className="stat-label">Nombre de pleins</div>
          <div className="stat-value text-gray-700">{gasoil.length}</div>
          <div className="stat-sub">Enregistrés</div>
        </div>
        <div className="stat-card border border-green-100 bg-green-50">
          <div className="stat-label text-green-600">Prix moyen/L</div>
          <div className="stat-value text-green-700">
            {gasoil.length > 0 ? fmtD(gasoil.reduce((s,g)=>s+(g.total||0),0) / gasoil.reduce((s,g)=>s+(g.qte||0),0)) : '0.00'} DHS
          </div>
          <div className="stat-sub">Moyenne</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* FORM */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">⛽ Nouveau plein</h2>
            <form onSubmit={saveGasoil} className="space-y-3">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
              </div>
              <div>
                <label className="label">Camion</label>
                <select className="input" value={form.camion_id} onChange={e => setForm({...form, camion_id: e.target.value})} required>
                  <option value="">Sélectionner...</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Station</label>
                <select className="input" value={form.station} onChange={e => setForm({...form, station: e.target.value})}>
                  <option>HMIDA ZAIO — Station Petrom</option>
                  <option>Autre station</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Litres</label>
                  <input className="input" type="number" placeholder="300" value={form.qte} onChange={e => setForm({...form, qte: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Prix/L (DHS)</label>
                  <input className="input" type="number" step="0.01" value={form.prix_unitaire} onChange={e => setForm({...form, prix_unitaire: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">BON N°</label>
                  <input className="input" placeholder="ex: 14650" value={form.bon} onChange={e => setForm({...form, bon: e.target.value})} />
                </div>
                <div>
                  <label className="label">KM compteur</label>
                  <input className="input" type="number" placeholder="ex: 85000" value={form.km} onChange={e => setForm({...form, km: e.target.value})} />
                </div>
              </div>

              {qte > 0 && pu > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                  <div className="text-xs text-amber-600 mb-1">Total à payer</div>
                  <div className="text-2xl font-bold text-amber-700">{fmtD(total)} DHS</div>
                  <div className="text-xs text-amber-500">{fmtD(qte)} L × {fmtD(pu)} DHS/L</div>
                </div>
              )}

              <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
                {saving ? 'Enregistrement...' : '✓ Enregistrer le plein'}
              </button>
            </form>
          </div>

          {/* BY CAMION STATS */}
          <div className="card mt-4">
            <h3 className="font-semibold text-gray-900 mb-3">🚛 Consommation par camion</h3>
            <div className="space-y-3">
              {Object.entries(byCamion).sort((a,b) => b[1].total - a[1].total).map(([plaque, d]) => (
                <div key={plaque} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{plaque}</div>
                    <div className="text-xs text-gray-400">{d.pleins} pleins · {fmt(d.litres)} L</div>
                  </div>
                  <div className="text-sm font-bold text-amber-600">{fmt(d.total)} DHS</div>
                </div>
              ))}
              {Object.keys(byCamion).length === 0 && (
                <div className="text-center text-gray-400 text-sm py-4">Aucune donnée</div>
              )}
            </div>
          </div>
        </div>

        {/* HISTORY */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-semibold text-gray-900">
                Historique gasoil
                <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length} entrées)</span>
              </h2>
              <div className="flex gap-2 flex-wrap">
                <input className="input w-40" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
                <select className="input w-44" value={filterCamion} onChange={e => setFilterCamion(e.target.value)}>
                  <option value="">Tous les camions</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}</option>)}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-gray-400 py-10">Chargement...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Camion</th>
                      <th className="th">Chauffeur</th>
                      <th className="th">Station</th>
                      <th className="th text-right">Litres</th>
                      <th className="th text-right">Prix/L</th>
                      <th className="th text-right">Total DHS</th>
                      <th className="th text-right">KM</th>
                      <th className="th">BON</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(g => (
                      <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                        <td className="td text-gray-500">{g.date}</td>
                        <td className="td font-semibold text-gray-900">{g.camion_plaque}</td>
                        <td className="td text-gray-500">{g.chauffeur || '—'}</td>
                        <td className="td text-xs text-gray-500">{g.station}</td>
                        <td className="td text-right font-medium">{fmtD(g.qte)}</td>
                        <td className="td text-right text-gray-500">{fmtD(g.prix_unitaire)}</td>
                        <td className="td text-right font-bold text-amber-600">{fmtD(g.total)}</td>
                        <td className="td text-right text-gray-400 text-xs">{g.km ? fmt(g.km) : '—'}</td>
                        <td className="td text-gray-400 text-xs">{g.bon || '—'}</td>
                        <td className="td">
                          <button className="btn-danger" onClick={() => deleteGasoil(g.id, g.camion_id, g.total, g.qte)}>✕</button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={10} className="td text-center text-gray-400 py-10">Aucune entrée trouvée</td></tr>
                    )}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot>
                      <tr>
                        <td className="tfoot-td" colSpan={4}>TOTAL</td>
                        <td className="tfoot-td text-right">{fmtD(totLitres)} L</td>
                        <td className="tfoot-td"></td>
                        <td className="tfoot-td text-right text-amber-700">{fmt(totDHS)} DHS</td>
                        <td className="tfoot-td" colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

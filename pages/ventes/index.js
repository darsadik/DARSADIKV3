import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD = n => parseFloat(n || 0).toFixed(2)
const today = () => new Date().toISOString().split('T')[0]

export default function Ventes() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [camions, setCamions] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [typeBriques, setTypeBriques] = useState([])
  const [ventes, setVentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterFourn, setFilterFourn] = useState('')
  const [showForm, setShowForm] = useState(true)

  const [form, setForm] = useState({
    date: today(), client_id: '', camion_id: '', fournisseur_id: '',
    type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', bon: '', note: ''
  })

  const qte = parseFloat(form.qte) || 0
  const pv = parseFloat(form.prix_vente) || 0
  const pa = parseFloat(form.prix_achat) || 0
  const totalVente = Math.round(qte * pv * 100) / 100
  const totalAchat = Math.round(qte * pa * 100) / 100
  const marge = Math.round(qte * (pv - pa) * 100) / 100

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const uid = user?.id
    const [
      { data: cl }, { data: ca }, { data: fo }, { data: ty }, { data: ve }
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', uid).order('nom'),
      supabase.from('camions').select('*').eq('user_id', uid).order('plaque'),
      supabase.from('fournisseurs').select('*').eq('user_id', uid).order('nom'),
      supabase.from('type_briques').select('*').eq('user_id', uid).order('nom'),
      supabase.from('ventes').select('*').eq('user_id', uid).order('date', { ascending: false }),
    ])
    setClients(cl || [])
    setCamions(ca || [])
    setFournisseurs(fo || [])
    setTypeBriques(ty || [])
    setVentes(ve || [])
    setLoading(false)
  }

  async function saveVente(e) {
    e.preventDefault()
    if (!form.client_id || !form.camion_id || !qte || !pv) return
    setSaving(true)
    const client = clients.find(c => c.id === parseInt(form.client_id))
    const camion = camions.find(c => c.id === parseInt(form.camion_id))
    const fournisseur = fournisseurs.find(f => f.id === parseInt(form.fournisseur_id))
    const typeBrique = typeBriques.find(t => t.id === parseInt(form.type_brique_id))

    const rec = {
      date: form.date,
      client_id: parseInt(form.client_id),
      client_nom: client?.nom || '',
      camion_id: parseInt(form.camion_id),
      camion_plaque: camion?.plaque || '',
      chauffeur: camion?.chauffeur || '',
      fournisseur_id: parseInt(form.fournisseur_id) || null,
      fournisseur: fournisseur?.nom || '',
      type_brique_id: parseInt(form.type_brique_id) || null,
      type_brique: typeBrique?.nom || '',
      qte, prix_vente: pv, prix_achat: pa,
      total_vente: totalVente, total_achat: totalAchat, marge,
      bon: form.bon, note: form.note,
      user_id: user?.id
    }

    const { error } = await supabase.from('ventes').insert(rec)
    if (!error && client) {
      await supabase.from('clients').update({ solde: (client.solde || 0) + totalVente }).eq('id', client.id)
    }
    setSaving(false)
    if (!error) {
      setForm({ date: today(), client_id: '', camion_id: '', fournisseur_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', bon: '', note: '' })
      loadAll()
    }
  }

  async function deleteVente(id, clientId, totalVente) {
    if (!confirm('Supprimer cette vente ?')) return
    const client = clients.find(c => c.id === clientId)
    await supabase.from('ventes').delete().eq('id', id)
    if (client) await supabase.from('clients').update({ solde: Math.max(0, (client.solde || 0) - totalVente) }).eq('id', clientId)
    loadAll()
  }

  const filtered = ventes.filter(v => {
    const q = search.toLowerCase()
    if (filterClient && v.client_id !== parseInt(filterClient)) return false
    if (filterFourn && v.fournisseur !== filterFourn) return false
    if (q && !(v.client_nom + v.camion_plaque + v.type_brique + v.fournisseur + (v.bon || '')).toLowerCase().includes(q)) return false
    return true
  })

  const totQte = filtered.reduce((s, v) => s + (v.qte || 0), 0)
  const totVente = filtered.reduce((s, v) => s + (v.total_vente || 0), 0)
  const totMarge = filtered.reduce((s, v) => s + (v.marge || 0), 0)

  return (
    <Layout title="Ventes de briques" subtitle="Saisie et historique de toutes les ventes">

      {/* FORM */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">➕ Nouvelle vente</h2>
          <button onClick={() => setShowForm(!showForm)} className="text-xs text-gray-400 hover:text-gray-600">
            {showForm ? '▲ Réduire' : '▼ Ouvrir'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={saveVente}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
              </div>
              <div>
                <label className="label">Client</label>
                <select className="input" value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} required>
                  <option value="">Sélectionner...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Camion</label>
                <select className="input" value={form.camion_id} onChange={e => setForm({...form, camion_id: e.target.value})} required>
                  <option value="">Sélectionner...</option>
                  {camions.map(c => <option key={c.id} value={c.id}>{c.plaque}{c.chauffeur ? ` — ${c.chauffeur}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fournisseur</label>
                <select className="input" value={form.fournisseur_id} onChange={e => setForm({...form, fournisseur_id: e.target.value})}>
                  <option value="">Sélectionner...</option>
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="label">Type brique</label>
                <select className="input" value={form.type_brique_id} onChange={e => setForm({...form, type_brique_id: e.target.value})}>
                  <option value="">Sélectionner...</option>
                  {typeBriques.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Quantité (unités)</label>
                <input className="input" type="number" placeholder="ex: 6000" value={form.qte} onChange={e => setForm({...form, qte: e.target.value})} required />
              </div>
              <div>
                <label className="label">Prix vente/u (DHS)</label>
                <input className="input" type="number" step="0.01" placeholder="1.85" value={form.prix_vente} onChange={e => setForm({...form, prix_vente: e.target.value})} required />
              </div>
              <div>
                <label className="label">Prix achat/u (DHS)</label>
                <input className="input" type="number" step="0.01" placeholder="1.30" value={form.prix_achat} onChange={e => setForm({...form, prix_achat: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">BON N°</label>
                <input className="input" type="text" placeholder="ex: 2849" value={form.bon} onChange={e => setForm({...form, bon: e.target.value})} />
              </div>
              <div>
                <label className="label">Note</label>
                <input className="input" type="text" placeholder="optionnel" value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
              </div>
            </div>

            {/* CALC */}
            {(qte > 0 && pv > 0) && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Total vente</div>
                  <div className="text-xl font-bold text-blue-600">{fmt(totalVente)} DHS</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Total achat</div>
                  <div className="text-xl font-bold text-gray-600">{fmt(totalAchat)} DHS</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Marge</div>
                  <div className={`text-xl font-bold ${marge >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(marge)} DHS</div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Enregistrement...' : '✓ Enregistrer la vente'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setForm({ date: today(), client_id: '', camion_id: '', fournisseur_id: '', type_brique_id: '', qte: '', prix_vente: '', prix_achat: '', bon: '', note: '' })}>
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>

      {/* HISTORY */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-semibold text-gray-900">
            Historique des ventes
            <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length} entrées)</span>
          </h2>
          <div className="flex gap-2 flex-wrap">
            <input className="input w-48" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="input w-44" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
              <option value="">Tous les clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <select className="input w-40" value={filterFourn} onChange={e => setFilterFourn(e.target.value)}>
              <option value="">Tous fournisseurs</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Client</th>
                  <th className="th">Camion</th>
                  <th className="th">Chauffeur</th>
                  <th className="th">Fournisseur</th>
                  <th className="th">Type</th>
                  <th className="th text-right">Quantité</th>
                  <th className="th text-right">Vente DHS</th>
                  <th className="th text-right">Marge DHS</th>
                  <th className="th">BON</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="td text-gray-500">{v.date}</td>
                    <td className="td font-semibold text-gray-900">{v.client_nom}</td>
                    <td className="td text-gray-600">{v.camion_plaque}</td>
                    <td className="td text-gray-500">{v.chauffeur || '—'}</td>
                    <td className="td"><span className="badge-blue">{v.fournisseur || '—'}</span></td>
                    <td className="td"><span className="badge-gray">{v.type_brique || '—'}</span></td>
                    <td className="td text-right font-medium">{fmt(v.qte)}</td>
                    <td className="td text-right font-bold text-gray-900">{fmt(v.total_vente)}</td>
                    <td className={`td text-right font-bold ${(v.marge || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(v.marge)}</td>
                    <td className="td text-gray-400 text-xs">{v.bon || '—'}</td>
                    <td className="td">
                      <button className="btn-danger" onClick={() => deleteVente(v.id, v.client_id, v.total_vente)}>✕</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={11} className="td text-center text-gray-400 py-10">Aucune vente trouvée</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="tfoot-td" colSpan={6}>TOTAL ({filtered.length} ventes)</td>
                    <td className="tfoot-td text-right">{fmt(totQte)}</td>
                    <td className="tfoot-td text-right">{fmt(totVente)} DHS</td>
                    <td className="tfoot-td text-right text-green-700">{fmt(totMarge)} DHS</td>
                    <td className="tfoot-td" colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}

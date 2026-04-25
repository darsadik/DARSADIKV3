import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')

export default function Clients() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [clientVentes, setClientVentes] = useState([])
  const [clientPaiements, setClientPaiements] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nom: '', depot: 'EL HAJEB', tel: '', solde: 0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').eq('user_id', user?.id).order('solde', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  async function selectClient(client) {
    setSelected(client)
    setLoadingDetail(true)
    const [{ data: ventes }, { data: paiements }] = await Promise.all([
      supabase.from('ventes').select('*').eq('client_id', client.id).order('date', { ascending: false }),
      supabase.from('paiements').select('*').eq('client_id', client.id).order('date', { ascending: false }),
    ])
    setClientVentes(ventes || [])
    setClientPaiements(paiements || [])
    setLoadingDetail(false)
  }

  async function addClient(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('clients').insert({ ...form, solde: parseFloat(form.solde) || 0, user_id: user?.id })
    setSaving(false)
    setShowForm(false)
    setForm({ nom: '', depot: 'EL HAJEB', tel: '', solde: 0 })
    loadClients()
  }

  async function deleteClient(id) {
    if (!confirm('Supprimer ce client ?')) return
    await supabase.from('clients').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    loadClients()
  }

  async function editSolde(client) {
    const v = prompt(`Modifier le solde de ${client.nom} (actuel: ${fmt(client.solde)} DHS) :`, client.solde || 0)
    if (v === null) return
    const n = parseFloat(v)
    if (isNaN(n)) return
    await supabase.from('clients').update({ solde: n }).eq('id', client.id)
    loadClients()
    if (selected?.id === client.id) setSelected({ ...selected, solde: n })
  }

  const filtered = clients.filter(c => !search || (c.nom + c.depot).toLowerCase().includes(search.toLowerCase()))
  const totalCreances = filtered.reduce((s, c) => s + (c.solde || 0), 0)

  const totalVentesClient = clientVentes.reduce((s, v) => s + (v.total_vente || 0), 0)
  const totalPaiementsClient = clientPaiements.reduce((s, p) => s + (p.montant || 0), 0)

  return (
    <Layout title="Clients" subtitle="Gestion des clients et suivi des comptes">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CLIENT LIST */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Liste clients</h2>
              <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-3 py-1.5">
                + Nouveau
              </button>
            </div>

            {showForm && (
              <form onSubmit={addClient} className="bg-blue-50 rounded-xl p-4 mb-4 space-y-3">
                <div>
                  <label className="label">Nom complet</label>
                  <input className="input" placeholder="Nom du client" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Dépôt</label>
                    <select className="input" value={form.depot} onChange={e => setForm({...form, depot: e.target.value})}>
                      {['EL HAJEB','BERKANE','AHFIR','TAOUIMA','ZAIO','AUTRE'].map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Téléphone</label>
                    <input className="input" placeholder="06 ..." value={form.tel} onChange={e => setForm({...form, tel: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label">Solde initial (DHS)</label>
                  <input className="input" type="number" value={form.solde} onChange={e => setForm({...form, solde: e.target.value})} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary text-xs">
                    {saving ? 'Enregistrement...' : '✓ Enregistrer'}
                  </button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setShowForm(false)}>Annuler</button>
                </div>
              </form>
            )}

            <input className="input mb-3" placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="text-center text-gray-400 py-6">Chargement...</div>
              ) : filtered.map(c => {
                const s = c.solde || 0
                const isActive = selected?.id === c.id
                return (
                  <div key={c.id}
                    onClick={() => selectClient(c)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border
                      ${isActive ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${isActive ? 'text-brand-700' : 'text-gray-900'}`}>{c.nom}</div>
                      <div className="text-xs text-gray-400">{c.depot}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className={`text-xs font-bold ${s >= 100000 ? 'text-red-600' : s >= 30000 ? 'text-amber-600' : s > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                        {fmt(s)} DHS
                      </div>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <div className="text-center text-gray-400 py-6">Aucun client</div>}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 font-medium">Total créances</span>
                <span className="font-bold text-red-600">{fmt(totalCreances)} DHS</span>
              </div>
            </div>
          </div>
        </div>

        {/* CLIENT DETAIL */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-4">👈</div>
              <div className="text-gray-500 font-medium">Sélectionnez un client</div>
              <div className="text-gray-400 text-sm mt-1">pour voir son historique complet</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* CLIENT HEADER */}
              <div className="card">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-700 font-black text-xl">{selected.nom[0]}</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selected.nom}</h2>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="badge-gray">{selected.depot}</span>
                        {selected.tel && <span className="text-sm text-gray-500">📞 {selected.tel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => editSolde(selected)} className="btn-secondary text-xs">✎ Solde</button>
                    <button onClick={() => deleteClient(selected.id)} className="btn-danger">✕</button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-100">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Solde dû</div>
                    <div className={`text-2xl font-bold ${(selected.solde || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(selected.solde || 0)} DHS</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Total ventes</div>
                    <div className="text-2xl font-bold text-blue-600">{fmt(totalVentesClient)} DHS</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Total payé</div>
                    <div className="text-2xl font-bold text-green-600">{fmt(totalPaiementsClient)} DHS</div>
                  </div>
                </div>
              </div>

              {loadingDetail ? (
                <div className="card text-center py-10 text-gray-400">Chargement des données...</div>
              ) : (
                <>
                  {/* VENTES CLIENT */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3">📦 Ventes ({clientVentes.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="th">Date</th>
                            <th className="th">Camion</th>
                            <th className="th">Fournisseur</th>
                            <th className="th">Type</th>
                            <th className="th text-right">Qté</th>
                            <th className="th text-right">Vente DHS</th>
                            <th className="th text-right">Marge DHS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientVentes.map(v => (
                            <tr key={v.id} className="hover:bg-gray-50">
                              <td className="td text-gray-500">{v.date}</td>
                              <td className="td text-gray-700">{v.camion_plaque}</td>
                              <td className="td"><span className="badge-blue">{v.fournisseur || '—'}</span></td>
                              <td className="td"><span className="badge-gray">{v.type_brique || '—'}</span></td>
                              <td className="td text-right">{fmt(v.qte)}</td>
                              <td className="td text-right font-bold">{fmt(v.total_vente)}</td>
                              <td className="td text-right font-bold text-green-600">{fmt(v.marge)}</td>
                            </tr>
                          ))}
                          {clientVentes.length === 0 && (
                            <tr><td colSpan={7} className="td text-center text-gray-400 py-6">Aucune vente</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* PAIEMENTS CLIENT */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3">💰 Paiements ({clientPaiements.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="th">Date</th>
                            <th className="th">Mode</th>
                            <th className="th text-right">Montant DHS</th>
                            <th className="th">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientPaiements.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="td text-gray-500">{p.date}</td>
                              <td className="td"><span className="badge-green">{p.mode}</span></td>
                              <td className="td text-right font-bold text-green-600">− {fmt(p.montant)}</td>
                              <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                            </tr>
                          ))}
                          {clientPaiements.length === 0 && (
                            <tr><td colSpan={4} className="td text-center text-gray-400 py-6">Aucun paiement</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

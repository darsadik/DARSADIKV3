import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')
const today = () => new Date().toISOString().split('T')[0]

export default function Paiements() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [paiements, setPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: today(), client_id: '', mode: 'Espèce', montant: '', note: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const uid = user?.id
    const [{ data: cl }, { data: pa }] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', uid).order('nom'),
      supabase.from('paiements').select('*').eq('user_id', uid).order('date', { ascending: false }),
    ])
    setClients(cl || [])
    setPaiements(pa || [])
    setLoading(false)
  }

  const selectedClient = clients.find(c => c.id === parseInt(form.client_id))
  const montant = parseFloat(form.montant) || 0
  const soldeApres = Math.max(0, (selectedClient?.solde || 0) - montant)

  async function savePaiement(e) {
    e.preventDefault()
    if (!form.client_id || !montant) return
    setSaving(true)
    const client = selectedClient
    await supabase.from('paiements').insert({
      date: form.date, client_id: parseInt(form.client_id),
      client_nom: client?.nom || '', mode: form.mode,
      montant, note: form.note, user_id: user?.id
    })
    if (client) await supabase.from('clients').update({ solde: Math.max(0, (client.solde || 0) - montant) }).eq('id', client.id)
    setSaving(false)
    setForm({ date: today(), client_id: '', mode: 'Espèce', montant: '', note: '' })
    loadAll()
  }

  async function deletePaiement(id, clientId, montant) {
    if (!confirm('Supprimer ce paiement ?')) return
    const client = clients.find(c => c.id === clientId)
    await supabase.from('paiements').delete().eq('id', id)
    if (client) await supabase.from('clients').update({ solde: (client.solde || 0) + montant }).eq('id', clientId)
    loadAll()
  }

  const total = paiements.reduce((s, p) => s + (p.montant || 0), 0)

  return (
    <Layout title="Paiements" subtitle="Enregistrement et suivi des paiements clients">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* FORM */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">💰 Nouveau paiement</h2>
            <form onSubmit={savePaiement} className="space-y-4">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
              </div>
              <div>
                <label className="label">Client</label>
                <select className="input" value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} required>
                  <option value="">Sélectionner un client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.nom} — {fmt(c.solde || 0)} DHS</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Mode de paiement</label>
                <select className="input" value={form.mode} onChange={e => setForm({...form, mode: e.target.value})}>
                  {['Espèce','Chèque','Virement','Versement chauffeur'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Montant (DHS)</label>
                <input className="input" type="number" placeholder="ex: 50000" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} required />
              </div>
              <div>
                <label className="label">Référence / Note</label>
                <input className="input" type="text" placeholder="ex: Chèque N° 123456" value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
              </div>

              {selectedClient && montant > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Solde actuel</span>
                    <span className="font-bold text-red-600">{fmt(selectedClient.solde || 0)} DHS</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Paiement</span>
                    <span className="font-bold text-green-600">− {fmt(montant)} DHS</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                    <span className="text-gray-700 font-semibold">Solde après</span>
                    <span className={`font-bold text-lg ${soldeApres > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmt(soldeApres)} DHS</span>
                  </div>
                </div>
              )}

              <button type="submit" disabled={saving} className="btn-success w-full justify-center">
                {saving ? 'Enregistrement...' : '✓ Enregistrer le paiement'}
              </button>
            </form>
          </div>
        </div>

        {/* HISTORY */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Historique des paiements</h2>
              <div className="text-sm font-bold text-green-600">Total : {fmt(total)} DHS</div>
            </div>
            {loading ? (
              <div className="text-center text-gray-400 py-10">Chargement...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Client</th>
                      <th className="th">Mode</th>
                      <th className="th text-right">Montant DHS</th>
                      <th className="th">Note / Référence</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paiements.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="td text-gray-500">{p.date}</td>
                        <td className="td font-semibold text-gray-900">{p.client_nom}</td>
                        <td className="td"><span className="badge-green">{p.mode}</span></td>
                        <td className="td text-right font-bold text-green-600">− {fmt(p.montant)}</td>
                        <td className="td text-gray-400 text-xs">{p.note || '—'}</td>
                        <td className="td">
                          <button className="btn-danger" onClick={() => deletePaiement(p.id, p.client_id, p.montant)}>✕</button>
                        </td>
                      </tr>
                    ))}
                    {paiements.length === 0 && (
                      <tr><td colSpan={6} className="td text-center text-gray-400 py-10">Aucun paiement enregistré</td></tr>
                    )}
                  </tbody>
                  {paiements.length > 0 && (
                    <tfoot>
                      <tr>
                        <td className="tfoot-td" colSpan={3}>TOTAL REÇU</td>
                        <td className="tfoot-td text-right text-green-700">{fmt(total)} DHS</td>
                        <td className="tfoot-td" colSpan={2}></td>
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

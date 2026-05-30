import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'

const fmt = n => Math.round(n || 0).toLocaleString('fr-MA')

function Section({ title, icon, children }) {
  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  )
}

export default function Parametres() {
  const { user } = useAuth()
  const [tab, setTab] = useState('camions')
  const [camions, setCamions] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [typeBriques, setTypeBriques] = useState([])
  const [loading, setLoading] = useState(true)

  const [camionForm, setCamionForm] = useState({ plaque: '', chauffeur: '', depot: 'EL HAJEB' })
  const [fournForm, setFournForm] = useState({ nom: '', tel: '', note: '' })
  const [briqForm, setBriqForm] = useState({ nom: '', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: fo }, { data: ty }] = await Promise.all([
      supabase.from('camions').select('*').order('plaque'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('type_briques').select('*').order('nom'),
    ])
    setCamions(ca || [])
    setFournisseurs(fo || [])
    setTypeBriques(ty || [])
    setLoading(false)
  }

  async function addCamion(e) {
    e.preventDefault()
    if (!camionForm.plaque.trim()) return
    setSaving(true)
    await supabase.from('camions').insert({
      plaque: camionForm.plaque.toUpperCase().trim(),
      chauffeur: camionForm.chauffeur,
      depot: camionForm.depot,
      gasoil_dhs: 0, pleins: 0, litres: 0,
      
    })
    setSaving(false)
    setCamionForm({ plaque: '', chauffeur: '', depot: 'EL HAJEB' })
    loadAll()
  }

  async function deleteCamion(id) {
    if (!confirm('Supprimer ce camion ?')) return
    await supabase.from('camions').delete().eq('id', id)
    loadAll()
  }

  async function addFournisseur(e) {
    e.preventDefault()
    if (!fournForm.nom.trim()) return
    setSaving(true)
    await supabase.from('fournisseurs').insert({ ...fournForm })
    setSaving(false)
    setFournForm({ nom: '', tel: '', note: '' })
    loadAll()
  }

  async function deleteFournisseur(id) {
    if (!confirm('Supprimer ce fournisseur ?')) return
    await supabase.from('fournisseurs').delete().eq('id', id)
    loadAll()
  }

  async function addTypeBrique(e) {
    e.preventDefault()
    if (!briqForm.nom.trim()) return
    setSaving(true)
    await supabase.from('type_briques').insert({ ...briqForm })
    setSaving(false)
    setBriqForm({ nom: '', description: '' })
    loadAll()
  }

  async function deleteTypeBrique(id) {
    if (!confirm('Supprimer ce type de brique ?')) return
    await supabase.from('type_briques').delete().eq('id', id)
    loadAll()
  }

  const tabs = [
    { id: 'camions', label: 'Camions', icon: '🚛', count: camions.length },
    { id: 'fournisseurs', label: 'Fournisseurs', icon: '🏭', count: fournisseurs.length },
    { id: 'briques', label: 'Types de briques', icon: '🧱', count: typeBriques.length },
  ]

  return (
    <Layout title="Paramètres" subtitle="Gestion des camions, fournisseurs et types de briques">

      {/* TABS */}
      <div className="flex gap-2 mb-6 bg-white rounded-xl p-1.5 border border-gray-100 shadow-sm w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${tab === t.id ? 'bg-brand-500 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <span>{t.icon}</span>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* CAMIONS */}
      {tab === 'camions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <Section title="Ajouter un camion" icon="➕">
              <form onSubmit={addCamion} className="space-y-3">
                <div>
                  <label className="label">Immatriculation</label>
                  <input className="input" placeholder="ex: 20181-B-50" value={camionForm.plaque} onChange={e => setCamionForm({...camionForm, plaque: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Chauffeur</label>
                  <input className="input" placeholder="Nom du chauffeur" value={camionForm.chauffeur} onChange={e => setCamionForm({...camionForm, chauffeur: e.target.value})} />
                </div>
                <div>
                  <label className="label">Dépôt</label>
                  <select className="input" value={camionForm.depot} onChange={e => setCamionForm({...camionForm, depot: e.target.value})}>
                    {['EL HAJEB','BERKANE','AHFIR','TAOUIMA','ZAIO'].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
                  {saving ? 'Enregistrement...' : '✓ Ajouter'}
                </button>
              </form>
            </Section>
          </div>
          <div className="lg:col-span-2">
            <Section title={`Liste des camions (${camions.length})`} icon="🚛">
              {loading ? <div className="text-center py-8 text-gray-400">Chargement...</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Immatriculation</th>
                        <th className="th">Chauffeur</th>
                        <th className="th">Dépôt</th>
                        <th className="th text-right">Gasoil DHS</th>
                        <th className="th text-right">Pleins</th>
                        <th className="th text-right">Litres</th>
                        <th className="th"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {camions.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="td font-bold text-gray-900">{c.plaque}</td>
                          <td className="td text-gray-600">{c.chauffeur || '—'}</td>
                          <td className="td"><span className="badge-gray">{c.depot}</span></td>
                          <td className="td text-right font-semibold text-amber-600">{fmt(c.gasoil_dhs || 0)}</td>
                          <td className="td text-right">{c.pleins || 0}</td>
                          <td className="td text-right">{fmt(c.litres || 0)}</td>
                          <td className="td">
                            <button className="btn-danger" onClick={() => deleteCamion(c.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                      {camions.length === 0 && <tr><td colSpan={7} className="td text-center text-gray-400 py-8">Aucun camion</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </div>
      )}

      {/* FOURNISSEURS */}
      {tab === 'fournisseurs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <Section title="Ajouter un fournisseur" icon="➕">
              <form onSubmit={addFournisseur} className="space-y-3">
                <div>
                  <label className="label">Nom du fournisseur</label>
                  <input className="input" placeholder="ex: NOVA BRIQ SARL" value={fournForm.nom} onChange={e => setFournForm({...fournForm, nom: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Téléphone</label>
                  <input className="input" placeholder="06 ..." value={fournForm.tel} onChange={e => setFournForm({...fournForm, tel: e.target.value})} />
                </div>
                <div>
                  <label className="label">Note</label>
                  <input className="input" placeholder="optionnel" value={fournForm.note} onChange={e => setFournForm({...fournForm, note: e.target.value})} />
                </div>
                <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
                  {saving ? 'Enregistrement...' : '✓ Ajouter'}
                </button>
              </form>
            </Section>
          </div>
          <div className="lg:col-span-2">
            <Section title={`Liste des fournisseurs (${fournisseurs.length})`} icon="🏭">
              {loading ? <div className="text-center py-8 text-gray-400">Chargement...</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Nom</th>
                        <th className="th">Téléphone</th>
                        <th className="th">Note</th>
                        <th className="th"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fournisseurs.map(f => (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className="td font-bold text-gray-900">{f.nom}</td>
                          <td className="td text-gray-500">{f.tel || '—'}</td>
                          <td className="td text-gray-400 text-xs">{f.note || '—'}</td>
                          <td className="td">
                            <button className="btn-danger" onClick={() => deleteFournisseur(f.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                      {fournisseurs.length === 0 && <tr><td colSpan={4} className="td text-center text-gray-400 py-8">Aucun fournisseur</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </div>
      )}

      {/* TYPE BRIQUES */}
      {tab === 'briques' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <Section title="Ajouter un type de brique" icon="➕">
              <form onSubmit={addTypeBrique} className="space-y-3">
                <div>
                  <label className="label">Nom du type</label>
                  <input className="input" placeholder="ex: B12, B10, B7GF1..." value={briqForm.nom} onChange={e => setBriqForm({...briqForm, nom: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input className="input" placeholder="optionnel" value={briqForm.description} onChange={e => setBriqForm({...briqForm, description: e.target.value})} />
                </div>
                <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
                  {saving ? 'Enregistrement...' : '✓ Ajouter'}
                </button>
              </form>
            </Section>
          </div>
          <div className="lg:col-span-2">
            <Section title={`Types de briques (${typeBriques.length})`} icon="🧱">
              {loading ? <div className="text-center py-8 text-gray-400">Chargement...</div> : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {typeBriques.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div>
                        <div className="font-bold text-gray-900">{t.nom}</div>
                        {t.description && <div className="text-xs text-gray-400">{t.description}</div>}
                      </div>
                      <button className="btn-danger ml-2" onClick={() => deleteTypeBrique(t.id)}>✕</button>
                    </div>
                  ))}
                  {typeBriques.length === 0 && (
                    <div className="col-span-3 text-center text-gray-400 py-8">Aucun type de brique</div>
                  )}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </Layout>
  )
}

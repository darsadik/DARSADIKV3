import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { DEFAULT_REMISE_CARBURANT_RATE } from '../../lib/services/profitability'
import { fetchRemiseCarburantRate, saveRemiseCarburantRate } from '../../lib/services/settings'
import { fmtMoney } from '../../lib/utils'

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
  const [loueurs, setLoueurs] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [typeBriques, setTypeBriques] = useState([])
  const [loading, setLoading] = useState(true)

  const [camionForm, setCamionForm] = useState({
    plaque: '', chauffeur: '', depot: 'EL HAJEB',
    type_camion: 'propre', loueur_id: '',
    nom_proprietaire: '', telephone_proprietaire: '', cin: '', camion_note: ''
  })
  const [fournForm, setFournForm] = useState({ nom: '', tel: '', note: '' })
  const [briqForm, setBriqForm] = useState({ nom: '', description: '' })
  const [loueurForm, setLoueurForm] = useState({ nom: '', telephone: '', cin: '', rib: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [remiseRateInput, setRemiseRateInput] = useState(String(DEFAULT_REMISE_CARBURANT_RATE))
  const [savingRemise, setSavingRemise] = useState(false)
  const [remiseMsg, setRemiseMsg] = useState('')

  useEffect(() => { loadAll(); fetchRemiseCarburantRate().then(r => setRemiseRateInput(String(r))) }, [])

  async function saveRemiseRate(e) {
    e.preventDefault()
    const rate = parseFloat(remiseRateInput)
    if (!Number.isFinite(rate) || rate < 0) { setRemiseMsg('❌ Taux invalide'); return }
    setSavingRemise(true)
    setRemiseMsg('')
    const { error: err } = await saveRemiseCarburantRate(rate)
    setSavingRemise(false)
    setRemiseMsg(err ? '❌ ' + err.message : '✅ Enregistré !')
    if (!err) setTimeout(() => setRemiseMsg(''), 2000)
  }

  async function loadAll() {
    setLoading(true)
    const [{ data: ca }, { data: lo }, { data: fo }, { data: ty }] = await Promise.all([
      supabase.from('camions').select('*, loueurs(nom)').order('plaque'),
      supabase.from('loueurs').select('*').order('nom'),
      supabase.from('fournisseurs').select('*').order('nom'),
      supabase.from('type_briques').select('*').order('nom'),
    ])
    setCamions(ca || [])
    setLoueurs(lo || [])
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
      type_camion: camionForm.type_camion,
      loueur_id: camionForm.type_camion === 'loue' && camionForm.loueur_id ? parseInt(camionForm.loueur_id) : null,
      nom_proprietaire: camionForm.type_camion === 'loue' ? camionForm.nom_proprietaire : null,
      telephone_proprietaire: camionForm.type_camion === 'loue' ? camionForm.telephone_proprietaire : null,
      cin: camionForm.type_camion === 'loue' ? camionForm.cin : null,
      camion_note: camionForm.camion_note || null,
      gasoil_dhs: 0, pleins: 0, litres: 0,
    })
    setSaving(false)
    setCamionForm({ plaque: '', chauffeur: '', depot: 'EL HAJEB', type_camion: 'propre', loueur_id: '', nom_proprietaire: '', telephone_proprietaire: '', cin: '', camion_note: '' })
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

  async function addLoueur(e) {
    e.preventDefault()
    if (!loueurForm.nom.trim()) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('loueurs').insert({ ...loueurForm })
    setSaving(false)
    if (err) { setError(err.message); return }
    setLoueurForm({ nom: '', telephone: '', cin: '', rib: '', note: '' })
    loadAll()
  }

  async function deleteLoueur(id) {
    if (!confirm('Supprimer ce loueur ? Les camions associés perdront leur lien.')) return
    await supabase.from('loueurs').delete().eq('id', id)
    loadAll()
  }

  const tabs = [
    { id: 'camions',    label: 'Camions',           icon: '🚛', count: camions.length },
    { id: 'loueurs',    label: 'Loueurs',            icon: '🔑', count: loueurs.length },
    { id: 'fournisseurs', label: 'Fournisseurs',     icon: '🏭', count: fournisseurs.length },
    { id: 'briques',    label: 'Types de briques',   icon: '🧱', count: typeBriques.length },
    { id: 'carburant',  label: 'Carburant',           icon: '⛽' },
  ]

  return (
    <Layout title="Paramètres" subtitle="Gestion des camions, loueurs, fournisseurs et types de briques">

      {/* TABS */}
      <div className="flex gap-2 mb-6 bg-white rounded-xl p-1.5 border border-gray-100 shadow-sm flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${tab === t.id ? 'bg-brand-500 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <span>{t.icon}</span>
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
            )}
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
                <div>
                  <label className="label">Type de camion</label>
                  <div className="flex gap-2">
                    {[{v:'propre',l:'🏢 Propre'},{v:'loue',l:'🔑 Loué'}].map(o => (
                      <button key={o.v} type="button"
                        onClick={() => setCamionForm({...camionForm, type_camion: o.v})}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${camionForm.type_camion===o.v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {camionForm.type_camion === 'loue' && (
                  <div className="space-y-3 bg-amber-50 p-3 rounded-xl border border-amber-100">
                    <div className="text-xs font-semibold text-amber-700 mb-1">Informations du propriétaire</div>
                    <div>
                      <label className="label">Loueur (optionnel)</label>
                      <select className="input" value={camionForm.loueur_id} onChange={e => setCamionForm({...camionForm, loueur_id: e.target.value})}>
                        <option value="">— Sélectionner un loueur —</option>
                        {loueurs.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Nom propriétaire</label>
                      <input className="input" placeholder="Si différent du loueur" value={camionForm.nom_proprietaire} onChange={e => setCamionForm({...camionForm, nom_proprietaire: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Téléphone</label>
                      <input className="input" placeholder="06 ..." value={camionForm.telephone_proprietaire} onChange={e => setCamionForm({...camionForm, telephone_proprietaire: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">CIN</label>
                      <input className="input" placeholder="optionnel" value={camionForm.cin} onChange={e => setCamionForm({...camionForm, cin: e.target.value})} />
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">Note</label>
                  <input className="input" placeholder="optionnel" value={camionForm.camion_note} onChange={e => setCamionForm({...camionForm, camion_note: e.target.value})} />
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
                        <th className="th">Type</th>
                        <th className="th">Chauffeur</th>
                        <th className="th">Dépôt</th>
                        <th className="th">Loueur / Propriétaire</th>
                        <th className="th text-right">Gasoil DHS</th>
                        <th className="th"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {camions.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="td font-bold text-gray-900">{c.plaque}</td>
                          <td className="td">
                            {c.type_camion === 'loue'
                              ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🔑 Loué</span>
                              : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🏢 Propre</span>
                            }
                          </td>
                          <td className="td text-gray-600">{c.chauffeur || '—'}</td>
                          <td className="td"><span className="badge-gray">{c.depot}</span></td>
                          <td className="td text-gray-500 text-xs">
                            {c.loueurs?.nom || c.nom_proprietaire || '—'}
                            {c.telephone_proprietaire && <div className="text-gray-400">{c.telephone_proprietaire}</div>}
                          </td>
                          <td className="td text-right font-semibold text-amber-600">{fmtMoney(c.gasoil_dhs || 0)}</td>
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

      {/* LOUEURS */}
      {tab === 'loueurs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <Section title="Ajouter un loueur" icon="➕">
              <form onSubmit={addLoueur} className="space-y-3">
                {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
                <div>
                  <label className="label">Nom du loueur</label>
                  <input className="input" placeholder="ex: Ahmed Bouzidi" value={loueurForm.nom} onChange={e => setLoueurForm({...loueurForm, nom: e.target.value})} required />
                </div>
                <div>
                  <label className="label">Téléphone</label>
                  <input className="input" placeholder="06 ..." value={loueurForm.telephone} onChange={e => setLoueurForm({...loueurForm, telephone: e.target.value})} />
                </div>
                <div>
                  <label className="label">CIN</label>
                  <input className="input" placeholder="optionnel" value={loueurForm.cin} onChange={e => setLoueurForm({...loueurForm, cin: e.target.value})} />
                </div>
                <div>
                  <label className="label">RIB bancaire</label>
                  <input className="input" placeholder="optionnel" value={loueurForm.rib} onChange={e => setLoueurForm({...loueurForm, rib: e.target.value})} />
                </div>
                <div>
                  <label className="label">Note</label>
                  <input className="input" placeholder="optionnel" value={loueurForm.note} onChange={e => setLoueurForm({...loueurForm, note: e.target.value})} />
                </div>
                <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
                  {saving ? 'Enregistrement...' : '✓ Ajouter'}
                </button>
              </form>
            </Section>
          </div>
          <div className="lg:col-span-2">
            <Section title={`Liste des loueurs (${loueurs.length})`} icon="🔑">
              {loading ? <div className="text-center py-8 text-gray-400">Chargement...</div> : (
                <div className="space-y-3">
                  {loueurs.map(l => (
                    <div key={l.id} className="flex items-start justify-between bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <div>
                        <div className="font-bold text-gray-900">{l.nom}</div>
                        <div className="flex gap-3 mt-1 flex-wrap">
                          {l.telephone && <span className="text-xs text-gray-500">📞 {l.telephone}</span>}
                          {l.cin && <span className="text-xs text-gray-500">🪪 {l.cin}</span>}
                          {l.rib && <span className="text-xs text-gray-500">🏦 {l.rib}</span>}
                        </div>
                        {l.note && <div className="text-xs text-gray-400 mt-1">{l.note}</div>}
                      </div>
                      <button className="btn-danger ml-3 flex-shrink-0" onClick={() => deleteLoueur(l.id)}>✕</button>
                    </div>
                  ))}
                  {loueurs.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                      <div className="text-3xl mb-2">🔑</div>
                      <div className="text-sm">Aucun loueur enregistré</div>
                      <div className="text-xs mt-1 text-gray-300">Ajoutez les propriétaires de camions loués</div>
                    </div>
                  )}
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

      {/* CARBURANT */}
      {tab === 'carburant' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section title="Remise Carburant" icon="⛽">
              <p className="text-sm text-gray-500 mb-4">
                Remise accordée par le fournisseur de carburant, en DH par litre de <b>gasoil uniquement</b> (jamais l'AdBlue).
                Elle est calculée automatiquement : <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded">Remise = Litres gasoil × Taux</span>.
              </p>
              <form onSubmit={saveRemiseRate} className="flex items-end gap-3 max-w-sm">
                <div className="flex-1">
                  <label className="label">Taux (DH / litre)</label>
                  <input className="input" type="number" step="0.01" min="0"
                    value={remiseRateInput}
                    onChange={e => setRemiseRateInput(e.target.value)} required />
                </div>
                <button type="submit" disabled={savingRemise} className="btn-primary">
                  {savingRemise ? '...' : '✓ Enregistrer'}
                </button>
              </form>
              {remiseMsg && (
                <div className={`mt-3 text-sm font-semibold ${remiseMsg.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                  {remiseMsg}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-4">Taux par défaut : {fmtMoney(DEFAULT_REMISE_CARBURANT_RATE)} DH/L</div>
            </Section>
          </div>
        </div>
      )}
    </Layout>
  )
}

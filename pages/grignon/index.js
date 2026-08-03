import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import { fmt, fmtMoney, useIsMobile } from '../../lib/utils'
import { ADMIN_EMAIL } from '../../lib/config'

const ADMIN = ADMIN_EMAIL

// The old operational Grignon dashboard (saisie, edition d'opérations, camions,
// paiements fournisseur direct) has been retired — Voyage is now the only
// place new grignon achats/livraisons/charges/retours are created, and
// /paiements is the only place payments are recorded. This page is now
// reference/master-data only: create, edit, activate/deactivate and search
// grignon clients & fournisseurs. See /clients/grignon and /fournisseurs/grignon
// for the unified operational timeline (historique + voyage, tout confondu).

function emptyEntity() {
  return { nom: '', telephone: '', adresse: '', note: '' }
}

export default function Grignon() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const admin = user?.email === ADMIN

  const [tab, setTab] = useState('client') // 'client' | 'fournisseur'
  const [clients, setClients] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [showAddClient, setShowAddClient] = useState(false)
  const [newClient, setNewClient] = useState(emptyEntity())
  const [savingClient, setSavingClient] = useState(false)

  const [showAddFourn, setShowAddFourn] = useState(false)
  const [newFourn, setNewFourn] = useState(emptyEntity())
  const [savingFourn, setSavingFourn] = useState(false)

  const [editClientId, setEditClientId] = useState(null)
  const [editClientForm, setEditClientForm] = useState(emptyEntity())
  const [editFournId, setEditFournId] = useState(null)
  const [editFournForm, setEditFournForm] = useState(emptyEntity())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cl }, { data: fo }] = await Promise.all([
      supabase.from('grignon_clients').select('*').order('nom'),
      supabase.from('grignon_fournisseurs').select('*').order('nom'),
    ])
    setClients(cl || [])
    setFournisseurs(fo || [])
    setLoading(false)
  }

  // ── Clients ──
  async function addClient(e) {
    e.preventDefault()
    if (!newClient.nom.trim()) return
    setSavingClient(true)
    await supabase.from('grignon_clients').insert({
      nom: newClient.nom.trim(),
      telephone: newClient.telephone.trim() || null,
      adresse: newClient.adresse.trim() || null,
      note: newClient.note.trim() || null,
      solde: 0,
    })
    setSavingClient(false)
    setNewClient(emptyEntity())
    setShowAddClient(false)
    loadAll()
  }

  function startEditClient(c) {
    setEditClientId(c.id)
    setEditClientForm({ nom: c.nom || '', telephone: c.telephone || '', adresse: c.adresse || '', note: c.note || '' })
  }

  async function saveEditClient(e) {
    e.preventDefault()
    if (!editClientForm.nom.trim()) return
    await supabase.from('grignon_clients').update({
      nom: editClientForm.nom.trim(),
      telephone: editClientForm.telephone.trim() || null,
      adresse: editClientForm.adresse.trim() || null,
      note: editClientForm.note.trim() || null,
    }).eq('id', editClientId)
    setEditClientId(null)
    loadAll()
  }

  async function toggleClientActif(c) {
    await supabase.from('grignon_clients').update({ actif: !c.actif }).eq('id', c.id)
    loadAll()
  }

  async function deleteClient(id) {
    if (!admin || !confirm('Supprimer ce client grignon ?')) return
    await supabase.from('grignon_clients').delete().eq('id', id)
    loadAll()
  }

  // ── Fournisseurs ──
  async function addFourn(e) {
    e.preventDefault()
    if (!newFourn.nom.trim()) return
    setSavingFourn(true)
    await supabase.from('grignon_fournisseurs').insert({
      nom: newFourn.nom.trim(),
      telephone: newFourn.telephone.trim() || null,
      adresse: newFourn.adresse.trim() || null,
      note: newFourn.note.trim() || null,
    })
    setSavingFourn(false)
    setNewFourn(emptyEntity())
    setShowAddFourn(false)
    loadAll()
  }

  function startEditFourn(f) {
    setEditFournId(f.id)
    setEditFournForm({ nom: f.nom || '', telephone: f.telephone || '', adresse: f.adresse || '', note: f.note || '' })
  }

  async function saveEditFourn(e) {
    e.preventDefault()
    if (!editFournForm.nom.trim()) return
    await supabase.from('grignon_fournisseurs').update({
      nom: editFournForm.nom.trim(),
      telephone: editFournForm.telephone.trim() || null,
      adresse: editFournForm.adresse.trim() || null,
      note: editFournForm.note.trim() || null,
    }).eq('id', editFournId)
    setEditFournId(null)
    loadAll()
  }

  async function toggleFournActif(f) {
    await supabase.from('grignon_fournisseurs').update({ actif: !f.actif }).eq('id', f.id)
    loadAll()
  }

  async function deleteFourn(id) {
    if (!admin || !confirm('Supprimer ce fournisseur grignon ?')) return
    await supabase.from('grignon_fournisseurs').delete().eq('id', id)
    loadAll()
  }

  // ── filtering ──
  const filteredClients = clients
    .filter(c => showInactive || c.actif !== false)
    .filter(c => !search || c.nom.toLowerCase().includes(search.toLowerCase()))
  const filteredFourns = fournisseurs
    .filter(f => showInactive || f.actif !== false)
    .filter(f => !search || f.nom.toLowerCase().includes(search.toLowerCase()))

  const EntityForm = ({ form, setForm, onSubmit, saving, submitLabel, onCancel }) => (
    <form onSubmit={onSubmit} className="space-y-3 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
        <div>
          <label className="label">Nom *</label>
          <input className="input" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required autoFocus />
        </div>
        <div>
          <label className="label">Téléphone</label>
          <input className="input" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">Adresse</label>
        <input className="input" value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} />
      </div>
      <div>
        <label className="label">Note</label>
        <input className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary" style={{ background: '#92400e' }}>
          {saving ? '...' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Annuler</button>
      </div>
    </form>
  )

  function EntityRow({ entity, editing, editForm, setEditForm, onSave, onStartEdit, onToggleActif, onDelete, statementHref }) {
    if (editing) {
      return (
        <form onSubmit={onSave} className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 mb-2">
          <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
            <input className="input text-sm" placeholder="Nom" value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })} required autoFocus />
            <input className="input text-sm" placeholder="Téléphone" value={editForm.telephone} onChange={e => setEditForm({ ...editForm, telephone: e.target.value })} />
          </div>
          <input className="input text-sm" placeholder="Adresse" value={editForm.adresse} onChange={e => setEditForm({ ...editForm, adresse: e.target.value })} />
          <input className="input text-sm" placeholder="Note" value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-xs px-3 py-1.5" style={{ background: '#92400e' }}>✓ Enregistrer</button>
            <button type="button" onClick={() => onStartEdit(null)} className="btn-secondary text-xs px-3 py-1.5">Annuler</button>
          </div>
        </form>
      )
    }
    const inactive = entity.actif === false
    return (
      <div className={`flex items-center justify-between p-3 rounded-xl border ${inactive ? 'bg-gray-50 border-gray-100 opacity-60' : 'border-transparent hover:bg-gray-50'}`}>
        <div>
          <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
            {entity.nom}
            {inactive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Inactif</span>}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {entity.telephone || '—'}{entity.adresse ? ` · ${entity.adresse}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-amber-700">{fmtMoney(entity.solde || 0)} DHS</span>
          {statementHref && (
            <Link href={statementHref} className="btn-secondary text-xs px-2 py-1" style={{ textDecoration: 'none' }}>Relevé ↗</Link>
          )}
          <button onClick={() => onStartEdit(entity)} className="btn-secondary text-xs px-2 py-1">✎</button>
          <button onClick={() => onToggleActif(entity)} className="btn-secondary text-xs px-2 py-1">
            {inactive ? '▶ Activer' : '⏸ Désactiver'}
          </button>
          {admin && <button onClick={() => onDelete(entity.id)} className="text-red-300 hover:text-red-500 text-xs px-1">✕</button>}
        </div>
      </div>
    )
  }

  return (
    <Layout title="Grignon — Référence" subtitle="Données de référence : clients & fournisseurs grignon (Fitour)">
      <div className="flex items-center gap-3 mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <span className="text-2xl">🫒</span>
        <div>
          <div className="font-bold text-amber-800">Module Grignon (Fitour) — Données de référence</div>
          <div className="text-xs text-amber-600">
            Les achats, livraisons et charges se créent uniquement depuis un Voyage. Les paiements se saisissent dans « Paiements ».
            Cette page ne gère que la liste des clients et fournisseurs.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setTab('client')}
          className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${tab === 'client' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          style={tab === 'client' ? { background: '#92400e', borderColor: '#92400e' } : {}}>
          👤 Clients
        </button>
        <button onClick={() => setTab('fournisseur')}
          className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${tab === 'fournisseur' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          style={tab === 'fournisseur' ? { background: '#15803d', borderColor: '#15803d' } : {}}>
          🏭 Fournisseurs
        </button>
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input className="input flex-1 min-w-[200px] text-sm" placeholder="🔍 Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Afficher les inactifs
          </label>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-gray-400">Chargement...</div>
      ) : tab === 'client' ? (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">👤 Clients Grignon ({filteredClients.length})</h3>
            <button onClick={() => setShowAddClient(!showAddClient)} className="btn-primary text-xs px-3 py-1.5" style={{ background: '#92400e' }}>
              {showAddClient ? '✕ Fermer' : '+ Client'}
            </button>
          </div>
          {showAddClient && (
            <EntityForm form={newClient} setForm={setNewClient} onSubmit={addClient} saving={savingClient}
              submitLabel="✓ Ajouter" onCancel={() => setShowAddClient(false)} />
          )}
          <div className="space-y-1">
            {filteredClients.map(c => (
              <EntityRow key={c.id} entity={c}
                editing={editClientId === c.id} editForm={editClientForm} setEditForm={setEditClientForm}
                onSave={saveEditClient} onStartEdit={(row) => row ? startEditClient(row) : setEditClientId(null)}
                onToggleActif={toggleClientActif} onDelete={deleteClient}
                statementHref="/clients/grignon" />
            ))}
            {filteredClients.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Aucun client grignon</div>}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">🏭 Fournisseurs Grignon ({filteredFourns.length})</h3>
            <button onClick={() => setShowAddFourn(!showAddFourn)} className="btn-primary text-xs px-3 py-1.5" style={{ background: '#15803d' }}>
              {showAddFourn ? '✕ Fermer' : '+ Fournisseur'}
            </button>
          </div>
          {showAddFourn && (
            <EntityForm form={newFourn} setForm={setNewFourn} onSubmit={addFourn} saving={savingFourn}
              submitLabel="✓ Ajouter" onCancel={() => setShowAddFourn(false)} />
          )}
          <div className="space-y-1">
            {filteredFourns.map(f => (
              <EntityRow key={f.id} entity={f}
                editing={editFournId === f.id} editForm={editFournForm} setEditForm={setEditFournForm}
                onSave={saveEditFourn} onStartEdit={(row) => row ? startEditFourn(row) : setEditFournId(null)}
                onToggleActif={toggleFournActif} onDelete={deleteFourn}
                statementHref="/fournisseurs/grignon" />
            ))}
            {filteredFourns.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Aucun fournisseur grignon</div>}
          </div>
        </div>
      )}
    </Layout>
  )
}

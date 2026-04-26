import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'

// ⚠️ ONLY THIS EMAIL CAN ACCESS ADMIN PAGE
const SUPER_ADMIN = 'abdelhafidbaadi@gmail.com'

export default function Admin() {
  const { user } = useAuth()
  const [allowedEmails, setAllowedEmails] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const isAdmin = user?.email === SUPER_ADMIN

  useEffect(() => { if (isAdmin) loadEmails() }, [isAdmin])

  async function loadEmails() {
    setLoading(true)
    const { data } = await supabase.from('allowed_users').select('*').order('created_at', { ascending: false })
    setAllowedEmails(data || [])
    setLoading(false)
  }

  async function addEmail(e) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('allowed_users').insert({ email: newEmail.trim().toLowerCase() })
    if (error) {
      setMsg({ text: error.code === '23505' ? 'Cet email existe déjà!' : error.message, type: 'err' })
    } else {
      setMsg({ text: `✅ ${newEmail} ajouté avec succès!`, type: 'ok' })
      setNewEmail('')
      loadEmails()
    }
    setSaving(false)
  }

  async function removeEmail(id, email) {
    if (!confirm(`Supprimer ${email} ?`)) return
    await supabase.from('allowed_users').delete().eq('id', id)
    setMsg({ text: `❌ ${email} supprimé`, type: 'warn' })
    loadEmails()
  }

  if (!isAdmin) {
    return (
      <Layout title="Admin" subtitle="Accès restreint">
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <div className="text-xl font-bold text-gray-900 mb-2">Accès refusé</div>
          <div className="text-gray-500">Vous n'avez pas accès à cette page.</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Admin" subtitle="Gestion des accès utilisateurs">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ADD EMAIL */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">➕ Ajouter un utilisateur</h2>
            <form onSubmit={addEmail} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="exemple@gmail.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  required
                />
              </div>
              {msg && (
                <div className={`text-sm p-3 rounded-lg ${msg.type === 'err' ? 'bg-red-50 text-red-600' : msg.type === 'warn' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                  {msg.text}
                </div>
              )}
              <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
                {saving ? 'Ajout...' : '✓ Ajouter'}
              </button>
            </form>

            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="text-xs font-bold text-blue-700 mb-2">ℹ️ Comment ça marche</div>
              <div className="text-xs text-blue-600 space-y-1">
                <div>• Ajoutez l'email d'un membre</div>
                <div>• Il peut créer un compte avec cet email</div>
                <div>• S'il n'est pas dans la liste → accès refusé ❌</div>
                <div>• Supprimez un email pour bloquer l'accès ❌</div>
              </div>
            </div>
          </div>
        </div>

        {/* EMAIL LIST */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">
                👥 Utilisateurs autorisés
                <span className="ml-2 text-xs font-normal text-gray-400">({allowedEmails.length} emails)</span>
              </h2>
            </div>

            {/* ADMIN ALWAYS SHOWN */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-brand-50 border border-brand-200 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-brand-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {SUPER_ADMIN[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-sm text-brand-700">{SUPER_ADMIN}</div>
                  <div className="text-xs text-brand-400">Super Admin — ne peut pas être supprimé</div>
                </div>
              </div>
              <span className="badge-blue text-xs px-2 py-1">👑 Admin</span>
            </div>

            {loading ? (
              <div className="text-center py-10 text-gray-400">Chargement...</div>
            ) : allowedEmails.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <div className="text-3xl mb-2">👤</div>
                <div>Aucun utilisateur ajouté</div>
                <div className="text-xs mt-1">Ajoutez des emails pour autoriser l'accès</div>
              </div>
            ) : (
              <div className="space-y-2">
                {allowedEmails.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm">
                        {u.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900">{u.email}</div>
                        <div className="text-xs text-gray-400">
                          Ajouté le {new Date(u.created_at).toLocaleDateString('fr-MA')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge-green text-xs">✅ Autorisé</span>
                      <button
                        onClick={() => removeEmail(u.id, u.email)}
                        className="btn-danger text-xs px-2 py-1">
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

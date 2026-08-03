import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../_app'
import * as XLSX from 'xlsx'
import { fmtMoney } from '../../lib/utils'

const fmt     = n => Math.round(n || 0).toLocaleString('fr-MA')
const fmtD    = n => parseFloat(n || 0).toFixed(2)
const fmtDate = d => { if (!d) return '—'; const [y,m,j] = d.split('-'); return `${j}/${m}/${y}` }
const today   = () => new Date().toISOString().split('T')[0]
const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

const PRINT_CSS = [
  '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
  'body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; color: #1e293b; background: #fff; margin: 0; }',
  'h1 { font-size: 18px; margin: 0 0 4px; }',
  '.sub { color: #555; font-size: 11px; margin-bottom: 16px; }',
  'table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }',
  'th { background: #1e3a5f !important; color: #fff !important; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }',
  'td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }',
  'tr:nth-child(even) td { background: #f8fafc !important; }',
  'tfoot td { background: #f1f5f9 !important; font-weight: 800 !important; border-top: 2px solid #1e3a5f !important; }',
  '.ch { background: #1e3a5f !important; color: #fff !important; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; }',
  '.gt { background: #1e3a5f !important; color: #fff !important; padding: 12px 16px; border-radius: 6px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }',
  '.footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #888; font-size: 10px; text-align: center; }',
  '@media print { button { display: none !important; } body { padding: 0; } }',
].join('\n')

function openPrint(html) {
  const old = document.getElementById('__po')
  if (old) old.remove()
  const ov = document.createElement('div')
  ov.id = '__po'
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#1e293b;display:flex;flex-direction:column'
  const bar = document.createElement('div')
  bar.style.cssText = 'display:flex;gap:8px;padding:10px 16px;background:#0f172a;flex-shrink:0'
  bar.innerHTML = '<button onclick="document.getElementById(\'__pf\').contentWindow.print()" style="padding:7px 18px;background:#1a5fa8;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimer</button>'
    + '<button onclick="document.getElementById(\'__po\').remove()" style="padding:7px 18px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">✕ Fermer</button>'
  const fr = document.createElement('iframe')
  fr.id = '__pf'
  fr.style.cssText = 'flex:1;border:none;width:100%;background:#fff'
  ov.appendChild(bar); ov.appendChild(fr)
  document.body.appendChild(ov)
  fr.contentWindow.document.write(html)
  fr.contentWindow.document.close()
}

export default function Livraisons() {
  const { user } = useAuth()
  const router   = useRouter()
  const isMobile = useIsMobile()

  const [tab,          setTab]          = useState('brique')
  const [livraisons,   setLivraisons]   = useState([])
  const [saisieVentes, setSaisieVentes] = useState([])
  const [clients,      setClients]      = useState([])
  const [typeBriques,  setTypeBriques]  = useState([])
  const [loading,      setLoading]      = useState(true)

  // Voyage livraisons filters
  const [filterFrom,   setFilterFrom]   = useState(startOfMonth())
  const [filterTo,     setFilterTo]     = useState(today())
  const [filterClient, setFilterClient] = useState('')
  const [filterCamion, setFilterCamion] = useState('')

  // Saisie ventes filters
  const [filterSaisieFrom,   setFilterSaisieFrom]   = useState(startOfMonth())
  const [filterSaisieTo,     setFilterSaisieTo]     = useState(today())
  const [filterSaisieClient, setFilterSaisieClient] = useState('')

  // Edit state (for saisie ventes)
  const [editRow,    setEditRow]    = useState(null)
  const [editForm,   setEditForm]   = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg,    setEditMsg]    = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: lv }, { data: sv }, { data: cl }, { data: ty }] = await Promise.all([
      supabase.from('voyage_livraisons')
        .select('*, voyages(id, reference, date_depart, camion_plaque, chauffeur)')
        .order('date_livraison', { ascending: false }),
      supabase.from('ventes')
        .select('*')
        .is('voyage_id', null)
        .not('client_id', 'is', null)
        .order('date', { ascending: false }),
      supabase.from('clients').select('id, nom').order('nom'),
      supabase.from('type_briques').select('*').order('nom'),
    ])
    const gMap = n => n?.toUpperCase() === 'NOVA BRIQUE' ? 'NOVA ET DURA' : n
    setLivraisons((lv || []).map(l => l.type_produit === 'grignon' ? {...l, client_nom: gMap(l.client_nom)} : l))
    setSaisieVentes(sv || [])
    setClients(cl || [])
    setTypeBriques(ty || [])
    setLoading(false)
  }

  // ── Voyage livraisons (filtered) ──────────────────────────────
  const filtered = livraisons.filter(l => {
    if (tab === 'brique'  && l.type_produit !== 'brique')  return false
    if (tab === 'grignon' && l.type_produit !== 'grignon') return false
    if (filterFrom   && l.date_livraison < filterFrom) return false
    if (filterTo     && l.date_livraison > filterTo)   return false
    if (filterClient && String(l.client_id) !== filterClient) return false
    if (filterCamion && l.voyages?.camion_plaque !== filterCamion) return false
    return true
  })

  const totalVente = filtered.reduce((s,l) => s+(l.total_vente||0), 0)
  const totalAchat = filtered.reduce((s,l) => s+(l.qte||0)*(l.prix_achat||0), 0)
  const totalMarge = totalVente - totalAchat
  const totalQte   = filtered.reduce((s,l) => s+(l.qte||0), 0)

  const byClient = {}
  filtered.forEach(l => {
    const key = l.client_nom || 'Sans client'
    if (!byClient[key]) byClient[key] = { nom: key, client_id: l.client_id, qte: 0, vente: 0, achat: 0, ops: [] }
    byClient[key].qte   += l.qte || 0
    byClient[key].vente += l.total_vente || 0
    byClient[key].achat += (l.qte||0) * (l.prix_achat||0)
    byClient[key].ops.push(l)
  })

  const uniqueClients = [...new Map(
    livraisons.filter(l => l.type_produit === tab && l.client_id)
      .map(l => [l.client_id, { id: l.client_id, nom: l.client_nom }])
  ).values()]
  const uniqueCamions = [...new Set(livraisons.map(l => l.voyages?.camion_plaque).filter(Boolean))].sort()

  // ── Saisie ventes (filtered) ──────────────────────────────────
  const filteredSaisie = saisieVentes.filter(v => {
    if (filterSaisieFrom   && v.date < filterSaisieFrom)   return false
    if (filterSaisieTo     && v.date > filterSaisieTo)     return false
    if (filterSaisieClient && String(v.client_id) !== filterSaisieClient) return false
    return true
  })

  const saisieTotal = filteredSaisie.reduce((s,v) => s + (v.total_vente || 0), 0)
  const saisieQte   = filteredSaisie.reduce((s,v) => s + (v.qte || 0), 0)

  const saisieUniqueClients = [...new Map(
    saisieVentes.filter(v => v.client_id)
      .map(v => [v.client_id, { id: v.client_id, nom: v.client_nom }])
  ).values()]

  // ── Edit handlers ─────────────────────────────────────────────
  function openEdit(v) {
    setEditRow(v)
    const isMdo    = ['mdo', 'gasoil', 'autre'].includes(v.type_entree)
    const isRemise = v.type_entree === 'remise'
    setEditForm({
      date:           v.date || '',
      type_brique_id: v.type_brique_id || '',
      qte:            v.qte || '',
      prix_vente:     v.prix_vente || '',
      prix_achat:     v.prix_achat || '',
      montant:        isMdo || isRemise ? (v.montant_mdo || '') : '',
      description:    v.description_mdo || '',
      note:           v.note || '',
    })
    setEditMsg('')
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editRow) return
    setEditSaving(true)
    const isMdo    = ['mdo', 'gasoil', 'autre'].includes(editRow.type_entree)
    const isRemise = editRow.type_entree === 'remise'

    let updateData = { date: editForm.date, note: editForm.note || null }
    let newTotalVente = editRow.total_vente || 0

    if (isMdo || isRemise) {
      const montant = parseFloat(editForm.montant) || 0
      updateData.montant_mdo       = montant
      updateData.description_mdo   = editForm.description || null
      updateData.total_vente       = isRemise ? -montant : montant
      updateData.total_achat       = 0
      updateData.marge             = isRemise ? -montant : montant
      newTotalVente = isRemise ? -montant : montant
    } else {
      const qte         = parseFloat(editForm.qte) || 0
      const pv          = parseFloat(editForm.prix_vente) || 0
      const pa          = parseFloat(editForm.prix_achat) || 0
      const total_vente = Math.round(qte * pv * 100) / 100
      const total_achat = Math.round(qte * pa * 100) / 100
      const marge       = Math.round((total_vente - total_achat) * 100) / 100
      const ty          = typeBriques.find(t => t.id === parseInt(editForm.type_brique_id))
      updateData = {
        ...updateData,
        type_brique_id: editForm.type_brique_id ? parseInt(editForm.type_brique_id) : editRow.type_brique_id,
        type_brique:    ty?.nom || editRow.type_brique,
        qte, prix_vente: pv, prix_achat: pa,
        total_vente, total_achat, marge,
      }
      newTotalVente = total_vente
    }

    const { error } = await supabase.from('ventes').update(updateData).eq('id', editRow.id)

    if (!error && editRow.client_id) {
      const oldAmount = ['mdo','gasoil','autre'].includes(editRow.type_entree) ? (editRow.montant_mdo || 0)
                      : editRow.type_entree === 'remise' ? -(editRow.montant_mdo || 0)
                      : (editRow.total_vente || 0)
      const newAmount = ['mdo','gasoil','autre'].includes(editRow.type_entree) ? (parseFloat(editForm.montant) || 0)
                      : editRow.type_entree === 'remise' ? -(parseFloat(editForm.montant) || 0)
                      : newTotalVente
      const diff = newAmount - oldAmount
      if (diff !== 0) {
        const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', editRow.client_id).single()
        if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) + diff }).eq('id', editRow.client_id)
      }
    }

    setEditSaving(false)
    if (error) {
      setEditMsg('❌ Erreur: ' + error.message)
    } else {
      setEditMsg('✅ Modifications enregistrées !')
      setTimeout(() => { setEditRow(null); setEditMsg('') }, 1000)
      loadAll()
    }
  }

  async function deleteVente(v) {
    if (!confirm(`Supprimer cette vente — ${v.client_nom} — ${fmtMoney(Math.abs(v.total_vente || v.montant_mdo || 0))} DHS ?`)) return
    const { error } = await supabase.from('ventes').delete().eq('id', v.id)
    if (error) { alert('Erreur suppression: ' + error.message); return }
    const amount = ['mdo','gasoil','autre'].includes(v.type_entree) ? (v.montant_mdo || 0)
                 : v.type_entree === 'remise' ? -(v.montant_mdo || 0)
                 : (v.total_vente || 0)
    if (v.client_id && amount !== 0) {
      const { data: freshCl } = await supabase.from('clients').select('solde').eq('id', v.client_id).single()
      if (freshCl) await supabase.from('clients').update({ solde: (freshCl.solde || 0) - amount }).eq('id', v.client_id)
    }
    loadAll()
  }

  // ── Print / Export ────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Date','Voyage','Client','Produit','Qte','Prix vente','Prix achat','Total vente','Marge','Note'],
      ...filtered.map(l => [
        fmtDate(l.date_livraison), l.voyages?.reference||l.voyage_id||'', l.client_nom||'',
        l.type_brique||l.type_produit, l.qte||0, fmtD(l.prix_vente), fmtD(l.prix_achat||0),
        l.total_vente||0, ((l.total_vente||0)-(l.qte||0)*(l.prix_achat||0)).toFixed(2), l.note||'',
      ])
    ]
    const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'}))
    a.download = `Livraisons-${tab}-${filterFrom}-${filterTo}.csv`
    a.click()
  }

  function printLivraisons() {
    const sections = Object.values(byClient).sort((a,b)=>b.vente-a.vente).map(cl => {
      const marge = cl.vente - cl.achat
      const rows = cl.ops.sort((a,b)=>(b.date_livraison||'').localeCompare(a.date_livraison||'')).map(l => {
        const m = (l.total_vente||0)-(l.qte||0)*(l.prix_achat||0)
        return '<tr>'
          + '<td>' + fmtDate(l.date_livraison) + '</td>'
          + '<td>' + (l.voyages?.reference||l.voyage_id||'—') + '</td>'
          + '<td>' + (l.type_brique||l.type_produit||'—') + '</td>'
          + '<td style="text-align:right">' + fmt(l.qte) + '</td>'
          + '<td style="text-align:right">' + fmtMoney(l.prix_vente) + '</td>'
          + '<td style="text-align:right"><b>' + fmtMoney(l.total_vente) + ' DHS</b></td>'
          + '<td style="text-align:right;color:#7c3aed">' + fmtMoney(m) + ' DHS</td>'
          + '<td>' + (l.note||'—') + '</td>'
          + '</tr>'
      }).join('')
      return '<div style="margin-bottom:20px;page-break-inside:avoid">'
        + '<div class="ch"><div style="font-size:13px;font-weight:800;color:#fff">👤 ' + cl.nom + '</div>'
        + '<div style="color:#fff;font-size:11px">' + cl.ops.length + ' livraison(s) · CA: ' + fmtMoney(cl.vente) + ' DHS · Marge: ' + fmtMoney(marge) + ' DHS</div></div>'
        + '<table><thead><tr>'
        + '<th>Date</th><th>Voyage</th><th>Produit</th>'
        + '<th style="text-align:right">Qté</th><th style="text-align:right">Prix/u</th>'
        + '<th style="text-align:right">Total DHS</th><th style="text-align:right">Marge</th><th>Note</th>'
        + '</tr></thead><tbody>' + rows + '</tbody>'
        + '<tfoot><tr><td colspan="3">TOTAL ' + cl.nom + '</td>'
        + '<td style="text-align:right">' + fmt(cl.qte) + '</td><td></td>'
        + '<td style="text-align:right">' + fmtMoney(cl.vente) + ' DHS</td>'
        + '<td style="text-align:right;color:#7c3aed">' + fmtMoney(marge) + ' DHS</td><td></td>'
        + '</tr></tfoot></table></div>'
    }).join('')

    const label = tab === 'brique' ? 'Livraisons Briques' : 'Livraisons Grignon'
    openPrint('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + label + '</title>'
      + '<style>' + PRINT_CSS + '</style></head><body>'
      + '<h1>🚚 ' + (tab === 'brique' ? 'DAR SADIK — ' : '') + label + '</h1>'
      + '<div class="sub">Période: ' + fmtDate(filterFrom) + ' → ' + fmtDate(filterTo)
      + ' · ' + filtered.length + ' livraison(s) · Généré le ' + new Date().toLocaleDateString('fr-MA') + '</div>'
      + (sections || '<p style="color:#aaa;text-align:center">Aucune livraison</p>')
      + '<div class="gt">'
      + '<div><b>TOTAL ' + label.toUpperCase() + '</b><br>'
      + '<span style="font-size:11px;opacity:0.8">' + filtered.length + ' livraison(s) · '
      + Object.keys(byClient).length + ' client(s) · ' + fmt(totalQte) + (tab==='grignon'?' kg':' u') + '</span></div>'
      + '<div style="text-align:right">'
      + '<div style="font-size:10px;opacity:0.7">CA / Coût / Marge</div>'
      + '<div style="font-size:18px;font-weight:900">' + fmtMoney(totalVente) + ' / ' + fmtMoney(totalAchat) + ' / ' + fmtMoney(totalMarge) + ' DHS</div>'
      + '</div></div>'
      + (tab === 'brique' ? '<div class="footer">DAR SADIK — Selouane, Nador | Dar.sadik@hotmail.com | 06 61 97 87 47</div>' : '')
      + '</body></html>')
  }

  function exportSaisieXLSX() {
    const detailRows = filteredSaisie.map(v => {
      const isMdo    = ['mdo','gasoil','autre'].includes(v.type_entree)
      const isRemise = v.type_entree === 'remise'
      return {
        'Date':        fmtDate(v.date),
        'Client':      v.client_nom || '',
        'Type':        isMdo    ? (v.type_entree === 'mdo' ? "Main d'oeuvre" : v.type_entree === 'gasoil' ? 'Frais Gasoil' : 'Autre charge')
                     : isRemise ? 'Remise'
                     : 'Vente brique',
        'Produit':     v.type_brique || '',
        'Camion':      v.camion_plaque || '',
        'Fournisseur': v.fournisseur || '',
        'Quantite':    isMdo || isRemise ? '' : (v.qte || 0),
        'Prix/u DHS':  isMdo || isRemise ? '' : (v.prix_vente || 0),
        'Total DHS':   isRemise ? -(v.montant_mdo || 0) : (v.total_vente || 0),
        'BON':         v.bon || '',
        'Description': v.description_mdo || '',
        'Note':        v.note || '',
      }
    })

    const tV  = filteredSaisie.reduce((s, v) => s + (v.total_vente || 0), 0)
    const tQ  = filteredSaisie.reduce((s, v) => s + (v.qte || 0), 0)
    detailRows.push({
      'Date': 'TOTAL', 'Client': `${filteredSaisie.length} entrée(s)`,
      'Type': '', 'Produit': '', 'Camion': '', 'Fournisseur': '',
      'Quantite': tQ, 'Prix/u DHS': '', 'Total DHS': tV,
      'BON': '', 'Description': '', 'Note': '',
    })

    // Recap par client
    const byClient = {}
    filteredSaisie.forEach(v => {
      const nom = v.client_nom || 'Inconnu'
      if (!byClient[nom]) byClient[nom] = { nb: 0, qte: 0, total: 0 }
      byClient[nom].nb    += 1
      byClient[nom].qte   += v.qte || 0
      byClient[nom].total += v.total_vente || 0
    })
    const clientRows = Object.entries(byClient)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nom, d]) => ({ 'Client': nom, 'Nb entrées': d.nb, 'Total briques': d.qte, 'Total DHS': d.total }))

    const wb  = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(detailRows)
    const ws2 = XLSX.utils.json_to_sheet(clientRows)
    ws1['!cols'] = [{wch:12},{wch:22},{wch:16},{wch:14},{wch:12},{wch:16},{wch:10},{wch:10},{wch:12},{wch:10},{wch:20},{wch:20}]
    ws2['!cols'] = [{wch:22},{wch:12},{wch:16},{wch:12}]
    XLSX.utils.book_append_sheet(wb, ws1, 'Ventes directes')
    XLSX.utils.book_append_sheet(wb, ws2, 'Recap clients')
    XLSX.writeFile(wb, `Ventes-directes-${filterSaisieFrom}-${filterSaisieTo}.xlsx`)
  }

  const TABS = [
    { key: 'brique',  label: '🧱 Livraisons Briques', color: '#1e3a5f' },
    { key: 'grignon', label: '🫒 Livraisons Grignon',  color: '#92400e' },
    { key: 'saisie',  label: '📋 Ventes directes',     color: '#166534' },
  ]

  // ── Type label helper ─────────────────────────────────────────
  function typeLabel(v) {
    if (v.type_entree === 'mdo')    return '🔧 Main d\'œuvre'
    if (v.type_entree === 'gasoil') return '⛽ Frais Gasoil'
    if (v.type_entree === 'autre')  return '📌 Autre charge'
    if (v.type_entree === 'remise') return '🎁 Remise'
    return v.type_brique || '—'
  }

  return (
    <Layout title="Livraisons" subtitle="Suivi centralisé des livraisons clients">

      {/* TABS */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-sm font-semibold px-5 py-2.5 rounded-xl border transition-all ${tab===t.key?'text-white border-transparent':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            style={tab===t.key?{background:t.color}:{}}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-center py-10 text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* ── VOYAGE LIVRAISONS TABS ── */}
          {(tab === 'brique' || tab === 'grignon') && (
            <>
              <div className="card mb-4 flex items-center gap-3" style={{background:'#eff6ff',border:'1px solid #bfdbfe'}}>
                <span className="text-2xl">ℹ️</span>
                <div className="flex-1">
                  <div className="font-semibold text-blue-800 text-sm">Données issues des Voyages</div>
                  <div className="text-xs text-blue-600 mt-0.5">Pour modifier ou supprimer, cliquez sur le numéro de voyage.</div>
                </div>
                <button onClick={() => router.push('/voyages')} className="btn-primary text-xs px-3 py-1.5" style={{background:'#1d4ed8'}}>→ Voyages</button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="stat-card border border-green-100 bg-green-50">
                  <div className="stat-label text-green-600">Chiffre d'affaires</div>
                  <div className="stat-value text-green-700">{fmtMoney(totalVente)} DHS</div>
                  <div className="stat-sub">{filtered.length} livraison(s)</div>
                </div>
                <div className="stat-card border border-red-100 bg-red-50">
                  <div className="stat-label text-red-600">Coût achats</div>
                  <div className="stat-value text-red-600">{fmtMoney(totalAchat)} DHS</div>
                  <div className="stat-sub">{fmt(totalQte)} {tab==='grignon'?'kg':'u'}</div>
                </div>
                <div className="stat-card border border-purple-100 bg-purple-50">
                  <div className="stat-label text-purple-600">Marge brute</div>
                  <div className="stat-value text-purple-700">{fmtMoney(totalMarge)} DHS</div>
                  <div className="stat-sub">{totalVente>0?Math.round(totalMarge/totalVente*100):0}%</div>
                </div>
                <div className="stat-card border border-blue-100 bg-blue-50">
                  <div className="stat-label text-blue-600">Clients actifs</div>
                  <div className="stat-value text-blue-700">{Object.keys(byClient).length}</div>
                  <div className="stat-sub">sur la période</div>
                </div>
              </div>

              <div className="card mb-4">
                <div className={`grid ${isMobile?'grid-cols-2':'grid-cols-2 lg:grid-cols-5'} gap-3 items-end`}>
                  <div><label className="label">Du</label><input type="date" className="input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/></div>
                  <div><label className="label">Au</label><input type="date" className="input" value={filterTo} onChange={e=>setFilterTo(e.target.value)}/></div>
                  <div><label className="label">Client</label>
                    <select className="input" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
                      <option value="">Tous</option>
                      {uniqueClients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select></div>
                  <div><label className="label">Camion</label>
                    <select className="input" value={filterCamion} onChange={e=>setFilterCamion(e.target.value)}>
                      <option value="">Tous</option>
                      {uniqueCamions.map(c=><option key={c}>{c}</option>)}
                    </select></div>
                  <div className="flex gap-2 items-end">
                    <button onClick={()=>{setFilterFrom(startOfMonth());setFilterTo(today());setFilterClient('');setFilterCamion('')}}
                      className="btn-secondary text-xs flex-1 justify-center">↺ Réinitialiser</button>
                    <button onClick={printLivraisons} className="btn-primary text-xs px-2 py-1.5" style={{background:'#4f46e5'}}>🖨️</button>
                    <button onClick={exportCSV} className="btn-primary text-xs px-2 py-1.5" style={{background:'#16a34a'}}>📊</button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {Object.values(byClient).sort((a,b)=>b.vente-a.vente).map(cl => {
                  const marge = cl.vente - cl.achat
                  return (
                    <div key={cl.nom} className="card">
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div>
                          <div className="font-bold text-gray-900">👤 {cl.nom}</div>
                          <div className="text-xs text-gray-400">{cl.ops.length} livraison(s) · {fmt(cl.qte)} {tab==='grignon'?'kg':'u'}</div>
                        </div>
                        <div className="flex gap-4 text-center flex-wrap">
                          <div><div className="text-xs text-gray-400">CA</div><div className="font-bold text-green-600">{fmtMoney(cl.vente)} DHS</div></div>
                          <div><div className="text-xs text-gray-400">Marge</div><div className="font-bold text-purple-600">{fmtMoney(marge)} DHS</div></div>
                          <div><div className="text-xs text-gray-400">%</div><div className="font-bold text-gray-700">{cl.vente>0?Math.round(marge/cl.vente*100):0}%</div></div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead><tr>
                            <th className="th">Date</th><th className="th">Voyage</th><th className="th">Produit</th>
                            <th className="th text-right">Qté</th><th className="th text-right">Prix/u</th>
                            <th className="th text-right">Total DHS</th><th className="th text-right">Marge</th><th className="th">Note</th>
                          </tr></thead>
                          <tbody>
                            {cl.ops.sort((a,b)=>(b.date_livraison||'').localeCompare(a.date_livraison||'')).map(l => {
                              const m = (l.total_vente||0)-(l.qte||0)*(l.prix_achat||0)
                              return (
                                <tr key={l.id} className="hover:bg-gray-50">
                                  <td className="td text-gray-500">{fmtDate(l.date_livraison)}</td>
                                  <td className="td">
                                    {l.voyage_id
                                      ? <button onClick={()=>router.push(`/voyages/${l.voyage_id}`)}
                                          className="text-xs text-blue-600 hover:underline font-semibold">
                                          {l.voyages?.reference||`#${l.voyage_id}`} ✏️
                                        </button>
                                      : '—'}
                                  </td>
                                  <td className="td text-xs"><span className="badge-gray">{l.type_brique||l.type_produit}</span></td>
                                  <td className="td text-right font-semibold">{fmt(l.qte)}</td>
                                  <td className="td text-right text-gray-500">{fmtMoney(l.prix_vente)}</td>
                                  <td className="td text-right font-bold text-green-600">{fmtMoney(l.total_vente)} DHS</td>
                                  <td className="td text-right font-semibold text-purple-600">{fmtMoney(m)} DHS</td>
                                  <td className="td text-gray-400 text-xs">{l.note||'—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot><tr>
                            <td className="tfoot-td" colSpan={3}>TOTAL {cl.nom}</td>
                            <td className="tfoot-td text-right">{fmt(cl.qte)}</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td text-right text-green-700">{fmtMoney(cl.vente)} DHS</td>
                            <td className="tfoot-td text-right text-purple-700">{fmtMoney(marge)} DHS</td>
                            <td className="tfoot-td"></td>
                          </tr></tfoot>
                        </table>
                      </div>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div className="card text-center py-12 text-gray-400">
                    <div className="text-4xl mb-3">🚚</div>
                    <div className="font-semibold">Aucune livraison pour cette période</div>
                    <button onClick={()=>router.push('/voyages')} className="btn-primary text-sm mt-4" style={{background:'#1d4ed8'}}>→ Créer un Voyage</button>
                  </div>
                )}
                {filtered.length > 0 && (
                  <div className="card" style={{background:'#1e3a5f',color:'#fff'}}>
                    <div className="flex justify-between items-center flex-wrap gap-3">
                      <div>
                        <div className="font-bold text-lg">TOTAL {tab==='brique'?'LIVRAISONS BRIQUES':'LIVRAISONS GRIGNON'}</div>
                        <div className="text-blue-200 text-sm">{filtered.length} livraison(s) · {Object.keys(byClient).length} client(s) · {fmt(totalQte)} {tab==='grignon'?'kg':'u'}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div><div className="text-blue-300 text-xs">CA</div><div className="font-bold text-xl">{fmtMoney(totalVente)} DHS</div></div>
                        <div><div className="text-blue-300 text-xs">Coût</div><div className="font-bold text-xl text-red-300">{fmtMoney(totalAchat)} DHS</div></div>
                        <div><div className="text-blue-300 text-xs">Marge</div><div className="font-bold text-xl text-green-300">{fmtMoney(totalMarge)} DHS</div></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── VENTES DIRECTES TAB ── */}
          {tab === 'saisie' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="stat-card border border-green-100 bg-green-50">
                  <div className="stat-label text-green-600">Total ventes directes</div>
                  <div className="stat-value text-green-700">{fmtMoney(saisieTotal)} DHS</div>
                  <div className="stat-sub">{filteredSaisie.length} entrée(s)</div>
                </div>
                <div className="stat-card border border-blue-100 bg-blue-50">
                  <div className="stat-label text-blue-600">Quantité briques</div>
                  <div className="stat-value text-blue-700">{fmt(saisieQte)}</div>
                  <div className="stat-sub">Ventes normales</div>
                </div>
                <div className="stat-card border border-gray-100 bg-gray-50">
                  <div className="stat-label text-gray-600">Total entrées</div>
                  <div className="stat-value text-gray-700">{saisieVentes.length}</div>
                  <div className="stat-sub">Toutes périodes</div>
                </div>
              </div>

              {/* Saisie filters */}
              <div className="card mb-4">
                <div className={`grid ${isMobile?'grid-cols-2':'grid-cols-2 lg:grid-cols-4'} gap-3 items-end`}>
                  <div><label className="label">Du</label><input type="date" className="input" value={filterSaisieFrom} onChange={e=>setFilterSaisieFrom(e.target.value)}/></div>
                  <div><label className="label">Au</label><input type="date" className="input" value={filterSaisieTo} onChange={e=>setFilterSaisieTo(e.target.value)}/></div>
                  <div><label className="label">Client</label>
                    <select className="input" value={filterSaisieClient} onChange={e=>setFilterSaisieClient(e.target.value)}>
                      <option value="">Tous</option>
                      {saisieUniqueClients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 items-end">
                    <button onClick={()=>{setFilterSaisieFrom(startOfMonth());setFilterSaisieTo(today());setFilterSaisieClient('')}}
                      className="btn-secondary text-xs flex-1 justify-center">↺ Réinitialiser</button>
                    <button onClick={exportSaisieXLSX}
                      className="btn-primary text-xs px-3 py-1.5" style={{background:'#16a34a'}}>
                      📥 Excel
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  {filteredSaisie.length} entrée(s) — {fmtMoney(saisieTotal)} DHS
                </div>
              </div>

              {/* Saisie table */}
              <div className="card">
                {isMobile ? (
                  <div className="space-y-3">
                    {filteredSaisie.length === 0 && (
                      <div className="text-center text-gray-400 py-8">Aucune vente directe pour cette période</div>
                    )}
                    {filteredSaisie.map(v => {
                      const isMdo    = ['mdo','gasoil','autre'].includes(v.type_entree)
                      const isRemise = v.type_entree === 'remise'
                      return (
                        <div key={v.id} className="mobile-row-card"
                          style={isMdo?{borderLeft:'3px solid #f59e0b'}:isRemise?{borderLeft:'3px solid #22c55e'}:{borderLeft:'3px solid #3b82f6'}}>
                          <div className="card-header">
                            <div>
                              <div className="card-title">{v.client_nom}</div>
                              <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{fmtDate(v.date)}</div>
                            </div>
                            <div className="card-amount" style={isRemise?{color:'#15803d'}:{}}>
                              {isRemise ? `− ${fmtMoney(v.montant_mdo)}` : fmtMoney(v.total_vente)} DHS
                            </div>
                          </div>
                          <div className="card-meta">
                            <span>{typeLabel(v)}</span>
                            {v.camion_plaque && <span>🚛 {v.camion_plaque}</span>}
                            {!isMdo && !isRemise && v.qte && <span>📏 {fmt(v.qte)} u</span>}
                            {(isMdo||isRemise) && v.description_mdo && <span>{v.description_mdo}</span>}
                          </div>
                          <div className="card-actions">
                            <button onClick={() => openEdit(v)} className="btn-secondary text-xs" style={{color:'#1a5fa8',borderColor:'#1a5fa8'}}>✏️ Modifier</button>
                            <button onClick={() => deleteVente(v)} className="btn-danger text-xs">✕ Supprimer</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Date</th>
                          <th className="th">Client</th>
                          <th className="th">Produit / Type</th>
                          <th className="th">Camion</th>
                          <th className="th text-right">Qté</th>
                          <th className="th text-right">Prix/u</th>
                          <th className="th text-right">Total DHS</th>
                          <th className="th">Note</th>
                          <th className="th"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSaisie.length === 0 && (
                          <tr><td colSpan={9} className="td text-center text-gray-400 py-8">Aucune vente directe pour cette période</td></tr>
                        )}
                        {filteredSaisie.map(v => {
                          const isMdo    = ['mdo','gasoil','autre'].includes(v.type_entree)
                          const isRemise = v.type_entree === 'remise'
                          return (
                            <tr key={v.id} className="hover:bg-gray-50"
                              style={isMdo?{background:'#fefce8'}:isRemise?{background:'#f0fdf4'}:{}}>
                              <td className="td text-gray-500">{fmtDate(v.date)}</td>
                              <td className="td font-semibold">{v.client_nom}</td>
                              <td className="td">
                                {isMdo
                                  ? <span className="font-bold" style={{color:'#92400e'}}>{typeLabel(v)}</span>
                                  : isRemise
                                  ? <span className="font-bold text-green-700">{typeLabel(v)}</span>
                                  : <span className="badge-gray">{v.type_brique||'—'}</span>
                                }
                              </td>
                              <td className="td text-gray-500 text-xs">{v.camion_plaque||'—'}</td>
                              <td className="td text-right">
                                {isMdo||isRemise ? <span className="text-gray-300">—</span> : fmt(v.qte)}
                              </td>
                              <td className="td text-right text-gray-500">
                                {isMdo||isRemise ? <span className="text-gray-300">—</span> : fmtMoney(v.prix_vente)}
                              </td>
                              <td className="td text-right font-bold" style={isRemise?{color:'#15803d'}:{}}>
                                {isRemise ? `− ${fmtMoney(v.montant_mdo)}` : fmtMoney(v.total_vente)}
                              </td>
                              <td className="td text-xs text-gray-400" style={{maxWidth:140,wordBreak:'break-word'}}>
                                {(isMdo||isRemise) && v.description_mdo ? v.description_mdo : (v.note||'—')}
                              </td>
                              <td className="td">
                                <div className="flex gap-1">
                                  <button onClick={() => openEdit(v)}
                                    className="btn-secondary text-xs px-2" style={{color:'#1a5fa8',borderColor:'#1a5fa8'}}>✏️</button>
                                  <button onClick={() => deleteVente(v)}
                                    className="btn-danger text-xs px-2">✕</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {filteredSaisie.length > 0 && (
                        <tfoot>
                          <tr>
                            <td className="tfoot-td" colSpan={4}>TOTAL ({filteredSaisie.length} entrées)</td>
                            <td className="tfoot-td text-right">{fmt(saisieQte)}</td>
                            <td className="tfoot-td"></td>
                            <td className="tfoot-td text-right">{fmtMoney(saisieTotal)} DHS</td>
                            <td className="tfoot-td" colSpan={2}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── EDIT MODAL ── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">✏️ Modifier la vente</h3>
                <div className="text-xs text-gray-500 mt-0.5">{editRow.client_nom}</div>
              </div>
              <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={saveEdit} className="p-5 space-y-3">
              <div>
                <label className="label">📅 Date</label>
                <input type="date" className="input" value={editForm.date}
                  onChange={e => setEditForm({...editForm, date: e.target.value})} required />
              </div>

              {/* Normal sale fields */}
              {!['mdo','gasoil','autre','remise'].includes(editRow.type_entree) && (
                <>
                  <div>
                    <label className="label">📦 Type brique</label>
                    <select className="input" value={editForm.type_brique_id}
                      onChange={e => setEditForm({...editForm, type_brique_id: e.target.value})}>
                      <option value="">— Sélectionner —</option>
                      {typeBriques.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Quantité</label>
                      <input type="number" className="input" step="1" min="0" value={editForm.qte}
                        onChange={e => setEditForm({...editForm, qte: e.target.value})} required />
                    </div>
                    <div>
                      <label className="label">Prix vente/u</label>
                      <input type="number" className="input" step="0.01" min="0" value={editForm.prix_vente}
                        onChange={e => setEditForm({...editForm, prix_vente: e.target.value})} required />
                    </div>
                    <div>
                      <label className="label">Prix achat/u</label>
                      <input type="number" className="input" step="0.01" min="0" value={editForm.prix_achat}
                        onChange={e => setEditForm({...editForm, prix_achat: e.target.value})} />
                    </div>
                  </div>
                  {editForm.qte && editForm.prix_vente && (
                    <div className="bg-gray-50 rounded-xl p-3 text-sm grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs text-gray-400">Total vente</div>
                        <div className="font-bold text-green-600">{fmtMoney(parseFloat(editForm.qte||0) * parseFloat(editForm.prix_vente||0))} DHS</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Total achat</div>
                        <div className="font-bold text-red-500">{fmtMoney(parseFloat(editForm.qte||0) * parseFloat(editForm.prix_achat||0))} DHS</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Marge</div>
                        <div className="font-bold text-purple-600">
                          {fmtMoney(parseFloat(editForm.qte||0) * parseFloat(editForm.prix_vente||0) - parseFloat(editForm.qte||0) * parseFloat(editForm.prix_achat||0))} DHS
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* MDO / autre / gasoil fields */}
              {['mdo','gasoil','autre'].includes(editRow.type_entree) && (
                <>
                  <div>
                    <label className="label">Montant DHS</label>
                    <input type="number" className="input" step="0.01" min="0" value={editForm.montant}
                      onChange={e => setEditForm({...editForm, montant: e.target.value})} required />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <input type="text" className="input" value={editForm.description}
                      onChange={e => setEditForm({...editForm, description: e.target.value})} />
                  </div>
                </>
              )}

              {/* Remise fields */}
              {editRow.type_entree === 'remise' && (
                <div>
                  <label className="label">Montant remise DHS</label>
                  <input type="number" className="input" step="0.01" min="0" value={editForm.montant}
                    onChange={e => setEditForm({...editForm, montant: e.target.value})} required />
                </div>
              )}

              <div>
                <label className="label">Note</label>
                <input type="text" className="input" value={editForm.note}
                  onChange={e => setEditForm({...editForm, note: e.target.value})} />
              </div>

              {editMsg && (
                <div className={`text-sm font-semibold px-3 py-2 rounded-lg ${editMsg.startsWith('✅')?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>
                  {editMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editSaving}
                  className="btn-primary flex-1 justify-center"
                  style={{background:'#1d4ed8'}}>
                  {editSaving ? 'Enregistrement...' : '✅ Enregistrer'}
                </button>
                <button type="button" onClick={() => setEditRow(null)} className="btn-secondary flex-1 justify-center">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </Layout>
  )
}

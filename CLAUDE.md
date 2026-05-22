# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Next.js)
npm run build    # Production build
npm run start    # Start production server
```

No test suite or linter is configured.

## Environment Variables

Create a `.env.local` file with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Architecture

**Stack:** Next.js 14 (Pages Router) · Supabase (auth + Postgres) · Tailwind CSS · Recharts

**Auth flow** (`pages/_app.js`):
- All pages are wrapped in `AuthContext`. Unauthenticated users see a login/register form — no per-page redirects.
- After sign-in, `checkAccess()` verifies the email exists in `allowed_users` table. Super-admin (`abdelhafidbaadi@gmail.com`) bypasses this and gains `/admin`.
- `useAuth()` exports `{ user, supabase }` for all pages/components.

**Layout** (`components/Layout.js`):
- Single shared layout with collapsible sidebar (desktop) and bottom nav + slide-in drawer (mobile).
- Responsive breakpoint is `window.innerWidth < 768` (JS-driven, not CSS-only).

**Pages / Modules:**

| Route | Description |
|---|---|
| `/` | Dashboard — KPIs, recent voyages, client debt summary |
| `/voyages` | Voyage list with creation |
| `/voyages/[id]` | Voyage detail — achats, livraisons, gasoil, charges, retours |
| `/clients` | Brick clients with running balance (`solde`) |
| `/paiements` | Client payment recording + grignon client payments |
| `/ventes` | Sales (brick deliveries) |
| `/retours` | Return merchandise |
| `/gasoil` | Fuel log |
| `/charges` | Expense tracking |
| `/grignon` | Olive pomace module — fully isolated from brique tables |
| `/rentabilite` | Profitability analysis with Recharts |
| `/parametres` | App settings |
| `/admin` | Super-admin only: manage `allowed_users` |

## Two completely separate business lines

**BRIQUES** uses: `clients`, `fournisseurs`, `type_briques`, `ventes`, `paiements`, `camions`, `gasoil`, `charges`, `retours_transport`

**GRIGNON** uses: `grignon_clients`, `grignon_fournisseurs`, `grignon_camions`, `grignon_operations`, `grignon_fournisseur_paiements`, `grignon_paiements`

**Never mix these.** A brique fournisseur (Nova, Dura) is NOT a grignon fournisseur. Type briques (B12, B10, B7, GF1) are NOT grignon clients.

## Voyage module data flow

Each voyage save writes to TWO tables:

| Action | Voyage table | Also writes to |
|---|---|---|
| Achat | `voyage_achats` | — |
| Livraison brique | `voyage_livraisons` | `ventes` + updates `clients.solde` |
| Livraison grignon | `voyage_livraisons` | `grignon_operations` + updates `grignon_clients.solde` |
| Gasoil | `voyage_gasoil` | `gasoil` + updates `camions` stats |
| Retour | `voyage_retours` | `retours_transport` |
| Charge facturée client | `voyage_charges` | `ventes` (type_entree='mdo') + updates `clients.solde` |

**Save order matters for link-back ids:**
- Save to global table first (gasoil, retours_transport) → get the returned id
- Then insert into voyage_* table with `gasoil_id` / `retour_id` pointing back
- These link ids are required for proper deletion (delGasoil, delRetour)

## Profit formula per voyage

```
REVENU BRUT  = Σ voyage_livraisons.total_vente
             + Σ voyage_retours.montant_paye
             + Σ voyage_charges.montant WHERE facture_client=true

COÛT TOTAL   = Σ voyage_achats.total_achat        ← use voyage_achats, NOT livraisons
             + Σ voyage_gasoil.total
             + Σ voyage_charges.montant WHERE facture_client=false

PROFIT NET   = REVENU BRUT − COÛT TOTAL
MARGE %      = PROFIT NET / REVENU BRUT × 100
```

Gasoil and fixed charges are split **equally** among the number of unique clients on the voyage (for per-client breakdown).

## Critical gotcha: Promise.all order in loadVoyage

`pages/voyages/[id].js` loads 12 queries in one `Promise.all`. The destructuring variables (`ty`, `gc`) must match the query order exactly:

```js
// Correct order — do NOT swap these two lines:
supabase.from('type_briques').select('*'),      // → ty → setTypeBriques(ty)
supabase.from('grignon_clients').select('*'),   // → gc → setGrignonClients(gc)
```

Swapping them causes `typeBriques` state to contain grignon client names and vice versa — the form dropdowns show wrong data silently.

## Computed columns stored on insert

These values are computed in JS and explicitly saved (they are NOT PostgreSQL GENERATED columns):

- `voyage_achats.total_achat` = `qte × prix_achat`
- `voyage_livraisons.total_vente` = `qte × prix_vente − remise`
- `voyage_livraisons.total_achat` = `qte × prix_achat`
- `voyage_livraisons.marge` = `total_vente − total_achat`
- `voyage_gasoil.total` = `qte_litres × prix_unitaire`

If any of these are missing from an insert, profit calculations silently read 0.

## Remise (discount)

In the voyage livraison context: `remise` is an inline field on the livraison row — `total_vente = qte × prix_vente − remise`. It is saved directly to `voyage_livraisons.remise`.

This is different from the `/ventes` page where remise is a separate transaction row with `type_entree: 'remise'`.

## Required SQL (run in Supabase if not already applied)

```sql
-- Stored computed columns on voyage_livraisons
ALTER TABLE voyage_livraisons ADD COLUMN IF NOT EXISTS remise      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE voyage_livraisons ADD COLUMN IF NOT EXISTS total_vente NUMERIC(12,2) DEFAULT 0;
ALTER TABLE voyage_livraisons ADD COLUMN IF NOT EXISTS total_achat NUMERIC(12,2) DEFAULT 0;
ALTER TABLE voyage_livraisons ADD COLUMN IF NOT EXISTS marge       NUMERIC(12,2) DEFAULT 0;

-- Stored computed column on voyage_achats
ALTER TABLE voyage_achats ADD COLUMN IF NOT EXISTS total_achat NUMERIC(12,2) DEFAULT 0;

-- Stored total on voyage_gasoil (if not GENERATED)
ALTER TABLE voyage_gasoil ADD COLUMN IF NOT EXISTS total     NUMERIC(12,2) DEFAULT 0;

-- Link columns for cascade deletes
ALTER TABLE voyage_gasoil  ADD COLUMN IF NOT EXISTS gasoil_id BIGINT;
ALTER TABLE voyage_retours ADD COLUMN IF NOT EXISTS retour_id BIGINT;
ALTER TABLE voyage_retours ADD COLUMN IF NOT EXISTS destination TEXT;

-- Grignon client payments
CREATE TABLE IF NOT EXISTS grignon_paiements (
  id         BIGSERIAL PRIMARY KEY,
  date       DATE NOT NULL,
  client_id  BIGINT REFERENCES grignon_clients(id) ON DELETE SET NULL,
  client_nom TEXT,
  mode       TEXT DEFAULT 'Espèce',
  montant    NUMERIC(12,2),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Formatting conventions

- `fmt(n)` — rounds to integer, formats with `fr-MA` locale (e.g. `1 234`)
- `fmtDate(d)` — converts `YYYY-MM-DD` to `DD/MM/YYYY`
- Currency is always DHS (Moroccan Dirham)
- UI language is French

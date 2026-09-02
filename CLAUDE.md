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
| `/grignon` | Grignon reference data only — create/edit/activate/search `grignon_clients` & `grignon_fournisseurs`. No operational entry (see below). |
| `/clients/grignon` | Grignon client statement — unified timeline (historical + Voyage-sourced `grignon_operations`, plus `grignon_paiements`) |
| `/fournisseurs/grignon` | Grignon fournisseur statement — unified timeline (`grignon_operations` + merged payments, see below) |
| `/rentabilite` | Profitability analysis with Recharts |
| `/parametres` | App settings |
| `/admin` | Super-admin only: manage `allowed_users` |

## Two completely separate business lines

**BRIQUES** uses: `clients`, `fournisseurs`, `type_briques`, `ventes`, `paiements`, `camions`, `gasoil`, `charges`, `retours_transport`

**GRIGNON** uses: `grignon_clients`, `grignon_fournisseurs`, `grignon_camions`, `grignon_operations`, `grignon_fournisseur_paiements`, `grignon_paiements`

**Never mix these.** A brique fournisseur (Nova, Dura) is NOT a grignon fournisseur. Type briques (B12, B10, B7, GF1) are NOT grignon clients.

### Grignon: Voyage is the only operational source

All grignon achats/livraisons are created from a Voyage (`lib/services/voyage/achats.js`, `lib/services/voyage/livraisons.js`), which mirror into `grignon_operations` (with `voyage_id` set — best-effort, retried without that column if the migration hasn't run yet). `/grignon` no longer has a saisie/edit/delete UI for operations — it's reference-data only (clients & fournisseurs: create, edit, activate/deactivate via `actif`, search — see `sql/13_grignon_master_data.sql`). `grignon_camions` and the old direct-entry dashboard were retired; Voyage camion selection uses the main `camions` table.

Grignon client/fournisseur payments are recorded from `/paiements` (client payments → `grignon_paiements`; fournisseur payments → `paiements` with `type_compte='fourn_grignon'`), never from `/grignon`. **Historical exception:** fournisseur-grignon payments entered before this change live in the legacy `grignon_fournisseur_paiements` table — `pages/fournisseurs/grignon.js` merges both tables into one displayed timeline so old and new payments show up together (see `sql/01_fournisseurs_snapshot_and_reconcile.sql` for how `grignon_fournisseurs.solde` already reconciles both sources). When touching fournisseur-grignon payment display/logic, always account for both tables — querying only one silently hides real payments without affecting the (correct) balance, which is exactly the bug this merge fixes.

### Grignon mirror links — always update/delete by exact id, never by client+date

`voyage_achats` ↔ `grignon_operations` (achats) has always had a proper link column (`voyage_achats.grignon_operation_id`, `sql/08_transaction_mirror_links.sql`). `voyage_livraisons` ↔ `grignon_operations` (client deliveries) did **not** — until `sql/14_grignon_livraison_link.sql` added `voyage_livraisons.grignon_operation_id` and `grignon_operations.voyage_id`. Before that migration, `updateLiv`/`delLiv` (`lib/services/voyage/livraisons.js`) and the `delete_voyage_livraison`/`delete_voyage` RPCs (`supabase_rpc.sql`) fell back to matching the mirror row by `client_id + date` alone — not unique, so editing/deleting one grignon livraison could silently corrupt or delete an unrelated `grignon_operations` row (a different voyage's entry, or historical data) for the same client on the same day. That was the real cause of grignon records "disappearing" — not a query bug in `/clients/grignon` or `/fournisseurs/grignon`, which already read `grignon_operations` correctly.

**Rule going forward:** any code that updates/deletes a grignon mirror row must use the id link (`old.grignon_operation_id` on the `voyage_livraisons`/`voyage_achats` side) as the primary path. The client_id+date(+qte) match must only ever be a fallback for rows saved before the link existed (no backfill was run — same precedent as `sql/08`), never the default.

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

## Frais supplémentaires & déductions par livraison

Each livraison can carry optional extra movements that adjust what's billed to the client:

- **Charges** (`kind='charge'`, labels in `FRAIS_LABELS`) — increase the client's balance. E.g. Frais Transport, Frais Gasoil, Frais Ouvriers.
- **Deductions** (`kind='deduction'`, labels in `DEDUCTION_LABELS`) — decrease the client's balance. E.g. Transport payé, Transport + Ouvriers. These are **not** payments and are never written to `paiements`.

Both kinds live in the same `voyage_livraison_frais` table (FK → `voyage_livraisons.id`, CASCADE DELETE), distinguished only by the `kind` column. `montant` is always stored as a positive magnitude — `kind` alone determines the sign used when summing.

- `voyage_livraisons.frais_total` = Σ(charge montants) − Σ(deduction montants) — a **net signed** total, not a plain sum
- `voyage_livraisons.deductions_total` = Σ(deduction montants) only, always ≥ 0 (`sql/24_livraison_deductions_total.sql`) — exists solely so profitability (below) can add deductions back out of revenue; never used for client billing
- `ventes.frais_note` stores a text summary with deductions prefixed `-` (e.g. "Frais Transport 300 DHS · Transport payé -4 000 DHS")
- `accounting_total = total_vente + frais_total` — this is what is billed to the client and stored in `ventes.total_vente` and used to update `clients.solde` (unchanged formula — deductions simply make `frais_total` negative)
- Shared UI editor: `components/voyage/FraisEditor.js`, used by both the create form (`LivraisonSection.js`) and the edit modal (`voyages/[id].js`)

**Two different presentations of the same underlying rows:**

- **Voyage detail** (`components/voyage/LivraisonSection.js`) shows them as indented (↳) child rows directly beneath their delivery — this is a per-voyage itemized view, not a ledger.
- **Client Statement** (`pages/clients/index.js`, both chrono and presentation mode, screen + print/PDF) shows each one as its own full top-level movement, laid out exactly like a Livraison or Paiement row (same columns, typography, badge style) — not nested. This is done by `expandVenteEntry()`, called from both `buildLedger()` and `buildPresentationLedger()`: it takes one `ventes` row and splits its single `total_vente` into a "Livraison" entry (`total_vente − net frais`) plus one entry per attached frais/déduction item (`type: 'frais-charge'` or `'frais-deduction'`), all dated the same as the delivery. The split deltas always sum back to the original `v.total_vente` exactly, so this is presentation-only — no balance, total, or the `balance += e.delta` reduce itself is changed. Each split entry gets its own `eKey` (`frais:<voyage_livraison_frais.id>`), so in presentation mode it can be independently reordered/selected/printed just like any other movement.
- `frais-charge` entries are styled identically to `vente`/Livraison rows (blue badge, `+` delta); `frais-deduction` entries are styled identically to `paiement` rows (green badge + row tint, `−` delta).

Revenue formula on `voyage_livraisons`:
```
REVENU LIVRAISON = total_vente + frais_total   (frais_total may be negative when deductions outweigh charges)
```

## Fuel consumption model (real refueling-based)

Single authoritative model — **REFUEL → VOYAGES → NEXT REFUEL** — implemented in `lib/services/fuelPeriods.js` (the shared "what counts as a refuel boundary" predicate: `isRefuelRow`/`aggregateDailyRefuels`) and consumed by three places that used to each implement their own, disagreeing direction:

- `lib/services/fuelAllocation.js` — per-voyage fuel **cost** (money engine). A refuel's own total is distributed, distance-proportionally, across the voyages that happened *since the previous refuel* — never voyages that come after it. A refuel measures what was already burned, it is never treated as funding what comes next. Feeds `profitability.js`, Rentabilité, Review, dashboards — no separate money formula anywhere else.
- `lib/services/fuelCycles.js` — per-truck **measured consumption**, the Truck Control Center at `/carburant`: a closed cycle's litres/coût/L-per-100km come from the refuel that *closes* it, never the one that opens it.
- `lib/camionPerformance.js` — the same rule, lightweight version feeding `/camions`.

**There is no full-tank requirement.** Any diesel purchase with a KM reading can open/close a period — a partial top-up is just as valid a boundary as a full one, it only needs a KM reading (`fuelPeriods.js:isRefuelRow`).

**Same-date refuels for the same truck are always ONE fuel event** (`fuelPeriods.js:aggregateDailyRefuels`) — mandatory, never a user choice: 100L + 50L entered as two separate `gasoil` rows on the same date sum to 150L for every period/consumption/allocation calculation, exactly as if it had been entered as one row. The individual rows are preserved as-is in the database for accounting/audit purposes (supplier ledger, `/gasoil`'s own list); only the consumption/allocation engines aggregate them. A manual link (`voyage_gasoil`) to any one of the aggregated rows resolves to the whole aggregate's total, not just that row's own slice (see `fuelAllocation.js`'s `eventIdForRow`).

**Open vs. closed periods:**
- *Closed* — a refuel event exists both before and after: real consumption = the closing event's own (aggregated) litres/cost; distance = the km gap between the two events. Cent-exact: `distributeFuelPurchase` (`fuelAllocation.js`) guarantees Σ(voyage allocations) = the closing event's total, no rounding loss.
- *Open* — only the most recent refuel event exists: voyages since it and distance-so-far are known, but real consumption is **never fabricated**. Automatic-mode voyages here get fuel cost = 0/pending (`voyageKmFuel.js`'s `pending_measurement` status, "⏳ En attente du prochain plein") until a later refuel closes the period — cost/profit for that period's voyages then recompute automatically on the next read, since nothing here is persisted; everything is derived live from `gasoil`/`voyages`.
- A truck's very first refuel event closes nothing (no prior boundary to measure from) — it's a reference starting point only.

**Manual overrides stay independent of the period model, on purpose**: `voyage_gasoil` links, `fuel_mode = 'manual_km'` / `'manual_fixed'` (an approximate distance or a fixed DHS slice charged against a manually-chosen plein), and `'manual_rate'` / `'manual_amount'` (fully independent, never touch the allocation engine) all keep working exactly as before, regardless of whether the purchase they reference has closed a period yet — a dispatcher's manual correction is never blocked by the measurement model.

## Profit formula per voyage

```
REVENU BRUT  = Σ (voyage_livraisons.total_vente + voyage_livraisons.frais_total + voyage_livraisons.deductions_total)
             + Σ voyage_retours.montant_paye
             + Σ voyage_charges.montant WHERE facture_client=true

COÛT TOTAL   = Σ voyage_achats.total_achat        ← use voyage_achats, NOT livraisons
             + Σ voyage_gasoil.total
             + Σ voyage_charges.montant WHERE facture_client=false

PROFIT NET   = REVENU BRUT − COÛT TOTAL
MARGE %      = PROFIT NET / REVENU BRUT × 100
```

`frais_total + deductions_total` cancels the deduction back out of `frais_total`, leaving charges-only revenue (`frais_total = charges − deductions`, so `frais_total + deductions_total = charges`). A "Transport payé" déduction reduces what the client owes (`accounting_total`, `clients.solde`, client statement — via `frais_total` alone, unchanged) but is money the client already paid directly, not a company cost — so it must never reduce PROFIT NET. `lib/services/profitability.js`'s `computeVoyageProfit` is the only place this addback happens; every other consumer of `frais_total` (client statement, per-livraison billing display, dashboard activity feed) is unaffected and keeps using the plain net total.

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
- `voyage_livraisons.total_vente` = `qte × prix_vente − remise`   ← product total only (no frais)
- `voyage_livraisons.total_achat` = `qte × prix_achat`
- `voyage_livraisons.marge` = `total_vente − total_achat`
- `voyage_livraisons.frais_total` = Σ charges − Σ deductions on this livraison (net signed, see below)
- `voyage_livraisons.deductions_total` = Σ deductions on this livraison only (≥ 0, profitability addback only — see below)
- `voyage_gasoil.total` = `qte_litres × prix_unitaire`
- `ventes.total_vente` = `voyage_livraisons.total_vente + frais_total` (full amount billed to client)

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

-- Extra charges per livraison (frais supplémentaires)
ALTER TABLE voyage_livraisons ADD COLUMN IF NOT EXISTS frais_total NUMERIC(12,2) DEFAULT 0;
ALTER TABLE ventes             ADD COLUMN IF NOT EXISTS note        TEXT;
ALTER TABLE ventes             ADD COLUMN IF NOT EXISTS frais_note  TEXT;

CREATE TABLE IF NOT EXISTS voyage_livraison_frais (
  id           BIGSERIAL PRIMARY KEY,
  livraison_id BIGINT REFERENCES voyage_livraisons(id) ON DELETE CASCADE,
  label        TEXT          NOT NULL,
  montant      NUMERIC(12,2) NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Customer deductions on livraison (see sql/05_livraison_deductions.sql):
-- kind='charge' (default, existing rows) increases balance; kind='deduction' decreases it.
ALTER TABLE voyage_livraison_frais ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'charge';  -- 'charge' | 'deduction'
```

Newer migrations that aren't folded into the block above live as standalone numbered files in `sql/` (e.g. `sql/05_livraison_deductions.sql`) — check that folder for anything not reflected here.

## Formatting conventions

- `fmt(n)` — rounds to integer, formats with `fr-MA` locale (e.g. `1 234`)
- `fmtDate(d)` — converts `YYYY-MM-DD` to `DD/MM/YYYY`
- Currency is always DHS (Moroccan Dirham)
- UI language is French

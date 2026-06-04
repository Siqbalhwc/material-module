# Material Management Module

A standalone Next.js + FastAPI + Supabase app for tracking material flow
from raw input to dispatch — following the **O + R – C** formula at every stage.

---

## Flow Stages

```
Material → Material Store → Production Storage → WIP ↔ RC Store → Finished Goods → Dispatch
  (Gate Pass)  (Requisition)                  (WIP Batch)         (FG Transfer)   (DO)
```

---

## Tech Stack

| Layer     | Technology                      |
|-----------|---------------------------------|
| Frontend  | Next.js 14 (App Router)         |
| Backend   | FastAPI (Python)                |
| Database  | Supabase (PostgreSQL)           |
| Auth      | Supabase Auth                   |
| Hosting   | Vercel (frontend) + Railway/Fly (backend) |

---

## Getting Started

### 1. Set up Supabase
1. Create a new Supabase project
2. Open the SQL editor and run `schema.sql` (included at root)
3. Copy your project URL and anon key

### 2. Configure environment
```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# Set NEXT_PUBLIC_API_URL to your FastAPI backend URL
```

### 3. Install & run
```bash
npm install
npm run dev
# Opens at http://localhost:3000
```

### 4. FastAPI Backend
```bash
cd backend/          # your FastAPI project
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Module Map

| Module          | Route              | Stage     |
|-----------------|--------------------|-----------|
| Dashboard       | `/dashboard`       | Overview  |
| Inward Gate Pass| `/gate-pass`       | 1 → 2     |
| Requisitions    | `/requisitions`    | 2 → 3     |
| WIP Batches     | `/wip`             | 3 → 4     |
| RC Store        | `/rc-store`        | 4 ↔ WIP   |
| Finished Goods  | `/finished-goods`  | 4 → 5     |
| Dispatch        | `/dispatch`        | 5 → 6     |
| Stock Balance   | `/stock-balance`   | All stores|
| Products        | `/products`        | Master    |

---

## Linking to OneAccounts (future)

To connect this module to your existing OneAccounts system:

1. Add `company_id UUID` column to all tables
2. Reference the `companies` table from OneAccounts DB (or via API)
3. Update Supabase RLS policies to filter by `company_id`
4. Uncomment the migration SQL at the bottom of `schema.sql`

---

## Stock Formula

Every movement writes to the `stock_ledger` table with a `direction` of +1 (in) or -1 (out).

```
Balance = SUM(quantity * direction)  →  O + R – C
```

Tables that write to stock_ledger:
- `inward_gate_passes` → +received into material_store
- `requisitions` → -issued from material_store, +received into production_storage
- `wip_batches` → -consumed from production_storage
- `rc_movements` → ±rc_store
- `fg_transfers` → +received into finished_goods
- `dispatch_orders` → -dispatched from finished_goods

-- ============================================================
--  Material Management Module — Supabase Schema
--  Single-tenant (no company_id) — easy to add later
--  Stack: Next.js + FastAPI + Supabase
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum Types ───────────────────────────────────────────────
CREATE TYPE store_type AS ENUM (
  'material_store',
  'production_storage',
  'wip',
  'rc_store',
  'finished_goods'
);

CREATE TYPE transaction_type AS ENUM (
  'opening',
  'received',
  'issued',
  'returned',
  'adjusted',
  'dispatched'
);

CREATE TYPE requisition_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'issued',
  'rejected',
  'cancelled'
);

CREATE TYPE dispatch_status AS ENUM (
  'pending',
  'loaded',
  'dispatched',
  'delivered'
);

CREATE TYPE uom AS ENUM (
  'kg',
  'bags',
  'litres',
  'units',
  'metres',
  'pcs'
);

-- ============================================================
--  CORE MASTER TABLES
-- ============================================================

-- ── Products / Materials ─────────────────────────────────────
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,           -- e.g. 'PP Dana', 'Ink', 'RC'
  uom           uom  NOT NULL,
  is_rc         BOOLEAN NOT NULL DEFAULT FALSE,  -- returnable component?
  reorder_level NUMERIC(12,3) DEFAULT 0,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Suppliers / Vendors ──────────────────────────────────────
CREATE TABLE suppliers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  contact     TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Customers ────────────────────────────────────────────────
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  contact     TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users (references Supabase Auth) ────────────────────────
CREATE TABLE app_users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'operator',  -- admin, store_keeper, production, qc, dispatch
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  INVENTORY — STORE BALANCES (O + R – C view source)
-- ============================================================

-- ── Stock Ledger (every movement recorded here) ──────────────
CREATE TABLE stock_ledger (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id       UUID NOT NULL REFERENCES products(id),
  store            store_type NOT NULL,
  txn_type         transaction_type NOT NULL,
  quantity         NUMERIC(12,3) NOT NULL,          -- always positive
  direction        SMALLINT NOT NULL CHECK (direction IN (1, -1)),  -- 1=in, -1=out
  reference_type   TEXT,          -- 'gate_pass', 'requisition', 'wip_batch', etc.
  reference_id     UUID,          -- FK to the source document
  notes            TEXT,
  performed_by     UUID REFERENCES app_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Materialized balance view per product per store ──────────
CREATE VIEW stock_balance AS
  SELECT
    product_id,
    store,
    SUM(quantity * direction) AS balance
  FROM stock_ledger
  GROUP BY product_id, store;

-- ============================================================
--  STAGE 1 → 2 : INWARD GATE PASS
-- ============================================================

CREATE TABLE inward_gate_passes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  igp_number      TEXT NOT NULL UNIQUE,   -- system generated, e.g. IGP-2024-0001
  supplier_id     UUID REFERENCES suppliers(id),
  vehicle_number  TEXT NOT NULL,
  driver_name     TEXT,
  received_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','verified','approved','rejected')),
  notes           TEXT,
  verified_by     UUID REFERENCES app_users(id),
  approved_by     UUID REFERENCES app_users(id),
  verified_at     TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES app_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE igp_line_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  igp_id        UUID NOT NULL REFERENCES inward_gate_passes(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id),
  expected_qty  NUMERIC(12,3),
  received_qty  NUMERIC(12,3) NOT NULL,
  uom           uom NOT NULL,
  batch_number  TEXT,
  expiry_date   DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  STAGE 2 → 3 : MATERIAL REQUISITION
-- ============================================================

CREATE TABLE requisitions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  req_number       TEXT NOT NULL UNIQUE,   -- e.g. REQ-2024-0001  (system generated)
  from_store       store_type NOT NULL DEFAULT 'material_store',
  to_store         store_type NOT NULL DEFAULT 'production_storage',
  requested_by     UUID REFERENCES app_users(id),
  approved_by      UUID REFERENCES app_users(id),
  issued_by        UUID REFERENCES app_users(id),
  status           requisition_status NOT NULL DEFAULT 'draft',
  required_date    DATE,
  notes            TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at      TIMESTAMPTZ,
  issued_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE requisition_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id),
  requested_qty  NUMERIC(12,3) NOT NULL,
  approved_qty   NUMERIC(12,3),
  issued_qty     NUMERIC(12,3),
  uom            uom NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  STAGE 3 → 4 : WIP BATCHES
-- ============================================================

CREATE TABLE wip_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_number    TEXT NOT NULL UNIQUE,  -- e.g. WIP-2024-0001
  product_id      UUID NOT NULL REFERENCES products(id),  -- what's being produced
  planned_qty     NUMERIC(12,3) NOT NULL,
  actual_qty      NUMERIC(12,3),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','in_progress','completed','on_hold','cancelled')),
  production_line TEXT,
  supervisor      UUID REFERENCES app_users(id),
  notes           TEXT,
  created_by      UUID REFERENCES app_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Materials consumed per WIP batch
CREATE TABLE wip_material_consumption (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id     UUID NOT NULL REFERENCES wip_batches(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  planned_qty  NUMERIC(12,3),
  consumed_qty NUMERIC(12,3) NOT NULL,
  uom          uom NOT NULL,
  recorded_by  UUID REFERENCES app_users(id),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  STAGE 4 ↔ RC : RC STORE MOVEMENTS
-- ============================================================

CREATE TABLE rc_movements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref_number   TEXT NOT NULL UNIQUE,   -- e.g. RC-2024-0001
  product_id   UUID NOT NULL REFERENCES products(id),
  batch_id     UUID REFERENCES wip_batches(id),
  direction    TEXT NOT NULL CHECK (direction IN ('return_from_wip', 'issue_to_wip')),
  quantity     NUMERIC(12,3) NOT NULL,
  uom          uom NOT NULL,
  reason       TEXT,
  performed_by UUID REFERENCES app_users(id),
  approved_by  UUID REFERENCES app_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  STAGE 4 → 5 : FINISHED GOODS TRANSFER
-- ============================================================

CREATE TABLE fg_transfers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref_number     TEXT NOT NULL UNIQUE,  -- e.g. FGT-2024-0001
  batch_id       UUID REFERENCES wip_batches(id),
  product_id     UUID NOT NULL REFERENCES products(id),
  quantity       NUMERIC(12,3) NOT NULL,
  uom            uom NOT NULL,
  qc_passed      BOOLEAN NOT NULL DEFAULT FALSE,
  qc_notes       TEXT,
  qc_by          UUID REFERENCES app_users(id),
  transferred_by UUID REFERENCES app_users(id),
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  STAGE 5 → 6 : DISPATCH
-- ============================================================

CREATE TABLE dispatch_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  do_number       TEXT NOT NULL UNIQUE,   -- e.g. DO-2024-0001
  customer_id     UUID REFERENCES customers(id),
  vehicle_number  TEXT,
  driver_name     TEXT,
  transporter     TEXT,
  status          dispatch_status NOT NULL DEFAULT 'pending',
  delivery_date   DATE,
  challan_number  TEXT UNIQUE,
  invoice_number  TEXT UNIQUE,
  notes           TEXT,
  loaded_by       UUID REFERENCES app_users(id),
  dispatched_by   UUID REFERENCES app_users(id),
  loaded_at       TIMESTAMPTZ,
  dispatched_at   TIMESTAMPTZ,
  created_by      UUID REFERENCES app_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dispatch_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_order_id UUID NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(12,3) NOT NULL,
  uom               uom NOT NULL,
  batch_number      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  SEQUENCES FOR HUMAN-READABLE NUMBERS
-- ============================================================

CREATE SEQUENCE igp_seq START 1;
CREATE SEQUENCE req_seq START 1;
CREATE SEQUENCE wip_seq START 1;
CREATE SEQUENCE rc_seq  START 1;
CREATE SEQUENCE fgt_seq START 1;
CREATE SEQUENCE do_seq  START 1;

-- Auto-generate document numbers via triggers
CREATE OR REPLACE FUNCTION set_igp_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.igp_number := 'IGP-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('igp_seq')::TEXT, 4, '0');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_igp_number BEFORE INSERT ON inward_gate_passes
  FOR EACH ROW WHEN (NEW.igp_number IS NULL OR NEW.igp_number = '') EXECUTE FUNCTION set_igp_number();

CREATE OR REPLACE FUNCTION set_req_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.req_number := 'REQ-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('req_seq')::TEXT, 4, '0');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_req_number BEFORE INSERT ON requisitions
  FOR EACH ROW WHEN (NEW.req_number IS NULL OR NEW.req_number = '') EXECUTE FUNCTION set_req_number();

CREATE OR REPLACE FUNCTION set_wip_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.batch_number := 'WIP-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('wip_seq')::TEXT, 4, '0');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_wip_number BEFORE INSERT ON wip_batches
  FOR EACH ROW WHEN (NEW.batch_number IS NULL OR NEW.batch_number = '') EXECUTE FUNCTION set_wip_number();

CREATE OR REPLACE FUNCTION set_do_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.do_number := 'DO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('do_seq')::TEXT, 4, '0');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_do_number BEFORE INSERT ON dispatch_orders
  FOR EACH ROW WHEN (NEW.do_number IS NULL OR NEW.do_number = '') EXECUTE FUNCTION set_do_number();

-- updated_at auto-update
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_products_upd    BEFORE UPDATE ON products            FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_suppliers_upd   BEFORE UPDATE ON suppliers           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_igp_upd         BEFORE UPDATE ON inward_gate_passes  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_req_upd         BEFORE UPDATE ON requisitions        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_wip_upd         BEFORE UPDATE ON wip_batches         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_do_upd          BEFORE UPDATE ON dispatch_orders     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
--  INDEXES
-- ============================================================

CREATE INDEX idx_stock_ledger_product  ON stock_ledger(product_id);
CREATE INDEX idx_stock_ledger_store    ON stock_ledger(store);
CREATE INDEX idx_stock_ledger_ref      ON stock_ledger(reference_type, reference_id);
CREATE INDEX idx_igp_date              ON inward_gate_passes(received_date);
CREATE INDEX idx_req_status            ON requisitions(status);
CREATE INDEX idx_wip_status            ON wip_batches(status);
CREATE INDEX idx_dispatch_status       ON dispatch_orders(status);

-- ============================================================
--  ROW LEVEL SECURITY (enable now, single-tenant policies)
-- ============================================================

ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inward_gate_passes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE igp_line_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wip_batches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wip_material_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_movements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_transfers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_items        ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write everything (single tenant)
-- Swap these for role-based policies when ready
CREATE POLICY "auth_all" ON products              FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON suppliers             FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON customers             FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON stock_ledger          FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON inward_gate_passes    FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON igp_line_items        FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON requisitions          FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON requisition_items     FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON wip_batches           FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON wip_material_consumption FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON rc_movements          FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON fg_transfers          FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON dispatch_orders       FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON dispatch_items        FOR ALL TO authenticated USING (true);

-- ============================================================
--  SEED DATA — product samples
-- ============================================================

INSERT INTO products (code, name, category, uom, is_rc) VALUES
  ('PPD-001', 'PP Dana',      'Raw Material', 'kg',     false),
  ('NAT-001', 'Natural',      'Raw Material', 'kg',     false),
  ('CAL-001', 'Calpet',       'Raw Material', 'kg',     false),
  ('MB-001',  'MB',           'Raw Material', 'bags',   false),
  ('INK-001', 'Ink',          'Chemical',     'litres', false),
  ('IPA-001', 'IPA',          'Chemical',     'litres', false),
  ('OIL-001', 'Oil',          'Chemical',     'litres', false),
  ('RC-001',  'RC Component', 'Returnable',   'units',  true);

-- ============================================================
--  FUTURE: Add company_id UUID column to every table
--  and update RLS policies when linking to OneAccounts
-- ============================================================
-- ALTER TABLE products ADD COLUMN company_id UUID REFERENCES companies(id);
-- UPDATE products SET company_id = '<your_company_id>';
-- ALTER TABLE products ALTER COLUMN company_id SET NOT NULL;
-- DROP POLICY "auth_all" ON products;
-- CREATE POLICY "tenant_isolation" ON products FOR ALL TO authenticated
--   USING (company_id = (SELECT company_id FROM app_users WHERE id = auth.uid()));

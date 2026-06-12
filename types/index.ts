// ── Enums ─────────────────────────────────────────────────────
export type StoreType =
  | "material_store"
  | "production_storage"
  | "wip"
  | "rc_store"
  | "finished_goods";

export type TransactionType =
  | "opening" | "received" | "issued"
  | "returned" | "adjusted" | "dispatched";

export type RequisitionStatus =
  | "draft" | "submitted" | "approved"
  | "issued" | "rejected" | "cancelled";

export type DispatchStatus =
  | "pending" | "loaded" | "dispatched" | "delivered";

export type UOM = "kg" | "bags" | "litres" | "units" | "metres" | "pcs";

// ── Master types ──────────────────────────────────────────────
export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  uom: UOM;
  is_rc: boolean;
  reorder_level: number;
  conversion_kg?: number;
  parent_product_id?: string | null;   // ← NEW
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
}

export interface StockBalance {
  product_id: string;
  product_name: string;
  product_code: string;
  store: StoreType;
  balance: number;
  uom: UOM;
}

// ── Documents ─────────────────────────────────────────────────
export interface InwardGatePass {
  id: string;
  igp_number: string;
  supplier_id?: string;
  supplier?: Supplier;
  vehicle_number: string;
  driver_name?: string;
  received_date: string;
  status: "draft" | "verified" | "approved" | "rejected";
  line_items: IGPLineItem[];
  created_at: string;
}

export interface IGPLineItem {
  id: string;
  igp_id: string;
  product_id: string;
  product?: Product;
  expected_qty?: number;
  received_qty: number;
  uom: UOM;
  batch_number?: string;
}

export interface Requisition {
  id: string;
  req_number: string;
  from_store: StoreType;
  to_store: StoreType;
  status: RequisitionStatus;
  required_date?: string;
  items: RequisitionItem[];
  created_at: string;
}

export interface RequisitionItem {
  id: string;
  requisition_id: string;
  product_id: string;
  product?: Product;
  requested_qty: number;
  approved_qty?: number;
  issued_qty?: number;
  uom: UOM;
}

export interface WIPBatch {
  id: string;
  batch_number: string;
  product_id: string;
  product?: Product;
  planned_qty: number;
  actual_qty?: number;
  status: "planned" | "in_progress" | "completed" | "on_hold" | "cancelled";
  started_at?: string;
  completed_at?: string;
  production_line?: string;
  created_at: string;
}

export interface DispatchOrder {
  id: string;
  do_number: string;
  customer_id?: string;
  customer?: Customer;
  vehicle_number?: string;
  transporter?: string;
  status: DispatchStatus;
  delivery_date?: string;
  challan_number?: string;
  invoice_number?: string;
  items: DispatchItem[];
  created_at: string;
}

export interface DispatchItem {
  id: string;
  dispatch_order_id: string;
  product_id: string;
  product?: Product;
  quantity: number;
  uom: UOM;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
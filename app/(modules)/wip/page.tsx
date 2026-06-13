"use client";
import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Package,
  Send, Printer, Wrench, X, Settings2, Factory,
  ChevronDown, ChevronRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";

type WIPStockMovement = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  conversion_kg?: number;
  opening_kg: number;
  received_kg: number;
  issued_fg_kg: number;
  issued_rc_kg: number;
  closing_kg: number;
  parent_product_id?: string | null;
  children?: WIPStockMovement[];
  isChild?: boolean;
};

type PendingTransfer = {
  id: string;
  from_store: string;
  product_id: string;
  product_name: string;
  product_code: string;
  quantity: number;
  uom: string;
};

type SortField = "code" | "name" | "category" | "uom"
  | "opening_kg" | "received_kg" | "issued_fg_kg" | "issued_rc_kg" | "closing_kg";
type SortDir = "asc" | "desc";

export default function WIPPage() {
  const supabase = createClient();
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const [movements, setMovements] = useState<WIPStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const [visibleColumns, setVisibleColumns] = useState({
    code: true, name: true, category: true, uom: true,
    opening_kg: true, received_kg: true, issued_fg_kg: true,
    issued_rc_kg: true, closing_kg: true, closing_bags: false,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  // ── Record Production modal ──
  const [prodItem, setProdItem] = useState<WIPStockMovement | null>(null);
  const [consumed, setConsumed] = useState("");
  const [produced, setProduced] = useState("");
  const [waste, setWaste] = useState("");
  const [fgProductId, setFgProductId] = useState("");
  const [newFgName, setNewFgName] = useState("");
  const [fgList, setFgList] = useState<any[]>([]);
  const [producing, setProducing] = useState(false);

  const fetchMovements = async () => {
    setLoading(true);
    const start = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data: allProducts } = await supabase
      .from("stock_ledger")
      .select("product_id, products(code, name, category, uom, conversion_kg, parent_product_id)")
      .eq("store", "wip");

    if (!allProducts) { setMovements([]); setLoading(false); return; }

    const uniqueMap = new Map<string, WIPStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        const prod = (row.products as any);
        uniqueMap.set(row.product_id, {
          product_id: row.product_id, code: prod?.code ?? "", name: prod?.name ?? "Unknown",
          category: prod?.category ?? "", uom: prod?.uom ?? "",
          conversion_kg: prod?.conversion_kg ?? undefined,
          parent_product_id: prod?.parent_product_id ?? null,
          opening_kg: 0, received_kg: 0, issued_fg_kg: 0, issued_rc_kg: 0, closing_kg: 0,
        });
      }
    }
    const items = Array.from(uniqueMap.values());

    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger").select("quantity, direction")
        .eq("product_id", item.product_id).eq("store", "wip").lt("created_at", start);
      item.opening_kg = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
    }

    for (const item of items) {
      const { data: month } = await supabase
        .from("stock_ledger").select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id).eq("store", "wip").gte("created_at", start).lt("created_at", end);
      let recv = 0, fg = 0, rc = 0;
      for (const r of (month || [])) {
        if (r.direction === 1) recv += r.quantity;
        else if (r.direction === -1) {
          if (r.reference_type === "production_run") fg += r.quantity;
          else rc += r.quantity;
        }
      }
      item.received_kg = recv; item.issued_fg_kg = fg; item.issued_rc_kg = rc;
      item.closing_kg = item.opening_kg + recv - fg - rc;
    }

    // Build hierarchy
    const parentMap = new Map<string, WIPStockMovement>();
    const children: WIPStockMovement[] = [];
    for (const item of items) {
      if (!item.parent_product_id) parentMap.set(item.product_id, { ...item, children: [] });
      else children.push({ ...item, isChild: true });
    }
    const missingParentIds = Array.from(new Set(children.map(c => c.parent_product_id!).filter(pid => pid && !parentMap.has(pid))));
    if (missingParentIds.length > 0) {
      const { data: missingParents } = await supabase.from("products").select("id, code, name, category, uom, conversion_kg").in("id", missingParentIds);
      for (const p of (missingParents || [])) {
        parentMap.set(p.id, { product_id: p.id, code: p.code ?? "", name: p.name ?? "Unknown", category: p.category ?? "", uom: p.uom ?? "", conversion_kg: p.conversion_kg ?? undefined, opening_kg: 0, received_kg: 0, issued_fg_kg: 0, issued_rc_kg: 0, closing_kg: 0, parent_product_id: null, children: [] });
      }
    }
    for (const child of children) {
      const parent = parentMap.get(child.parent_product_id!);
      if (parent) {
        parent.children!.push(child);
        parent.opening_kg += child.opening_kg; parent.received_kg += child.received_kg;
        parent.issued_fg_kg += child.issued_fg_kg; parent.issued_rc_kg += child.issued_rc_kg;
        parent.closing_kg += child.closing_kg;
      } else {
        parentMap.set(child.product_id, { ...child, isChild: false, parent_product_id: null, children: [] });
      }
    }

    const displayList: WIPStockMovement[] = [];
    for (const parent of Array.from(parentMap.values())) {
      displayList.push(parent);
      if (parent.children && parent.children.length > 0) displayList.push(...parent.children);
    }
    setMovements(displayList);
    setLoading(false);
  };

  const fetchIncoming = async () => {
    const { data } = await supabase.from("store_transfers").select("*, products(code, name)")
      .eq("to_store", "wip").eq("status", "pending").order("created_at", { ascending: false });
    if (data) setIncoming(data.map((r: any) => ({ id: r.id, from_store: r.from_store, product_id: r.product_id, product_name: r.products?.name ?? "", product_code: r.products?.code ?? "", quantity: r.quantity, uom: r.uom })));
  };

  const fetchFgList = async () => {
    const { data } = await supabase.from("products").select("id, name, code").eq("category", "Finished Good").eq("is_active", true);
    if (data) setFgList(data);
  };

  useEffect(() => { fetchMovements(); fetchIncoming(); fetchFgList(); }, [startDate, endDate]);

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const filtered = useMemo(() => {
    let list = [...movements];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchingIds = new Set(list.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)).map(i => i.product_id));
      list.forEach(i => { if (i.isChild && i.parent_product_id && matchingIds.has(i.product_id)) matchingIds.add(i.parent_product_id); });
      list = list.filter(i => matchingIds.has(i.product_id));
    }
    const parents = list.filter(i => !i.isChild);
    parents.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case "code": va = a.code; vb = b.code; break;
        case "name": va = a.name; vb = b.name; break;
        case "category": va = a.category; vb = b.category; break;
        case "uom": va = a.uom; vb = b.uom; break;
        case "opening_kg": va = a.opening_kg; vb = b.opening_kg; break;
        case "received_kg": va = a.received_kg; vb = b.received_kg; break;
        case "issued_fg_kg": va = a.issued_fg_kg; vb = b.issued_fg_kg; break;
        case "issued_rc_kg": va = a.issued_rc_kg; vb = b.issued_rc_kg; break;
        case "closing_kg": va = a.closing_kg; vb = b.closing_kg; break;
        default: return 0;
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      else return sortDir === "asc" ? va - vb : vb - va;
    });
    const childMap = new Map<string, WIPStockMovement[]>();
    list.filter(i => i.isChild).forEach(c => { const pid = c.parent_product_id!; if (!childMap.has(pid)) childMap.set(pid, []); childMap.get(pid)!.push(c); });
    const result: WIPStockMovement[] = [];
    for (const parent of parents) { result.push(parent); result.push(...(childMap.get(parent.product_id) || [])); }
    return result;
  }, [movements, searchQuery, sortField, sortDir]);

  const handleSort = (f: SortField) => { if (sortField === f) setSortDir(p => p === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };
  const sortIcon = (f: SortField) => sortField !== f ? <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" /> : sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  const toggleCol = (k: keyof typeof visibleColumns) => setVisibleColumns(p => ({ ...p, [k]: !p[k] }));

  const handleIncomingAction = async (id: string, action: "accepted" | "rejected") => {
    const t = incoming.find(x => x.id === id); if (!t) return;
    if (action === "accepted") {
      await supabase.from("stock_ledger").insert([
        { product_id: t.product_id, store: t.from_store as StoreType, txn_type: "issued", quantity: t.quantity, direction: -1, reference_type: "store_transfer", reference_id: id },
        { product_id: t.product_id, store: "wip" as StoreType, txn_type: "received", quantity: t.quantity, direction: 1, reference_type: "store_transfer", reference_id: id },
      ]);
    }
    await supabase.from("store_transfers").update({ status: action, [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString() }).eq("id", id);
    fetchIncoming(); fetchMovements();
  };

  // ── Production handler ──
  const handleProduction = async () => {
    if (!prodItem) return;
    const cons = parseFloat(consumed);
    const prod = parseFloat(produced);
    const wst = parseFloat(waste);
    if (isNaN(cons) || isNaN(prod) || isNaN(wst) || cons <= 0 || prod < 0 || wst < 0 || cons > prodItem.closing_kg) { alert("Invalid quantities."); return; }
    if (Math.abs(cons - (prod + wst)) > 0.001) { alert(`Total must balance: ${cons} ≠ ${prod} + ${wst}`); return; }
    if (!fgProductId && !newFgName) { alert("Select or create a finished good."); return; }
    setProducing(true);
    try {
      let fgId = fgProductId;
      if (!fgId && newFgName) {
        const { data: newProd } = await supabase.from("products").insert({ name: newFgName, category: "Finished Good", uom: "kg", is_rc: false, reorder_level: 0 }).select().single();
        if (!newProd) throw new Error("Failed to create product");
        fgId = newProd.id;
        setFgList(prev => [...prev, { id: newProd.id, name: newProd.name, code: newProd.code }]);
      }
      if (!fgId) throw new Error("No finished good product selected.");
      const { data: pr } = await supabase.from("production_runs").insert({ raw_material_product_id: prodItem.product_id, finished_good_product_id: fgId, kg_consumed: cons, kg_produced: prod, kg_waste: wst }).select().single();
      if (!pr) throw new Error("Failed to create production run");
      const ledgerRows = [
        { product_id: prodItem.product_id, store: "wip" as StoreType, txn_type: "consumed", quantity: cons, direction: -1, reference_type: "production_run", reference_id: pr.id },
        { product_id: fgId, store: "finished_goods" as StoreType, txn_type: "produced", quantity: prod, direction: 1, reference_type: "production_run", reference_id: pr.id },
      ];
      if (wst > 0) ledgerRows.push({ product_id: prodItem.product_id, store: "rc_store" as StoreType, txn_type: "waste", quantity: wst, direction: 1, reference_type: "production_run", reference_id: pr.id });
      await supabase.from("stock_ledger").insert(ledgerRows);
      fetchMovements(); setProdItem(null); setConsumed(""); setProduced(""); setWaste(""); setFgProductId(""); setNewFgName("");
    } catch (e: any) { alert(e.message); } finally { setProducing(false); }
  };

  const updateConsumed = (v: string) => { setConsumed(v); const c = parseFloat(v); const p = parseFloat(produced); if (!isNaN(c) && !isNaN(p)) setWaste((c - p).toFixed(2)); };
  const updateProduced = (v: string) => { setProduced(v); const c = parseFloat(consumed); const p = parseFloat(v); if (!isNaN(c) && !isNaN(p)) setWaste((c - p).toFixed(2)); };

  const renderRow = (item: WIPStockMovement) => {
    const isParent = !item.isChild && item.children && item.children.length > 0;
    const isChild = !!item.isChild;
    const isExpanded = expandedParents.has(item.product_id);
    if (isChild && item.parent_product_id && !expandedParents.has(item.parent_product_id)) return null;

    return (
      <tr key={item.product_id} className={cn("hover:bg-gray-50", isChild && "bg-gray-50/50")}>
        <td className="table-td w-8 print:hidden text-xs font-medium text-gray-700">
          {isParent && <button onClick={() => toggleExpand(item.product_id)}>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}
        </td>
        {visibleColumns.code && <td className={cn("table-td text-xs font-medium font-mono text-brand-600 min-w-[100px]", isChild && "pl-6")}>{item.code}</td>}
        {visibleColumns.name && <td className={cn("table-td text-xs font-medium text-gray-700", isChild && "pl-6")}>{isChild && "└ "}{item.name}{isParent && <span className="ml-1 text-[10px] text-gray-400">({item.children!.length} variants)</span>}</td>}
        {visibleColumns.category && <td className="table-td text-xs font-medium text-gray-700 whitespace-nowrap">{item.category}</td>}
        {visibleColumns.uom && <td className="table-td text-xs font-medium text-gray-700 uppercase">{item.uom}</td>}
        {visibleColumns.opening_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.opening_kg.toFixed(2)}</td>}
        {visibleColumns.received_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.received_kg.toFixed(2)}</td>}
        {visibleColumns.issued_fg_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.issued_fg_kg.toFixed(2)}</td>}
        {visibleColumns.issued_rc_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.issued_rc_kg.toFixed(2)}</td>}
        {visibleColumns.closing_kg && <td className="table-td text-xs font-medium text-gray-700 text-right font-semibold">{item.closing_kg.toFixed(2)}</td>}
        <td className="table-td text-xs font-medium text-right print:hidden">
          {!isParent && (
            <button className="text-brand-600 hover:text-brand-700" onClick={() => { setProdItem(item); setConsumed(""); setProduced(""); setWaste(""); setFgProductId(""); setNewFgName(""); }}>
              <Factory className="h-3 w-3 inline" /> Record Production
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="p-6">
      <PageHeader
        title="WIP – Production Management"
        subtitle="Date‑range report"
        actions={
          <button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
            <Package className="h-4 w-4" />
            {incoming.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {incoming.length}
              </span>
            )}
            Incoming
          </button>
        }
      />

      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">From:</label><input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <label className="text-sm font-medium">To:</label><input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setShowColumnMenu(!showColumnMenu)}><Settings2 className="h-3.5 w-3.5" /> Columns</button>
            {showColumnMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                <div className="p-2 space-y-1">
                  {Object.entries(visibleColumns).map(([k, v]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input type="checkbox" checked={v} onChange={() => toggleCol(k as keyof typeof visibleColumns)} className="rounded border-gray-300" />
                      <span className="capitalize text-gray-600">{k.replace(/_/g, " ")}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => window.print()} className="btn-secondary text-xs flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Print</button>
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="flex items-center justify-end mb-2 print:hidden">
        <span className="text-[10px] text-gray-400 font-medium">All quantities in KG</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? <div className="py-16 text-center text-gray-400">No data.</div> :
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th w-8 print:hidden whitespace-nowrap"></th>
                {visibleColumns.code && <th className="table-th cursor-pointer whitespace-nowrap min-w-[100px]" onClick={() => handleSort("code")}>Code {sortIcon("code")}</th>}
                {visibleColumns.name && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("name")}>Name {sortIcon("name")}</th>}
                {visibleColumns.category && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("category")}>Category {sortIcon("category")}</th>}
                {visibleColumns.uom && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("uom")}>UOM {sortIcon("uom")}</th>}
                {visibleColumns.opening_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("opening_kg")}>Opening {sortIcon("opening_kg")}</th>}
                {visibleColumns.received_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("received_kg")}>Received {sortIcon("received_kg")}</th>}
                {visibleColumns.issued_fg_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("issued_fg_kg")}>Issued FG {sortIcon("issued_fg_kg")}</th>}
                {visibleColumns.issued_rc_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("issued_rc_kg")}>Issued RC {sortIcon("issued_rc_kg")}</th>}
                {visibleColumns.closing_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("closing_kg")}>Closing {sortIcon("closing_kg")}</th>}
                <th className="table-th print:hidden whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => renderRow(item))}
            </tbody>
          </table>}
      </div>

      {/* Incoming modal */}
      {showIncoming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="bg-white rounded-xl p-6 w-full max-w-2xl"><div className="flex justify-between"><h2 className="text-lg font-semibold">Incoming</h2><button onClick={() => setShowIncoming(false)}><X className="h-5 w-5" /></button></div>{incoming.length === 0 ? <p>No pending transfers.</p> : <table className="w-full text-sm"><thead><tr><th>From</th><th>Product</th><th>Qty</th><th>UOM</th><th></th></tr></thead><tbody>{incoming.map(t => <tr key={t.id}><td>{t.from_store}</td><td>{t.product_name}</td><td>{t.quantity}</td><td>{t.uom}</td><td className="space-x-1"><button onClick={() => handleIncomingAction(t.id, "accepted")} className="text-green-600 text-xs">Accept</button><button onClick={() => handleIncomingAction(t.id, "rejected")} className="text-red-600 text-xs">Reject</button></td></tr>)}</tbody></table>}</div></div>}

      {/* Production modal */}
      {prodItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="bg-white rounded-xl p-6 w-96 space-y-4"><h2 className="text-lg font-semibold">Record Production: {prodItem.name}</h2><p className="text-sm">Available: {prodItem.closing_kg.toFixed(2)} kg</p><input type="number" step="0.001" max={prodItem.closing_kg} className="input" value={consumed} onChange={e => updateConsumed(e.target.value)} placeholder="KG Consumed" /><input type="number" step="0.001" className="input" value={produced} onChange={e => updateProduced(e.target.value)} placeholder="KG Produced" /><input type="number" step="0.001" className="input" value={waste} onChange={e => setWaste(e.target.value)} placeholder="KG Waste" /><div><select className="input" value={fgProductId} onChange={e => setFgProductId(e.target.value)}><option value="">-- Choose FG --</option>{fgList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input className="input mt-2" placeholder="Or new FG name" value={newFgName} onChange={e => setNewFgName(e.target.value)} /></div><div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setProdItem(null)}>Cancel</button><button className="btn-primary" disabled={producing} onClick={handleProduction}>Record</button></div></div></div>}
    </div>
  );
}
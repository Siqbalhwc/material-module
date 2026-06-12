"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Package,
  AlertTriangle, Send, Bell, X, Printer, Settings2,
  ChevronDown, ChevronRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";

type MaterialStockMovement = {
  product_id: string;
  code: string;
  displayName: string;
  category: string;
  uom: string;
  conversion_kg?: number;
  reorder_level: number;
  opening_kg: number;
  received_supplier_kg: number;
  received_rc_kg: number;
  issued_wip_kg: number;
  closing_kg: number;
  parent_product_id?: string | null;
  isParent: boolean;
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

type SortField = "code" | "displayName" | "category" | "uom" | "reorder_level"
  | "opening_kg" | "received_supplier_kg" | "received_rc_kg" | "issued_wip_kg" | "closing_kg";
type SortDir = "asc" | "desc";

export default function MaterialStorePage() {
  const supabase = createClient();
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const [movements, setMovements] = useState<MaterialStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("displayName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [visibleColumns, setVisibleColumns] = useState({
    code: true, name: true, category: true, uom: true,
    reorder_level: false, opening_kg: true, received_supplier_kg: true,
    received_rc_kg: true, issued_wip_kg: true, closing_kg: true,
    closing_bags: false,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  const [issueItem, setIssueItem] = useState<MaterialStockMovement | null>(null);
  const [issueQtyKg, setIssueQtyKg] = useState("");
  const [issueQtyBags, setIssueQtyBags] = useState("");
  const [issuing, setIssuing] = useState(false);

  const fetchMovements = async () => {
    setLoading(true);
    const start = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    // Fetch parent product names
    const { data: allProds } = await supabase.from("products").select("id, name, parent_product_id");
    const parentNameMap = new Map<string, string>();
    const parentIdSet = new Set<string>();
    if (allProds) {
      for (const p of allProds) {
        if (!p.parent_product_id) parentNameMap.set(p.id, p.name);
        if (p.parent_product_id) parentIdSet.add(p.parent_product_id);
      }
    }

    const { data, error } = await supabase
      .from("stock_ledger")
      .select("product_id, products(code, name, category, uom, reorder_level, conversion_kg, parent_product_id)")
      .eq("store", "material_store");

    if (error || !data) { setMovements([]); setLoading(false); return; }

    const uniqueMap = new Map<string, MaterialStockMovement>();
    for (const row of data) {
      if (!uniqueMap.has(row.product_id)) {
        const prod = (row.products as any);
        const rawName = prod?.name ?? "Unknown";
        const isChild = !!prod?.parent_product_id;
        const parentName = isChild ? parentNameMap.get(prod.parent_product_id) ?? "" : "";
        const displayName = isChild ? `${parentName} > ${rawName}` : rawName;
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: prod?.code ?? "",
          displayName,
          category: prod?.category ?? "",
          uom: prod?.uom ?? "",
          conversion_kg: prod?.conversion_kg ?? undefined,
          reorder_level: prod?.reorder_level ?? 0,
          parent_product_id: prod?.parent_product_id ?? null,
          isParent: parentIdSet.has(row.product_id),
          opening_kg: 0, received_supplier_kg: 0, received_rc_kg: 0, issued_wip_kg: 0, closing_kg: 0,
        });
      }
    }

    const items = Array.from(uniqueMap.values());

    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger").select("quantity, direction")
        .eq("product_id", item.product_id).eq("store", "material_store").lt("created_at", start);
      item.opening_kg = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
    }

    for (const item of items) {
      const { data: month } = await supabase
        .from("stock_ledger").select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id).eq("store", "material_store").gte("created_at", start).lt("created_at", end);
      let supplier = 0, rc = 0, wip = 0;
      for (const r of (month || [])) {
        if (r.direction === 1) {
          if (r.reference_type === "gate_pass") supplier += r.quantity;
          else if (r.reference_type === "store_transfer") rc += r.quantity;
          else supplier += r.quantity;
        } else if (r.direction === -1) {
          if (r.reference_type === "store_transfer") wip += r.quantity;
          else wip += r.quantity;
        }
      }
      item.received_supplier_kg = supplier; item.received_rc_kg = rc; item.issued_wip_kg = wip;
      item.closing_kg = item.opening_kg + supplier + rc - wip;
    }

    setMovements(items.filter(i => i.category === "Raw Material" || i.category === "Chemical"));
    setLoading(false);
  };

  const fetchIncoming = async () => {
    const { data } = await supabase.from("store_transfers").select("*, products(code, name)")
      .eq("to_store", "material_store").eq("status", "pending").order("created_at", { ascending: false });
    if (data) setIncoming(data.map((r: any) => ({ id: r.id, from_store: r.from_store, product_id: r.product_id, product_name: r.products?.name ?? "", product_code: r.products?.code ?? "", quantity: r.quantity, uom: r.uom })));
  };

  useEffect(() => { fetchMovements(); fetchIncoming(); }, [startDate, endDate]);

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // Flatten: parents first, then children of expanded parents
  const displayList = useMemo(() => {
    const parents = movements.filter(i => !i.parent_product_id);
    const result: MaterialStockMovement[] = [];
    for (const p of parents) {
      result.push(p);
      if (expandedParents.has(p.product_id)) {
        result.push(...movements.filter(c => c.parent_product_id === p.product_id));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return result.filter(i => i.displayName.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    return result;
  }, [movements, expandedParents, searchQuery]);

  const filtered = useMemo(() => {
    const list = [...displayList];
    list.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case "code": va = a.code; vb = b.code; break;
        case "displayName": va = a.displayName; vb = b.displayName; break;
        case "category": va = a.category; vb = b.category; break;
        case "uom": va = a.uom; vb = b.uom; break;
        case "reorder_level": va = a.reorder_level; vb = b.reorder_level; break;
        case "opening_kg": va = a.opening_kg; vb = b.opening_kg; break;
        case "received_supplier_kg": va = a.received_supplier_kg; vb = b.received_supplier_kg; break;
        case "received_rc_kg": va = a.received_rc_kg; vb = b.received_rc_kg; break;
        case "issued_wip_kg": va = a.issued_wip_kg; vb = b.issued_wip_kg; break;
        case "closing_kg": va = a.closing_kg; vb = b.closing_kg; break;
        default: return 0;
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      else return sortDir === "asc" ? va - vb : vb - va;
    });
    return list;
  }, [displayList, sortField, sortDir]);

  const handleSort = (f: SortField) => { if (sortField === f) setSortDir(p => p === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };
  const sortIcon = (f: SortField) => sortField !== f ? <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" /> : sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  const toggleCol = (k: keyof typeof visibleColumns) => setVisibleColumns(p => ({ ...p, [k]: !p[k] }));

  const handleIncomingAction = async (id: string, action: "accepted" | "rejected") => {
    const t = incoming.find(x => x.id === id); if (!t) return;
    if (action === "accepted") {
      await supabase.from("stock_ledger").insert([
        { product_id: t.product_id, store: t.from_store as StoreType, txn_type: "issued", quantity: t.quantity, direction: -1, reference_type: "store_transfer", reference_id: id },
        { product_id: t.product_id, store: "material_store" as StoreType, txn_type: "received", quantity: t.quantity, direction: 1, reference_type: "store_transfer", reference_id: id },
      ]);
    }
    await supabase.from("store_transfers").update({ status: action, [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString() }).eq("id", id);
    fetchIncoming(); fetchMovements();
  };

  const handleIssueToWIP = async () => {
    if (!issueItem) return;
    const qty = parseFloat(issueQtyKg);
    if (isNaN(qty) || qty <= 0 || qty > issueItem.closing_kg) { alert("Invalid quantity"); return; }
    setIssuing(true);
    await supabase.from("store_transfers").insert({ from_store: "material_store", to_store: "wip", product_id: issueItem.product_id, quantity: qty, uom: issueItem.uom, status: "pending" });
    alert("Sent to WIP");
    fetchMovements(); setIssueItem(null); setIssueQtyKg(""); setIssueQtyBags("");
    setIssuing(false);
  };

  const updateBags = (v: string) => { setIssueQtyBags(v); const b = parseFloat(v); if (issueItem?.conversion_kg && !isNaN(b)) setIssueQtyKg((b * issueItem.conversion_kg).toFixed(3)); else setIssueQtyKg(""); };
  const updateKg = (v: string) => { setIssueQtyKg(v); const k = parseFloat(v); if (issueItem?.conversion_kg && !isNaN(k)) setIssueQtyBags((k / issueItem.conversion_kg).toFixed(3)); else setIssueQtyBags(""); };

  return (
    <>
      <Header title="Material Store" subtitle="Date‑range report"
        actions={<button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}><Bell className="h-4 w-4" />{incoming.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{incoming.length}</span>} Incoming</button>}
      />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><label>From:</label><input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} /><label>To:</label><input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowColumnMenu(!showColumnMenu)} className="btn-secondary text-xs"><Settings2 className="h-3.5 w-3.5" /> Columns</button>
            <button onClick={() => window.print()} className="btn-secondary text-xs"><Printer className="h-3.5 w-3.5" /> Print</button>
          </div>
        </div>

        <section>
          <div className="relative max-w-sm mb-3"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
          <div className="card overflow-hidden">
            {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? <div className="py-16 text-center text-gray-400">No data.</div> :
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="w-8"></th>
                  {visibleColumns.code && <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>Code {sortIcon("code")}</th>}
                  {visibleColumns.name && <th className="table-th cursor-pointer" onClick={() => handleSort("displayName")}>Name {sortIcon("displayName")}</th>}
                  {visibleColumns.category && <th className="table-th cursor-pointer" onClick={() => handleSort("category")}>Category {sortIcon("category")}</th>}
                  {visibleColumns.uom && <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>UOM {sortIcon("uom")}</th>}
                  {visibleColumns.reorder_level && <th className="table-th text-right">Reorder</th>}
                  {visibleColumns.opening_kg && <th className="table-th text-right">Opening (KG)</th>}
                  {visibleColumns.received_supplier_kg && <th className="table-th text-right">Recv Sup (KG)</th>}
                  {visibleColumns.received_rc_kg && <th className="table-th text-right">Recv RC (KG)</th>}
                  {visibleColumns.issued_wip_kg && <th className="table-th text-right">Issued WIP (KG)</th>}
                  {visibleColumns.closing_kg && <th className="table-th text-right">Closing (KG)</th>}
                  <th></th>
                </tr></thead>
                <tbody className="divide-y">
                  {filtered.map(item => {
                    const isChild = !!item.parent_product_id;
                    if (isChild && item.parent_product_id && !expandedParents.has(item.parent_product_id)) return null;
                    const low = item.closing_kg <= item.reorder_level && item.reorder_level > 0;
                    return (
                      <tr key={item.product_id} className={cn("hover:bg-gray-50", low && "bg-amber-50", isChild && "bg-gray-50/50")}>
                        <td>{item.isParent && <button onClick={() => toggleExpand(item.product_id)}>{expandedParents.has(item.product_id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}</td>
                        {visibleColumns.code && <td className={cn("table-td font-mono text-xs", isChild && "pl-6")}>{item.code}</td>}
                        {visibleColumns.name && <td className={cn("table-td font-medium", isChild && "pl-6")}>{isChild && "└ "}{item.displayName}{low && <AlertTriangle className="h-3 w-3 text-amber-500 inline ml-1" />}</td>}
                        {visibleColumns.category && <td className="table-td">{item.category}</td>}
                        {visibleColumns.uom && <td className="table-td uppercase text-xs">{item.uom}</td>}
                        {visibleColumns.reorder_level && <td className="table-td text-right">{item.reorder_level}</td>}
                        {visibleColumns.opening_kg && <td className="table-td text-right">{item.opening_kg.toFixed(3)}</td>}
                        {visibleColumns.received_supplier_kg && <td className="table-td text-right">{item.received_supplier_kg.toFixed(3)}</td>}
                        {visibleColumns.received_rc_kg && <td className="table-td text-right">{item.received_rc_kg.toFixed(3)}</td>}
                        {visibleColumns.issued_wip_kg && <td className="table-td text-right">{item.issued_wip_kg.toFixed(3)}</td>}
                        {visibleColumns.closing_kg && <td className="table-td text-right font-medium">{item.closing_kg.toFixed(3)}</td>}
                        <td className="table-td">{!item.isParent && <button className="text-xs text-brand-600" onClick={() => { setIssueItem(item); setIssueQtyKg(""); setIssueQtyBags(""); }}><Send className="h-3 w-3 inline" /> Issue to WIP</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>}
          </div>
        </section>

        {/* Incoming modal */}
        {showIncoming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="bg-white rounded-xl p-6 w-full max-w-2xl"><div className="flex justify-between"><h2 className="text-lg font-semibold">Incoming</h2><button onClick={() => setShowIncoming(false)}><X className="h-5 w-5" /></button></div>{incoming.length === 0 ? <p>No pending transfers.</p> : <table className="w-full text-sm"><thead><tr><th>From</th><th>Product</th><th>Qty</th><th>UOM</th><th></th></tr></thead><tbody>{incoming.map(t => <tr key={t.id}><td>{t.from_store}</td><td>{t.product_name}</td><td>{t.quantity}</td><td>{t.uom}</td><td className="space-x-1"><button onClick={() => handleIncomingAction(t.id, "accepted")} className="text-green-600 text-xs">Accept</button><button onClick={() => handleIncomingAction(t.id, "rejected")} className="text-red-600 text-xs">Reject</button></td></tr>)}</tbody></table>}</div></div>}

        {/* Issue modal */}
        {issueItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="bg-white rounded-xl p-6 w-96"><h2 className="text-lg font-semibold">Issue to WIP: {issueItem.displayName}</h2><p className="text-sm text-gray-500">Available: {issueItem.closing_kg.toFixed(3)} kg</p><input type="number" step="0.001" max={issueItem.closing_kg} className="input" value={issueQtyKg} onChange={e => updateKg(e.target.value)} />{issueItem.uom === "bags" && issueItem.conversion_kg && <div><input type="number" step="0.001" className="input" value={issueQtyBags} onChange={e => updateBags(e.target.value)} placeholder="Bags" /></div>}<div className="flex justify-end gap-2 mt-4"><button className="btn-secondary" onClick={() => setIssueItem(null)}>Cancel</button><button className="btn-primary" disabled={issuing} onClick={handleIssueToWIP}>Send</button></div></div></div>}
      </main>
    </>
  );
}
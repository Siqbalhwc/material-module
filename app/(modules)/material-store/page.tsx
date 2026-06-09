"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Package, AlertTriangle, Send, Bell, X, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";

type MaterialStockMovement = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  reorder_level: number;
  opening: number;
  received_supplier: number;   // from Gate Pass
  received_rc: number;         // from RC Store
  issued_wip: number;          // to WIP
  closing: number;
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

type SortField = "code" | "name" | "category" | "uom" | "reorder_level" | "opening" | "received_supplier" | "received_rc" | "issued_wip" | "closing";
type SortDir = "asc" | "desc";

export default function MaterialStorePage() {
  const supabase = createClient();

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [movements, setMovements] = useState<MaterialStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Incoming transfers (from RC)
  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  // Issue to WIP modal
  const [issueItem, setIssueItem] = useState<MaterialStockMovement | null>(null);
  const [issueQty, setIssueQty] = useState("");
  const [issuing, setIssuing] = useState(false);

  // ── Fetch monthly movements ─────────────────────────────
  const fetchMovements = async () => {
    setLoading(true);
    const monthStart = selectedMonth + "-01";
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 7) + "-01";

    // Get all products ever in material_store
    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom, reorder_level )")
      .eq("store", "material_store");

    if (prodErr || !allProducts) {
      setMovements([]);
      setLoading(false);
      return;
    }

    const uniqueMap = new Map<string, MaterialStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          category: (row.products as any)?.category ?? "",
          uom: (row.products as any)?.uom ?? "",
          reorder_level: (row.products as any)?.reorder_level ?? 0,
          opening: 0,
          received_supplier: 0,
          received_rc: 0,
          issued_wip: 0,
          closing: 0,
        });
      }
    }
    const items = Array.from(uniqueMap.values());

    // Opening
    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "material_store")
        .lt("created_at", monthStart);
      const opening = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
      item.opening = opening;
    }

    // Current month
    for (const item of items) {
      const { data: monthData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id)
        .eq("store", "material_store")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      let supplier = 0, rc = 0, wip = 0;
      for (const r of (monthData || [])) {
        if (r.direction === 1) {
          if (r.reference_type === "gate_pass") supplier += r.quantity;
          else if (r.reference_type === "store_transfer") rc += r.quantity; // from RC
          else supplier += r.quantity; // fallback
        } else if (r.direction === -1) {
          if (r.reference_type === "store_transfer") wip += r.quantity; // to WIP
          else wip += r.quantity;
        }
      }
      item.received_supplier = supplier;
      item.received_rc = rc;
      item.issued_wip = wip;
      item.closing = item.opening + supplier + rc - wip;
    }

    setMovements(items);
    setLoading(false);
  };

  // ── Fetch incoming transfers (to material_store, pending) ─
  const fetchIncoming = async () => {
    const { data } = await supabase
      .from("store_transfers")
      .select(`*, products(code, name)`)
      .eq("to_store", "material_store")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) {
      setIncoming(data.map((r: any) => ({
        id: r.id,
        from_store: r.from_store,
        product_id: r.product_id,
        product_name: r.products?.name ?? "",
        product_code: r.products?.code ?? "",
        quantity: r.quantity,
        uom: r.uom,
      })));
    }
  };

  useEffect(() => {
    fetchMovements();
    fetchIncoming();
  }, [selectedMonth]);

  // ── Sorting / filtering ──────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...movements];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "code": valA = a.code; valB = b.code; break;
        case "name": valA = a.name; valB = b.name; break;
        case "category": valA = a.category; valB = b.category; break;
        case "uom": valA = a.uom; valB = b.uom; break;
        case "reorder_level": valA = a.reorder_level; valB = b.reorder_level; break;
        case "opening": valA = a.opening; valB = b.opening; break;
        case "received_supplier": valA = a.received_supplier; valB = b.received_supplier; break;
        case "received_rc": valA = a.received_rc; valB = b.received_rc; break;
        case "issued_wip": valA = a.issued_wip; valB = b.issued_wip; break;
        case "closing": valA = a.closing; valB = b.closing; break;
        default: return 0;
      }
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [movements, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  };

  // ── Accept / Reject incoming ────────────────────────────
  const handleIncomingAction = async (id: string, action: "accepted" | "rejected") => {
    const transfer = incoming.find(t => t.id === id);
    if (!transfer) return;
    try {
      if (action === "accepted") {
        const { error } = await supabase.from("stock_ledger").insert([
          { product_id: transfer.product_id, store: transfer.from_store as StoreType, txn_type: "issued", quantity: transfer.quantity, direction: -1, reference_type: "store_transfer", reference_id: id },
          { product_id: transfer.product_id, store: "material_store" as StoreType, txn_type: "received", quantity: transfer.quantity, direction: 1, reference_type: "store_transfer", reference_id: id },
        ]);
        if (error) throw error;
      }
      await supabase.from("store_transfers").update({
        status: action,
        [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString(),
      }).eq("id", id);
      fetchIncoming();
      fetchMovements();
    } catch (e: any) { alert(e.message); }
  };

  // ── Issue to WIP ──────────────────────────────────────
  const handleIssueToWIP = async () => {
    if (!issueItem) return;
    const qty = parseFloat(issueQty);
    if (isNaN(qty) || qty <= 0 || qty > issueItem.closing) {
      alert("Invalid quantity (max " + issueItem.closing + ")");
      return;
    }
    setIssuing(true);
    try {
      await supabase.from("store_transfers").insert({
        from_store: "material_store",
        to_store: "wip",
        product_id: issueItem.product_id,
        quantity: qty,
        uom: issueItem.uom,
        status: "pending",
        notes: "Issue to WIP",
      });
      alert("Transfer sent to WIP.");
      fetchMovements();
      setIssueItem(null);
      setIssueQty("");
    } catch (e: any) { alert(e.message); }
    finally { setIssuing(false); }
  };

  const handlePrint = () => window.print();

  return (
    <>
      <Header
        title="Material Store (Raw Materials & Chemicals)"
        subtitle="Monthly stock movement and inter‑store transfers"
        actions={
          <button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
            <Bell className="h-4 w-4" />
            {incoming.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {incoming.length}
              </span>
            )}
            Incoming
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-6 print:space-y-4">
        {/* Month & Print */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Month:</label>
            <input type="month" className="input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
          </div>
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-1">
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>

        {/* Movement Table */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Stock Movement – {selectedMonth}</h2>
          <div className="relative max-w-sm mb-3 print:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="card overflow-hidden">
            {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No data.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {(["code","name","category","uom","reorder_level","opening","received_supplier","received_rc","issued_wip","closing"] as SortField[]).map(f => (
                      <th key={f} className={`table-th cursor-pointer ${["opening","received_supplier","received_rc","issued_wip","closing","reorder_level"].includes(f) ? "text-right" : ""}`} onClick={() => handleSort(f)}>
                        <span className="inline-flex items-center">
                          {f === "received_supplier" ? "Recv Supplier" : f === "received_rc" ? "Recv RC" : f === "issued_wip" ? "Issued WIP" : f === "reorder_level" ? "Reorder Lvl" : f.charAt(0).toUpperCase()+f.slice(1)}
                          {renderSortIcon(f)}
                        </span>
                      </th>
                    ))}
                    <th className="table-th print:hidden"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(item => {
                    const lowStock = item.closing <= item.reorder_level && item.reorder_level > 0;
                    return (
                      <tr key={item.product_id} className={cn("hover:bg-gray-50", lowStock && "bg-amber-50")}>
                        <td className="table-td font-mono text-xs">{item.code}</td>
                        <td className="table-td font-medium">{item.name} {lowStock && <AlertTriangle className="h-3 w-3 text-amber-500 inline ml-1" />}</td>
                        <td className="table-td">{item.category}</td>
                        <td className="table-td uppercase text-xs">{item.uom}</td>
                        <td className="table-td text-right">{item.reorder_level}</td>
                        <td className="table-td text-right">{item.opening.toFixed(3)}</td>
                        <td className="table-td text-right">{item.received_supplier.toFixed(3)}</td>
                        <td className="table-td text-right">{item.received_rc.toFixed(3)}</td>
                        <td className="table-td text-right">{item.issued_wip.toFixed(3)}</td>
                        <td className="table-td text-right font-medium">{item.closing.toFixed(3)}</td>
                        <td className="table-td print:hidden">
                          <button className="text-xs text-brand-600" onClick={() => { setIssueItem(item); setIssueQty(""); }}>
                            <Send className="h-3 w-3 inline" /> Issue to WIP
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Incoming modal */}
        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-4">
              <div className="flex justify-between"><h2 className="text-lg font-semibold">Incoming Transfers</h2><button onClick={() => setShowIncoming(false)}><X className="h-5 w-5" /></button></div>
              {incoming.length === 0 ? <p className="text-sm text-gray-400">No pending transfers.</p> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-2 py-1">From</th><th className="px-2 py-1">Product</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1">UOM</th><th className="px-2 py-1"></th></tr></thead>
                  <tbody>
                    {incoming.map(t => (
                      <tr key={t.id}>
                        <td className="px-2 py-1">{t.from_store}</td>
                        <td className="px-2 py-1">{t.product_name} ({t.product_code})</td>
                        <td className="px-2 py-1 text-right">{t.quantity}</td>
                        <td className="px-2 py-1">{t.uom}</td>
                        <td className="px-2 py-1 text-right space-x-1">
                          <button onClick={() => handleIncomingAction(t.id, "accepted")} className="text-green-600 text-xs">Accept</button>
                          <button onClick={() => handleIncomingAction(t.id, "rejected")} className="text-red-600 text-xs">Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Issue modal */}
        {issueItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-white rounded-xl p-6 w-96 space-y-4">
              <h2 className="text-lg font-semibold">Issue to WIP: {issueItem.name}</h2>
              <p className="text-sm text-gray-500">Available (closing): {issueItem.closing.toFixed(3)} {issueItem.uom}</p>
              <input type="number" step="0.001" max={issueItem.closing} className="input" value={issueQty} onChange={e => setIssueQty(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setIssueItem(null)}>Cancel</button>
                <button className="btn-primary" disabled={issuing} onClick={handleIssueToWIP}>Send</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
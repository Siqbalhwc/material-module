"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Package,
  Send, Printer, Wrench, X, Settings2, Factory
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";

// ── Types ─────────────────────────────────────────────────────
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

type SortField =
  "code" | "name" | "category" | "uom"
  | "opening_kg" | "received_kg" | "issued_fg_kg" | "issued_rc_kg" | "closing_kg";
type SortDir = "asc" | "desc";

export default function WIPPage() {
  const supabase = createClient();

  // Date range
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  // Movements
  const [movements, setMovements] = useState<WIPStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [visibleColumns, setVisibleColumns] = useState({
    code: true, name: true, category: true, uom: true,
    opening_kg: true, received_kg: true, issued_fg_kg: true,
    issued_rc_kg: true, closing_kg: true, closing_bags: false,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Incoming
  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  // Production modal
  const [prodItem, setProdItem] = useState<WIPStockMovement | null>(null);
  const [consumed, setConsumed] = useState("");
  const [produced, setProduced] = useState("");
  const [waste, setWaste] = useState("");
  const [fgProductId, setFgProductId] = useState("");
  const [newFgName, setNewFgName] = useState("");
  const [fgList, setFgList] = useState<any[]>([]);
  const [producing, setProducing] = useState(false);

  // ── Fetch movements ─────────────────────────────────────────
  const fetchMovements = async () => {
    setLoading(true);
    if (!startDate || !endDate || startDate > endDate) {
      setMovements([]); setLoading(false); return;
    }

    const start = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom, conversion_kg )")
      .eq("store", "wip");

    if (prodErr || !allProducts) { setMovements([]); setLoading(false); return; }

    const uniqueMap = new Map<string, WIPStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          category: (row.products as any)?.category ?? "",
          uom: (row.products as any)?.uom ?? "",
          conversion_kg: (row.products as any)?.conversion_kg ?? undefined,
          opening_kg: 0, received_kg: 0, issued_fg_kg: 0, issued_rc_kg: 0, closing_kg: 0,
        });
      }
    }
    const items = Array.from(uniqueMap.values());

    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "wip")
        .lt("created_at", start);
      const opening = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
      item.opening_kg = opening;
    }

    for (const item of items) {
      const { data: rangeData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id)
        .eq("store", "wip")
        .gte("created_at", start)
        .lt("created_at", end);

      let received = 0, fg = 0, rc = 0;
      for (const r of (rangeData || [])) {
        if (r.direction === 1) received += r.quantity;
        else if (r.direction === -1) {
          if (r.reference_type === "production_run") {
            // We'll split later; for now treat both as issued
            // We'll refine when production runs are included
            fg += r.quantity;  // All outflows will be captured
          } else rc += r.quantity;
        }
      }
      item.received_kg = received;
      item.issued_fg_kg = fg;
      item.issued_rc_kg = rc;
      item.closing_kg = item.opening_kg + received - (fg + rc);
    }

    setMovements(items);
    setLoading(false);
  };

  // ── Fetch incoming ──────────────────────────────────────────
  const fetchIncoming = async () => {
    const { data } = await supabase
      .from("store_transfers")
      .select(`*, products(code, name)`)
      .eq("to_store", "wip")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) {
      setIncoming(data.map((r: any) => ({
        id: r.id, from_store: r.from_store, product_id: r.product_id,
        product_name: r.products?.name ?? "", product_code: r.products?.code ?? "",
        quantity: r.quantity, uom: r.uom,
      })));
    }
  };

  const fetchFgList = async () => {
    const { data } = await supabase.from("products").select("id, name, code").eq("category", "Finished Good").eq("is_active", true);
    if (data) setFgList(data);
  };

  useEffect(() => { fetchMovements(); fetchIncoming(); fetchFgList(); }, [startDate, endDate]);

  // ── Filtering & sorting ─────────────────────────────────────
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
        case "opening_kg": valA = a.opening_kg; valB = b.opening_kg; break;
        case "received_kg": valA = a.received_kg; valB = b.received_kg; break;
        case "issued_fg_kg": valA = a.issued_fg_kg; valB = b.issued_fg_kg; break;
        case "issued_rc_kg": valA = a.issued_rc_kg; valB = b.issued_rc_kg; break;
        case "closing_kg": valA = a.closing_kg; valB = b.closing_kg; break;
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
  const toggleColumn = (key: keyof typeof visibleColumns) => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Incoming actions ────────────────────────────────────────
  const handleIncomingAction = async (id: string, action: "accepted" | "rejected") => {
    const transfer = incoming.find(t => t.id === id);
    if (!transfer) return;
    try {
      if (action === "accepted") {
        const { error } = await supabase.from("stock_ledger").insert([
          { product_id: transfer.product_id, store: transfer.from_store as StoreType, txn_type: "issued", quantity: transfer.quantity, direction: -1, reference_type: "store_transfer", reference_id: id },
          { product_id: transfer.product_id, store: "wip" as StoreType, txn_type: "received", quantity: transfer.quantity, direction: 1, reference_type: "store_transfer", reference_id: id },
        ]);
        if (error) throw error;
      }
      await supabase.from("store_transfers").update({ status: action, [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString() }).eq("id", id);
      fetchIncoming(); fetchMovements();
    } catch (e: any) { alert(e.message); }
  };

  // ── Production handler ──────────────────────────────────────
  const handleProduction = async () => {
    if (!prodItem) return;
    const cons = parseFloat(consumed);
    const prod = parseFloat(produced);
    const wst = parseFloat(waste);
    if (isNaN(cons) || isNaN(prod) || isNaN(wst) || cons <= 0 || prod < 0 || wst < 0 || cons > prodItem.closing_kg) {
      alert("Invalid quantities."); return;
    }
    if (Math.abs(cons - (prod + wst)) > 0.001) {
      alert(`Total must balance: ${cons} consumed ≠ ${prod} produced + ${wst} waste`); return;
    }
    if (!fgProductId && !newFgName) { alert("Select or create a finished good."); return; }

    setProducing(true);
    try {
      let fgId = fgProductId;
      if (!fgId && newFgName) {
        const { data: newProd, error: createErr } = await supabase.from("products").insert({
          name: newFgName, category: "Finished Good", uom: "kg", is_rc: false, reorder_level: 0,
        }).select().single();
        if (createErr) throw createErr;
        fgId = newProd.id;
        setFgList(prev => [...prev, { id: newProd.id, name: newProd.name, code: newProd.code }]);
      }
      if (!fgId) throw new Error("No finished good product selected.");

      // Create production run
      const { data: pr, error: prErr } = await supabase.from("production_runs").insert({
        raw_material_product_id: prodItem.product_id,
        finished_good_product_id: fgId,
        batch_ref: null,
        kg_consumed: cons,
        kg_produced: prod,
        kg_waste: wst,
      }).select().single();
      if (prErr) throw prErr;

      // Stock ledger: consume RM from WIP, add FG to finished_goods, add waste to rc_store
      const ledgerRows = [
        { product_id: prodItem.product_id, store: "wip" as StoreType, txn_type: "consumed", quantity: cons, direction: -1, reference_type: "production_run", reference_id: pr.id, notes: `Production ${pr.run_number}` },
        { product_id: fgId, store: "finished_goods" as StoreType, txn_type: "produced", quantity: prod, direction: 1, reference_type: "production_run", reference_id: pr.id, notes: `From ${prodItem.name}` },
      ];
      if (wst > 0) {
        // We need a waste product; if not exists, create a generic "Waste" product? 
        // For now we use the raw material product itself moved to rc_store as waste.
        ledgerRows.push({ product_id: prodItem.product_id, store: "rc_store" as StoreType, txn_type: "waste", quantity: wst, direction: 1, reference_type: "production_run", reference_id: pr.id, notes: `Waste from ${pr.run_number}` });
      }
      const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
      if (ledgerErr) throw ledgerErr;

      fetchMovements();
      setProdItem(null);
      setConsumed(""); setProduced(""); setWaste(""); setFgProductId(""); setNewFgName("");
    } catch (e: any) { alert(e.message); }
    finally { setProducing(false); }
  };

  // Auto‑calculate waste when consumed or produced change
  const updateConsumed = (val: string) => {
    setConsumed(val);
    const cons = parseFloat(val);
    const prod = parseFloat(produced);
    if (!isNaN(cons) && !isNaN(prod)) setWaste((cons - prod).toFixed(3));
  };
  const updateProduced = (val: string) => {
    setProduced(val);
    const cons = parseFloat(consumed);
    const prod = parseFloat(val);
    if (!isNaN(cons) && !isNaN(prod)) setWaste((cons - prod).toFixed(3));
  };

  return (
    <>
      <Header title="WIP – Production Management" subtitle="Record production runs with enforced ratio"
        actions={<button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
          <Package className="h-4 w-4" /> {incoming.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{incoming.length}</span>} Incoming
        </button>}
      />
      <main className="flex-1 p-6 space-y-6 print:space-y-4">
        {/* Date range, columns, print */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">From:</label><input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <label className="text-sm font-medium">To:</label><input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative"><button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-md px-2.5 py-1.5" onClick={() => setShowColumnMenu(!showColumnMenu)}><Settings2 className="h-3.5 w-3.5" /> Columns</button>
              {showColumnMenu && <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs"><div className="p-2 space-y-1">
                {Object.entries(visibleColumns).map(([key, value]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"><input type="checkbox" checked={value} onChange={() => toggleColumn(key as keyof typeof visibleColumns)} className="rounded border-gray-300" /><span className="capitalize text-gray-600">{key.replace(/_kg$/, " (KG)").replace(/_bags$/, " (Bags)").replace(/_/g, " ")}</span></label>
                ))}
              </div></div>}
            </div>
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1"><Printer className="h-4 w-4" /> Print / PDF</button>
          </div>
        </div>

        {/* Movement Table */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Stock Movement – {startDate} to {endDate}</h2>
          <div className="relative max-w-sm mb-3 print:hidden"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
          <div className="card overflow-hidden">
            {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? <div className="py-16 text-center text-gray-400">No data for the selected range.</div> :
              <table className="w-full text-sm"><thead className="bg-gray-50"><tr>
                {visibleColumns.code && <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>Code {renderSortIcon("code")}</th>}
                {visibleColumns.name && <th className="table-th cursor-pointer" onClick={() => handleSort("name")}>Name {renderSortIcon("name")}</th>}
                {visibleColumns.category && <th className="table-th cursor-pointer" onClick={() => handleSort("category")}>Category {renderSortIcon("category")}</th>}
                {visibleColumns.uom && <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>UOM {renderSortIcon("uom")}</th>}
                {visibleColumns.opening_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("opening_kg")}>Opening (KG) {renderSortIcon("opening_kg")}</th>}
                {visibleColumns.received_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("received_kg")}>Received (KG) {renderSortIcon("received_kg")}</th>}
                {visibleColumns.issued_fg_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("issued_fg_kg")}>Issued FG (KG) {renderSortIcon("issued_fg_kg")}</th>}
                {visibleColumns.issued_rc_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("issued_rc_kg")}>Issued RC (KG) {renderSortIcon("issued_rc_kg")}</th>}
                {visibleColumns.closing_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("closing_kg")}>Closing (KG) {renderSortIcon("closing_kg")}</th>}
                {visibleColumns.closing_bags && <th className="table-th cursor-pointer text-right">Closing (Bags)</th>}
                <th className="table-th print:hidden"></th>
              </tr></thead><tbody className="divide-y">
                {filtered.map(item => {
                  const hasBags = item.uom === "bags" && item.conversion_kg != null;
                  const toBags = (kg: number) => (kg / item.conversion_kg!).toFixed(3);
                  return (<tr key={item.product_id} className="hover:bg-gray-50">
                    {visibleColumns.code && <td className="table-td font-mono text-xs">{item.code}</td>}
                    {visibleColumns.name && <td className="table-td font-medium">{item.name}</td>}
                    {visibleColumns.category && <td className="table-td">{item.category}</td>}
                    {visibleColumns.uom && <td className="table-td uppercase text-xs">{item.uom}</td>}
                    {visibleColumns.opening_kg && <td className="table-td text-right">{item.opening_kg.toFixed(3)}</td>}
                    {visibleColumns.received_kg && <td className="table-td text-right">{item.received_kg.toFixed(3)}</td>}
                    {visibleColumns.issued_fg_kg && <td className="table-td text-right">{item.issued_fg_kg.toFixed(3)}</td>}
                    {visibleColumns.issued_rc_kg && <td className="table-td text-right">{item.issued_rc_kg.toFixed(3)}</td>}
                    {visibleColumns.closing_kg && <td className="table-td text-right font-medium">{item.closing_kg.toFixed(3)}</td>}
                    {visibleColumns.closing_bags && <td className="table-td text-right font-medium">{hasBags ? toBags(item.closing_kg) : "—"}</td>}
                    <td className="table-td print:hidden">
                      <button className="text-xs text-brand-600" onClick={() => { setProdItem(item); setConsumed(""); setProduced(""); setWaste(""); setFgProductId(""); setNewFgName(""); }}>
                        <Factory className="h-3 w-3 inline" /> Record Production
                      </button>
                    </td>
                  </tr>);
                })}
              </tbody></table>
            }
          </div>
        </section>

        {/* Incoming Modal */}
        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden"><div className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-4">
            <div className="flex justify-between"><h2 className="text-lg font-semibold">Incoming Transfers</h2><button onClick={() => setShowIncoming(false)}><X className="h-5 w-5" /></button></div>
            {incoming.length === 0 ? <p className="text-sm text-gray-400">No pending transfers.</p> :
              <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-2 py-1">From</th><th className="px-2 py-1">Product</th><th className="px-2 py-1 text-right">Qty (KG)</th><th className="px-2 py-1">UOM</th><th className="px-2 py-1"></th></tr></thead><tbody>
                {incoming.map(t => (<tr key={t.id}><td className="px-2 py-1">{t.from_store}</td><td className="px-2 py-1">{t.product_name} ({t.product_code})</td><td className="px-2 py-1 text-right">{t.quantity}</td><td className="px-2 py-1">{t.uom}</td><td className="px-2 py-1 text-right space-x-1">
                  <button onClick={() => handleIncomingAction(t.id, "accepted")} className="text-green-600 text-xs">Accept</button>
                  <button onClick={() => handleIncomingAction(t.id, "rejected")} className="text-red-600 text-xs">Reject</button>
                </td></tr>))}
              </tbody></table>}
          </div></div>
        )}

        {/* Production Modal */}
        {prodItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden"><div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Record Production: {prodItem.name}</h2>
            <p className="text-sm text-gray-500">Available (closing): {prodItem.closing_kg.toFixed(3)} kg</p>
            <div><label className="label">KG Consumed (Raw Material)</label>
              <input type="number" step="0.001" min="0" max={prodItem.closing_kg} className="input" value={consumed} onChange={e => updateConsumed(e.target.value)} />
            </div>
            <div><label className="label">KG Produced (Finished Good)</label>
              <input type="number" step="0.001" min="0" className="input" value={produced} onChange={e => updateProduced(e.target.value)} />
            </div>
            <div><label className="label">KG Waste (auto‑calculated)</label>
              <input type="number" step="0.001" min="0" className="input" value={waste} onChange={e => setWaste(e.target.value)} />
              <p className="text-xs text-gray-400">{consumed && produced ? `${consumed} − ${produced} = ${(parseFloat(consumed)-parseFloat(produced)).toFixed(3)} kg` : ""}</p>
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Finished Good Product</p>
              <select className="input" value={fgProductId} onChange={e => { setFgProductId(e.target.value); setNewFgName(""); }}>
                <option value="">-- Choose existing --</option>
                {fgList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-sm text-gray-500">Or create new:</p>
              <input className="input" placeholder="New FG name" value={newFgName} onChange={e => { setNewFgName(e.target.value); setFgProductId(""); }} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setProdItem(null)}>Cancel</button>
              <button className="btn-primary" disabled={producing} onClick={handleProduction}>{producing ? "Saving..." : "Record Production"}</button>
            </div>
          </div></div>
        )}
      </main>
    </>
  );
}
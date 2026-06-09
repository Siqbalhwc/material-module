"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Package, Send, Printer, Wrench, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import type { StoreType } from "@/types";

type WIPStock = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  opening: number;
  received: number;
  issued_fg: number;
  issued_rc: number;
  closing: number;
};

type PendingTransfer = {
  id: string;
  from_store: string;
  to_store: string;
  product_id: string;
  product_name: string;
  product_code: string;
  uom: string;
  quantity: number;
  created_at: string;
};

type FGProductOption = { id: string; name: string; code: string };

type SortField = "code" | "name" | "category" | "uom" | "closing";
type SortDir = "asc" | "desc";

export default function WIPPage() {
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [stock, setStock] = useState<WIPStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Incoming transfers (from Material Store) – pending
  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  // Transfer out modal
  const [transferItem, setTransferItem] = useState<WIPStock | null>(null);
  const [transferTarget, setTransferTarget] = useState<"rc" | "fg">("rc");
  const [transferQty, setTransferQty] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [fgProducts, setFgProducts] = useState<FGProductOption[]>([]);
  const [selectedFGProduct, setSelectedFGProduct] = useState("");
  const [newFGName, setNewFGName] = useState("");
  const [newFGWeight, setNewFGWeight] = useState("");

  // ── Fetch stock (same monthly movement logic) ─────────────
  const fetchStock = async () => {
    setLoadingStock(true);
    const monthStart = selectedMonth + "-01";
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 7) + "-01";

    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom )")
      .eq("store", "wip");

    if (prodErr || !allProducts) { setStock([]); setLoadingStock(false); return; }

    const uniqueMap = new Map<string, any>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          category: (row.products as any)?.category ?? "",
          uom: (row.products as any)?.uom ?? "",
          opening: 0, received: 0, issued_fg: 0, issued_rc: 0, closing: 0,
        });
      }
    }
    const stockItems = Array.from(uniqueMap.values());

    for (const item of stockItems) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "wip")
        .lt("created_at", monthStart);
      const opening = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
      item.opening = opening;

      const { data: monthData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id)
        .eq("store", "wip")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      let received = 0, fg = 0, rc = 0;
      for (const r of (monthData || [])) {
        if (r.direction === 1) received += r.quantity;
        else if (r.direction === -1) {
          if (r.reference_type === "fg_transfer") fg += r.quantity;
          else if (r.reference_type === "rc_movement") rc += r.quantity;
        }
      }
      item.received = received;
      item.issued_fg = fg;
      item.issued_rc = rc;
      item.closing = item.opening + received - (fg + rc);
    }
    setStock(stockItems);
    setLoadingStock(false);
  };

  // ── Fetch incoming transfers (to wip, pending) ────────────
  const fetchIncoming = async () => {
    const { data } = await supabase
      .from("store_transfers")
      .select(`*, products(code, name)`)
      .eq("to_store", "wip")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) {
      const mapped: PendingTransfer[] = data.map((r: any) => ({
        id: r.id,
        from_store: r.from_store,
        to_store: r.to_store,
        product_id: r.product_id,
        product_name: r.products?.name ?? "",
        product_code: r.products?.code ?? "",
        uom: r.uom,
        quantity: r.quantity,
        created_at: r.created_at,
      }));
      setIncoming(mapped);
    }
  };

  useEffect(() => { fetchStock(); fetchIncoming(); }, [selectedMonth]);

  // ── Stock sorting/filtering ───────────────────────────────
  const filteredStock = useMemo(() => {
    let list = [...stock];
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
        case "closing": valA = a.closing; valB = b.closing; break;
        default: return 0;
      }
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [stock, searchQuery, sortField, sortDir]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(p => p === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };
  const sortIcon = (f: SortField) => {
    if (sortField !== f) return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  };

  const handlePrint = () => window.print();

  // ── Accept / Reject incoming transfer ─────────────────────
  const handleIncomingAction = async (transferId: string, action: "accepted" | "rejected") => {
    try {
      const transfer = incoming.find(t => t.id === transferId);
      if (!transfer) return;

      if (action === "accepted") {
        const ledgerRows = [
          {
            product_id: transfer.product_id,
            store: transfer.from_store as StoreType,
            txn_type: "issued",
            quantity: transfer.quantity,
            direction: -1,
            reference_type: "store_transfer",
            reference_id: transfer.id,
            notes: `Sent to WIP`,
          },
          {
            product_id: transfer.product_id,
            store: "wip" as StoreType,
            txn_type: "received",
            quantity: transfer.quantity,
            direction: 1,
            reference_type: "store_transfer",
            reference_id: transfer.id,
            notes: `Received from ${transfer.from_store}`,
          },
        ];
        const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
        if (ledgerErr) throw ledgerErr;
      }

      const { error: updateErr } = await supabase
        .from("store_transfers")
        .update({ status: action, [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString() })
        .eq("id", transferId);
      if (updateErr) throw updateErr;

      fetchIncoming();
      fetchStock();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ── Transfer out (creates pending transfer) ──────────────
  const handleTransferOut = async () => {
    if (!transferItem) return;
    const qty = parseFloat(transferQty);
    if (isNaN(qty) || qty <= 0 || qty > transferItem.closing) {
      alert("Invalid quantity.");
      return;
    }
    if (transferTarget === "fg" && !selectedFGProduct && !newFGName) {
      alert("Select or create a finished good.");
      return;
    }

    setTransferring(true);
    try {
      let toStore = transferTarget === "rc" ? "rc_store" : "finished_goods";
      let fgProductId = selectedFGProduct;
      if (transferTarget === "fg" && !fgProductId && newFGName) {
        const { data: newProd, error: prodErr } = await supabase
          .from("products")
          .insert({ name: newFGName, category: "Finished Good", uom: "kg", is_rc: false, reorder_level: 0 })
          .select()
          .single();
        if (prodErr) throw prodErr;
        fgProductId = newProd.id;
        setFgProducts(prev => [...prev, { id: newProd.id, name: newProd.name, code: newProd.code }]);
      }

      const { error } = await supabase.from("store_transfers").insert({
        from_store: "wip",
        to_store: toStore,
        product_id: transferItem.product_id,
        quantity: qty,
        uom: transferItem.uom,
        status: "pending",
        notes: `Transfer from WIP to ${toStore}`,
      });
      if (error) throw error;

      alert("Transfer sent to " + toStore);
      fetchStock();
      setTransferItem(null);
      setTransferQty("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <>
      <Header
        title="WIP – Production Management"
        subtitle="Accept incoming materials, view stock, and transfer to RC or FG"
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
      <main className="flex-1 p-6 space-y-8 print:space-y-4">
        {/* Month & Print */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Month:</label>
            <input type="month" className="input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
          </div>
          <button onClick={handlePrint} className="btn-secondary"><Printer className="h-4 w-4" /> Print</button>
        </div>

        {/* Stock Movement Table */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Stock Movement – {selectedMonth}</h2>
          <div className="relative max-w-sm mb-3 print:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="card overflow-hidden">
            {loadingStock ? <div className="py-16 text-center text-gray-400">Loading…</div> : filteredStock.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No stock.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>Code {sortIcon("code")}</th>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("name")}>Name {sortIcon("name")}</th>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("category")}>Category {sortIcon("category")}</th>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>UOM {sortIcon("uom")}</th>
                    <th className="table-th text-right">Opening</th>
                    <th className="table-th text-right">Received</th>
                    <th className="table-th text-right">Issued FG</th>
                    <th className="table-th text-right">Issued RC</th>
                    <th className="table-th text-right">Closing</th>
                    <th className="table-th print:hidden"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredStock.map(item => (
                    <tr key={item.product_id} className="hover:bg-gray-50">
                      <td className="table-td font-mono text-xs">{item.code}</td>
                      <td className="table-td font-medium">{item.name}</td>
                      <td className="table-td">{item.category}</td>
                      <td className="table-td uppercase text-xs">{item.uom}</td>
                      <td className="table-td text-right">{item.opening.toFixed(3)}</td>
                      <td className="table-td text-right">{item.received.toFixed(3)}</td>
                      <td className="table-td text-right">{item.issued_fg.toFixed(3)}</td>
                      <td className="table-td text-right">{item.issued_rc.toFixed(3)}</td>
                      <td className="table-td text-right font-medium">{item.closing.toFixed(3)}</td>
                      <td className="table-td print:hidden">
                        <button className="text-xs text-brand-600" onClick={() => { setTransferItem(item); setTransferQty(""); setTransferTarget("rc"); }}>
                          <Send className="h-3 w-3 inline" /> Transfer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Incoming transfers modal */}
        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4">
              <div className="flex justify-between">
                <h2 className="text-lg font-semibold">Incoming Transfers</h2>
                <button onClick={() => setShowIncoming(false)}><X className="h-5 w-5" /></button>
              </div>
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

        {/* Transfer Out modal (simplified) */}
        {transferItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h2 className="text-lg font-semibold">Transfer: {transferItem.name}</h2>
              <p className="text-sm text-gray-500">Available: {transferItem.closing.toFixed(3)} {transferItem.uom}</p>
              <input type="number" step="0.001" max={transferItem.closing} className="input" value={transferQty} onChange={e => setTransferQty(e.target.value)} />
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" value="rc" checked={transferTarget === "rc"} onChange={() => setTransferTarget("rc")} /> RC Store</label>
                <label className="flex items-center gap-2"><input type="radio" value="fg" checked={transferTarget === "fg"} onChange={() => setTransferTarget("fg")} /> Finished Goods</label>
              </div>
              {transferTarget === "fg" && (
                <div className="space-y-2">
                  <select className="input" value={selectedFGProduct} onChange={e => setSelectedFGProduct(e.target.value)}>
                    <option value="">-- Choose existing --</option>
                    {fgProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input className="input" placeholder="Or new FG name" value={newFGName} onChange={e => setNewFGName(e.target.value)} />
                  <input className="input" type="number" placeholder="Weight (kg)" value={newFGWeight} onChange={e => setNewFGWeight(e.target.value)} />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setTransferItem(null)}>Cancel</button>
                <button className="btn-primary" disabled={transferring} onClick={handleTransferOut}>Send</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
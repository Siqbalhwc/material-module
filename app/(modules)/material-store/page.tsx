"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Package, AlertTriangle, Send, Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import type { StoreType } from "@/types";

type MaterialStock = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  balance: number;
  reorder_level: number;
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

type SortField = "code" | "name" | "category" | "uom" | "balance" | "reorder_level";
type SortDir = "asc" | "desc";

export default function MaterialStorePage() {
  const supabase = createClient();
  const [stock, setStock] = useState<MaterialStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Pending transfers FROM RC Store (to us)
  const [incomingTransfers, setIncomingTransfers] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  // Issue to WIP modal
  const [issueItem, setIssueItem] = useState<MaterialStock | null>(null);
  const [issueQty, setIssueQty] = useState("");
  const [issuing, setIssuing] = useState(false);

  // ── Fetch stock ──────────────────────────────────────────
  const fetchStock = async () => {
    const { data, error } = await supabase
      .from("stock_balance")
      .select(`product_id, balance, products ( code, name, category, uom, reorder_level )`)
      .eq("store", "material_store");

    if (!error && data) {
      const mapped: MaterialStock[] = (data || [])
        .filter((row: any) => {
          const cat = row.products?.category;
          return cat === "Raw Material" || cat === "Chemical";
        })
        .map((row: any) => ({
          product_id: row.product_id,
          code: row.products?.code ?? "",
          name: row.products?.name ?? "Unknown",
          category: row.products?.category ?? "",
          uom: row.products?.uom ?? "",
          balance: row.balance ?? 0,
          reorder_level: row.products?.reorder_level ?? 0,
        }));
      setStock(mapped);
    }
    setLoading(false);
  };

  // ── Fetch incoming transfers (to material_store, status pending) ──
  const fetchIncoming = async () => {
    const { data, error } = await supabase
      .from("store_transfers")
      .select(`*, products(code, name)`)
      .eq("to_store", "material_store")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: PendingTransfer[] = data.map((r: any) => ({
        id: r.id,
        from_store: r.from_store,
        to_store: r.to_store,
        product_id: r.product_id,
        product_name: r.products?.name ?? "Unknown",
        product_code: r.products?.code ?? "",
        uom: r.uom,
        quantity: r.quantity,
        created_at: r.created_at,
      }));
      setIncomingTransfers(mapped);
    }
  };

  useEffect(() => {
    fetchStock();
    fetchIncoming();
  }, []);

  // ── Stock filtering & sorting ──────────────────────────────
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
        case "balance": valA = a.balance; valB = b.balance; break;
        case "reorder_level": valA = a.reorder_level; valB = b.reorder_level; break;
        default: return 0;
      }
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [stock, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  };

  // ── Issue to WIP handler ───────────────────────────────────
  const handleIssueToWIP = async () => {
    if (!issueItem) return;
    const qty = parseFloat(issueQty);
    if (isNaN(qty) || qty <= 0 || qty > issueItem.balance) {
      alert("Enter a valid quantity (max " + issueItem.balance + ")");
      return;
    }
    setIssuing(true);
    try {
      const { error } = await supabase.from("store_transfers").insert({
        from_store: "material_store",
        to_store: "wip",
        product_id: issueItem.product_id,
        quantity: qty,
        uom: issueItem.uom,
        status: "pending",
        notes: `Issued to WIP`,
      });
      if (error) throw error;
      alert("Transfer sent to WIP for acceptance.");
      fetchStock();
      setIssueItem(null);
      setIssueQty("");
    } catch (err: any) {
      console.error(err);
      alert("Failed to create transfer: " + (err.message || ""));
    } finally {
      setIssuing(false);
    }
  };

  // ── Handle incoming transfer (accept/reject from RC) ──────
  const handleIncomingAction = async (transferId: string, action: "accepted" | "rejected") => {
    try {
      const transfer = incomingTransfers.find(t => t.id === transferId);
      if (!transfer) return;

      if (action === "accepted") {
        // Move stock: -rc_store, +material_store
        const ledgerRows = [
          {
            product_id: transfer.product_id,
            store: transfer.from_store as StoreType,
            txn_type: "issued",
            quantity: transfer.quantity,
            direction: -1,
            reference_type: "store_transfer",
            reference_id: transfer.id,
            notes: `Sent to Material Store`,
          },
          {
            product_id: transfer.product_id,
            store: "material_store" as StoreType,
            txn_type: "received",
            quantity: transfer.quantity,
            direction: 1,
            reference_type: "store_transfer",
            reference_id: transfer.id,
            notes: `Received from RC Store`,
          },
        ];
        const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
        if (ledgerErr) throw ledgerErr;
      }

      // Update transfer status
      const { error: updateErr } = await supabase
        .from("store_transfers")
        .update({
          status: action,
          [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString(),
        })
        .eq("id", transferId);
      if (updateErr) throw updateErr;

      fetchIncoming();
      fetchStock();
    } catch (err: any) {
      console.error(err);
      alert("Action failed: " + (err.message || ""));
    }
  };

  return (
    <>
      <Header
        title="Material Store (Raw Materials & Chemicals)"
        subtitle="Current stock of production inputs"
        actions={
          <button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
            <Bell className="h-4 w-4" />
            {incomingTransfers.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {incomingTransfers.length}
              </span>
            )}
            Incoming
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or code..."
            className="input pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filteredStock.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Package className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No stock recorded yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {(["code", "name", "category", "uom", "balance", "reorder_level"] as SortField[]).map((field) => (
                    <th key={field} className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort(field)}>
                      <span className="inline-flex items-center">
                        {field === "reorder_level" ? "Reorder Level" : field.charAt(0).toUpperCase() + field.slice(1)}
                        {renderSortIcon(field)}
                      </span>
                    </th>
                  ))}
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredStock.map((item) => {
                  const lowStock = item.balance <= item.reorder_level && item.reorder_level > 0;
                  return (
                    <tr key={item.product_id} className={cn("hover:bg-gray-50 transition-colors", lowStock && "bg-amber-50")}>
                      <td className="table-td font-mono text-xs font-medium text-brand-600">{item.code}</td>
                      <td className="table-td font-medium text-gray-900">
                        {item.name}
                        {lowStock && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline ml-2" />}
                      </td>
                      <td className="table-td text-gray-500">{item.category}</td>
                      <td className="table-td text-xs uppercase text-gray-500">{item.uom}</td>
                      <td className="table-td font-medium">{item.balance.toFixed(3)}</td>
                      <td className="table-td">{item.reorder_level}</td>
                      <td className="table-td">
                        <button
                          className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                          onClick={() => { setIssueItem(item); setIssueQty(""); }}
                        >
                          <Send className="h-3 w-3" /> Issue to WIP
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Incoming transfers modal */}
        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Incoming Transfers</h2>
                <button onClick={() => setShowIncoming(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {incomingTransfers.length === 0 ? (
                <p className="text-sm text-gray-400">No pending transfers.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-2 py-1 text-left">From</th>
                      <th className="px-2 py-1 text-left">Product</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                      <th className="px-2 py-1 text-left">UOM</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incomingTransfers.map(t => (
                      <tr key={t.id}>
                        <td className="px-2 py-1">{t.from_store}</td>
                        <td className="px-2 py-1">{t.product_name} <span className="text-xs text-gray-400">({t.product_code})</span></td>
                        <td className="px-2 py-1 text-right">{t.quantity}</td>
                        <td className="px-2 py-1">{t.uom}</td>
                        <td className="px-2 py-1 text-right space-x-1">
                          <button onClick={() => handleIncomingAction(t.id, "accepted")} className="text-xs text-green-600 hover:text-green-700">Accept</button>
                          <button onClick={() => handleIncomingAction(t.id, "rejected")} className="text-xs text-red-600 hover:text-red-700">Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Issue to WIP modal */}
        {issueItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h2 className="text-lg font-semibold">Issue to WIP: {issueItem.name}</h2>
              <p className="text-sm text-gray-500">Available: {issueItem.balance.toFixed(3)} {issueItem.uom}</p>
              <input
                type="number"
                step="0.001"
                min="0"
                max={issueItem.balance}
                className="input"
                value={issueQty}
                onChange={(e) => setIssueQty(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setIssueItem(null)}>Cancel</button>
                <button className="btn-primary" disabled={issuing} onClick={handleIssueToWIP}>
                  {issuing ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
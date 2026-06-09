"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Package, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import type { StoreType } from "@/types";

type RCStock = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  balance: number;
};

type PendingTransfer = {
  id: string;
  from_store: string;
  product_name: string;
  product_code: string;
  quantity: number;
  uom: string;
};

type SortField = "code" | "name" | "category" | "uom" | "balance";
type SortDir = "asc" | "desc";

export default function RCStorePage() {
  const supabase = createClient();
  const [stock, setStock] = useState<RCStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  const [issueItem, setIssueItem] = useState<RCStock | null>(null);
  const [issueQty, setIssueQty] = useState("");
  const [issuing, setIssuing] = useState(false);

  // Fetch stock
  const fetchStock = async () => {
    const { data, error } = await supabase
      .from("stock_balance")
      .select(`product_id, balance, products ( code, name, category, uom )`)
      .eq("store", "rc_store");
    if (!error && data) {
      setStock(data.map((row: any) => ({
        product_id: row.product_id,
        code: row.products?.code ?? "",
        name: row.products?.name ?? "",
        category: row.products?.category ?? "",
        uom: row.products?.uom ?? "",
        balance: row.balance,
      })));
    }
    setLoadingStock(false);
  };

  // Fetch incoming transfers (to rc_store, pending)
  const fetchIncoming = async () => {
    const { data } = await supabase
      .from("store_transfers")
      .select(`*, products(code, name)`)
      .eq("to_store", "rc_store")
      .eq("status", "pending");
    if (data) {
      setIncoming(data.map((r: any) => ({
        id: r.id,
        from_store: r.from_store,
        product_name: r.products?.name ?? "",
        product_code: r.products?.code ?? "",
        quantity: r.quantity,
        uom: r.uom,
      })));
    }
  };

  useEffect(() => { fetchStock(); fetchIncoming(); }, []);

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
        default: return 0;
      }
      return typeof valA === "string" ? valA.localeCompare(valB) * (sortDir === "asc" ? 1 : -1) : (valA - valB) * (sortDir === "asc" ? 1 : -1);
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

  // Accept/Reject incoming
  const handleIncomingAction = async (transferId: string, action: "accepted" | "rejected") => {
    const transfer = incoming.find(t => t.id === transferId);
    if (!transfer) return;
    try {
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
          },
          {
            product_id: transfer.product_id,
            store: "rc_store" as StoreType,
            txn_type: "received",
            quantity: transfer.quantity,
            direction: 1,
            reference_type: "store_transfer",
            reference_id: transfer.id,
          },
        ];
        const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
        if (ledgerErr) throw ledgerErr;
      }
      await supabase.from("store_transfers").update({ status: action, [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString() }).eq("id", transferId);
      fetchIncoming();
      fetchStock();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Issue to Material Store
  const handleIssueToMS = async () => {
    if (!issueItem) return;
    const qty = parseFloat(issueQty);
    if (isNaN(qty) || qty <= 0 || qty > issueItem.balance) {
      alert("Invalid quantity.");
      return;
    }
    setIssuing(true);
    try {
      await supabase.from("store_transfers").insert({
        from_store: "rc_store",
        to_store: "material_store",
        product_id: issueItem.product_id,
        quantity: qty,
        uom: issueItem.uom,
        status: "pending",
      });
      alert("Transfer sent to Material Store.");
      fetchStock();
      setIssueItem(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIssuing(false);
    }
  };

  return (
    <>
      <Header title="RC Store" subtitle="Returnable component movements"
        actions={
          <button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
            <Package className="h-4 w-4" />
            {incoming.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{incoming.length}</span>}
            Incoming
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-4">Current RC Stock</h2>
          <div className="relative max-w-sm mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="card overflow-hidden">
            {loadingStock ? <div className="py-16 text-center text-gray-400">Loading…</div> : filteredStock.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No stock.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>Code {sortIcon("code")}</th>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("name")}>Name {sortIcon("name")}</th>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("category")}>Category {sortIcon("category")}</th>
                    <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>UOM {sortIcon("uom")}</th>
                    <th className="table-th text-right cursor-pointer" onClick={() => handleSort("balance")}>Balance {sortIcon("balance")}</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredStock.map(item => (
                    <tr key={item.product_id} className="hover:bg-gray-50">
                      <td className="table-td font-mono text-xs">{item.code}</td>
                      <td className="table-td font-medium">{item.name}</td>
                      <td className="table-td">{item.category}</td>
                      <td className="table-td uppercase text-xs">{item.uom}</td>
                      <td className="table-td text-right">{item.balance.toFixed(3)}</td>
                      <td className="table-td">
                        <button className="text-xs text-brand-600" onClick={() => { setIssueItem(item); setIssueQty(""); }}>
                          <Send className="h-3 w-3 inline" /> Issue to MS
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4">
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

        {issueItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 space-y-4 w-96">
              <h2 className="text-lg font-semibold">Issue to Material Store: {issueItem.name}</h2>
              <p className="text-sm text-gray-500">Available: {issueItem.balance.toFixed(3)}</p>
              <input type="number" step="0.001" max={issueItem.balance} className="input" value={issueQty} onChange={e => setIssueQty(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setIssueItem(null)}>Cancel</button>
                <button className="btn-primary" disabled={issuing} onClick={handleIssueToMS}>Send</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
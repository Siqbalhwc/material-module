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

type PendingReqItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  uom: string;
  requested_qty: number;
  bags_qty?: number | null;
};

type PendingReq = {
  id: string;
  req_number: string;
  required_date: string | null;
  items: PendingReqItem[];
};

type SortField = "code" | "name" | "category" | "uom" | "balance" | "reorder_level";
type SortDir = "asc" | "desc";

export default function MaterialStorePage() {
  const [stock, setStock] = useState<MaterialStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [pendingReqs, setPendingReqs] = useState<PendingReq[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [showReqModal, setShowReqModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState<PendingReq | null>(null);
  const [issueQtys, setIssueQtys] = useState<Record<string, number>>({});
  const [issuing, setIssuing] = useState(false);

  const supabase = createClient();

  const fetchStock = async () => {
    const { data, error } = await supabase
      .from("stock_balance")
      .select(`product_id, balance, products ( code, name, category, uom, reorder_level )`)
      .eq("store", "material_store");

    if (error) {
      console.error("Failed to fetch material store:", error);
    } else {
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

  const fetchPendingReqs = async () => {
    const { data, error } = await supabase
      .from("requisitions")
      .select(`id, req_number, required_date, requisition_items(id, product_id, requested_qty, bags_qty, products(code, name, uom))`)
      .eq("from_store", "material_store")
      .eq("to_store", "wip")
      .eq("status", "submitted")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: PendingReq[] = data.map((r: any) => ({
        id: r.id,
        req_number: r.req_number,
        required_date: r.required_date,
        items: (r.requisition_items || []).map((it: any) => ({
          id: it.id,
          product_id: it.product_id,
          product_name: it.products?.name ?? "Unknown",
          product_code: it.products?.code ?? "",
          uom: it.uom,
          requested_qty: it.requested_qty,
          bags_qty: it.bags_qty,
        })),
      }));
      setPendingReqs(mapped);
    } else if (error) {
      console.error("Failed to fetch pending requisitions:", error);
    }
    setLoadingReqs(false);
  };

  useEffect(() => {
    fetchStock();
    fetchPendingReqs();
  }, []);

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

  const openIssueModal = (req: PendingReq) => {
    setSelectedReq(req);
    const initialQtys: Record<string, number> = {};
    req.items.forEach(it => { initialQtys[it.id] = it.requested_qty; });
    setIssueQtys(initialQtys);
    setShowReqModal(true);
  };

  const handleIssue = async () => {
    if (!selectedReq) return;
    setIssuing(true);
    try {
      const { error: reqErr } = await supabase
        .from("requisitions")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", selectedReq.id);
      if (reqErr) throw reqErr;

      const ledgerRows = selectedReq.items.map(it => ({
        product_id: it.product_id,
        store: "material_store" as StoreType,
        txn_type: "issued",
        quantity: issueQtys[it.id] ?? it.requested_qty,
        direction: -1,
        reference_type: "requisition",
        reference_id: selectedReq.id,
        notes: `Issued to WIP – Req ${selectedReq.req_number}`,
      }));

      const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
      if (ledgerErr) throw ledgerErr;

      for (const it of selectedReq.items) {
        const qty = issueQtys[it.id] ?? it.requested_qty;
        await supabase
          .from("requisition_items")
          .update({ issued_qty: qty })
          .eq("id", it.id);
      }

      setShowReqModal(false);
      setSelectedReq(null);
      fetchStock();
      fetchPendingReqs();
    } catch (err: any) {
      console.error("Issue failed:", err);
      alert("Failed to issue: " + (err.message || "Unknown error"));
    } finally {
      setIssuing(false);
    }
  };

  return (
    <>
      <Header
        title="Material Store (Raw Materials & Chemicals)"
        subtitle="Current stock of production inputs"
        actions={
          <button
            className="relative btn-secondary flex items-center gap-2"
            onClick={() => setShowReqModal(true)}
          >
            <Bell className="h-4 w-4" />
            {pendingReqs.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {pendingReqs.length}
              </span>
            )}
            Requests
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
              <p className="text-sm">{searchQuery ? "No items match your search" : "No stock recorded yet"}</p>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pending Requisitions Modal */}
        {showReqModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">Pending Requisitions</h2>
                <button onClick={() => setShowReqModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingReqs ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : pendingReqs.length === 0 ? (
                <p className="text-sm text-gray-400">No pending requisitions.</p>
              ) : (
                <div className="space-y-4">
                  {pendingReqs.map(req => (
                    <div key={req.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-800">{req.req_number}</p>
                          {req.required_date && <p className="text-xs text-gray-500">Required by {formatDate(req.required_date)}</p>}
                        </div>
                        <button
                          className="btn-primary text-xs py-1 px-3 inline-flex items-center gap-1"
                          onClick={() => openIssueModal(req)}
                        >
                          <Send className="h-3 w-3" /> Issue
                        </button>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="text-gray-500 border-b">
                          <tr>
                            <th className="text-left py-1">Product</th>
                            <th className="text-left">Code</th>
                            <th className="text-right">Bags</th>
                            <th className="text-right">Qty (KG)</th>
                            <th className="text-left">UOM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {req.items.map(it => (
                            <tr key={it.id}>
                              <td className="py-1">{it.product_name}</td>
                              <td className="py-1 font-mono">{it.product_code}</td>
                              <td className="py-1 text-right">{it.bags_qty != null ? it.bags_qty : "—"}</td>
                              <td className="py-1 text-right">{it.requested_qty}</td>
                              <td className="py-1 uppercase">{it.uom}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Issue Modal */}
        {selectedReq && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">
                  Issue: {selectedReq.req_number}
                </h2>
                <button onClick={() => setSelectedReq(null)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Adjust issued quantities if needed, then confirm.<br />
                <span className="text-xs text-red-600 font-medium">
                  ⚠ You cannot issue more than the available stock.
                </span>
              </p>

              <table className="w-full text-sm">
                <thead className="text-gray-600 border-b">
                  <tr>
                    <th className="text-left py-1">Product</th>
                    <th className="text-left">Code</th>
                    <th className="text-right">Bags</th>
                    <th className="text-right">Requested</th>
                    <th className="text-right">Available</th>
                    <th className="text-right">Issue Qty</th>
                    <th className="text-left">UOM</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedReq.items.map((it) => {
                    const stockItem = stock.find((s) => s.product_id === it.product_id);
                    const available = stockItem ? stockItem.balance : 0;
                    const issueQty = issueQtys[it.id] ?? it.requested_qty;
                    const overIssue = issueQty > available;

                    return (
                      <tr key={it.id} className={cn(overIssue && "bg-red-50")}>
                        <td className="py-2">{it.product_name}</td>
                        <td className="py-2 font-mono text-xs">{it.product_code}</td>
                        <td className="py-2 text-right">{it.bags_qty != null ? it.bags_qty : "—"}</td>
                        <td className="py-2 text-right">{it.requested_qty}</td>
                        <td className="py-2 text-right font-medium">{available.toFixed(3)}</td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            max={available}
                            className={cn("input w-20 text-right", overIssue && "border-red-400 bg-red-50")}
                            value={issueQty}
                            onChange={(e) =>
                              setIssueQtys((prev) => ({
                                ...prev,
                                [it.id]: parseFloat(e.target.value) || 0,
                              }))
                            }
                          />
                          {overIssue && <p className="text-xs text-red-600 mt-1">Exceeds available</p>}
                        </td>
                        <td className="py-2 uppercase">{it.uom}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {selectedReq.items.some((it) => {
                const stockItem = stock.find((s) => s.product_id === it.product_id);
                const available = stockItem ? stockItem.balance : 0;
                const issueQty = issueQtys[it.id] ?? it.requested_qty;
                return issueQty > available;
              }) && (
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md border border-red-200">
                  One or more items exceed the available stock. Please reduce the quantities before confirming.
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setSelectedReq(null)}>Cancel</button>
                <button
                  className="btn-primary"
                  disabled={
                    issuing ||
                    selectedReq.items.some((it) => {
                      const stockItem = stock.find((s) => s.product_id === it.product_id);
                      const available = stockItem ? stockItem.balance : 0;
                      const issueQty = issueQtys[it.id] ?? it.requested_qty;
                      return issueQty > available || issueQty <= 0;
                    })
                  }
                  onClick={handleIssue}
                >
                  {issuing ? "Issuing..." : "Confirm Issue"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
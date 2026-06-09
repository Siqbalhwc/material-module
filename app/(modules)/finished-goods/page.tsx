"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, Package, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { StoreType } from "@/types";

type FGStock = {
  product_id: string;
  code: string;
  name: string;
  uom: string;
  balance: number;
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

type SortField = "code" | "name" | "uom" | "balance";

export default function FinishedGoodsPage() {
  const supabase = createClient();
  const [stock, setStock] = useState<FGStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  const fetchStock = async () => {
    const { data } = await supabase
      .from("stock_balance")
      .select("product_id, balance, products(code, name, uom)")
      .eq("store", "finished_goods");
    if (data) {
      setStock(data.map((r: any) => ({
        product_id: r.product_id,
        code: r.products?.code ?? "",
        name: r.products?.name ?? "",
        uom: r.products?.uom ?? "",
        balance: r.balance,
      })));
    }
    setLoading(false);
  };

  const fetchIncoming = async () => {
    const { data } = await supabase
      .from("store_transfers")
      .select(`*, products(name, code)`)
      .eq("to_store", "finished_goods")
      .eq("status", "pending");
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
    fetchStock();
    fetchIncoming();
  }, []);

  const handleAcceptReject = async (id: string, action: "accepted" | "rejected") => {
    const transfer = incoming.find(t => t.id === id);
    if (!transfer) return;
    try {
      if (action === "accepted") {
        const { error } = await supabase.from("stock_ledger").insert([
          {
            product_id: transfer.product_id,
            store: transfer.from_store as StoreType,
            txn_type: "issued",
            quantity: transfer.quantity,
            direction: -1,
            reference_type: "store_transfer",
            reference_id: id,
          },
          {
            product_id: transfer.product_id,
            store: "finished_goods" as StoreType,
            txn_type: "received",
            quantity: transfer.quantity,
            direction: 1,
            reference_type: "store_transfer",
            reference_id: id,
          },
        ]);
        if (error) throw error;
      }
      await supabase
        .from("store_transfers")
        .update({
          status: action,
          [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString(),
        })
        .eq("id", id);
      fetchIncoming();
      fetchStock();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Safe sort helper
  const sorted = useMemo(() => {
    let list = [...stock].filter(
      i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.code.toLowerCase().includes(search.toLowerCase())
    );
    list.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === "string" && typeof valB === "string") {
        return valA.localeCompare(valB) * (sortDir === "asc" ? 1 : -1);
      } else {
        const numA = Number(valA ?? 0);
        const numB = Number(valB ?? 0);
        return (numA - numB) * (sortDir === "asc" ? 1 : -1);
      }
    });
    return list;
  }, [stock, search, sortField, sortDir]);

  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <>
      <Header title="Finished Goods" subtitle="Final product inventory" />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="input pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className="btn-secondary relative"
            onClick={() => setShowIncoming(true)}
          >
            <Package className="h-4 w-4" /> Incoming{" "}
            {incoming.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {incoming.length}
              </span>
            )}
          </button>
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No stock.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="table-th cursor-pointer"
                    onClick={() => handleSortClick("code")}
                  >
                    Code
                  </th>
                  <th
                    className="table-th cursor-pointer"
                    onClick={() => handleSortClick("name")}
                  >
                    Name
                  </th>
                  <th
                    className="table-th cursor-pointer"
                    onClick={() => handleSortClick("uom")}
                  >
                    UOM
                  </th>
                  <th
                    className="table-th text-right cursor-pointer"
                    onClick={() => handleSortClick("balance")}
                  >
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(item => (
                  <tr key={item.product_id}>
                    <td className="table-td font-mono text-xs">{item.code}</td>
                    <td className="table-td font-medium">{item.name}</td>
                    <td className="table-td uppercase text-xs">{item.uom}</td>
                    <td className="table-td text-right">{item.balance.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-4">
              <div className="flex justify-between">
                <h2 className="text-lg font-semibold">Incoming Transfers</h2>
                <button onClick={() => setShowIncoming(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              {incoming.length === 0 ? (
                <p className="text-sm text-gray-400">No pending transfers.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1">From</th>
                      <th className="px-2 py-1">Product</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                      <th className="px-2 py-1">UOM</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {incoming.map(t => (
                      <tr key={t.id}>
                        <td className="px-2 py-1">{t.from_store}</td>
                        <td className="px-2 py-1">
                          {t.product_name} ({t.product_code})
                        </td>
                        <td className="px-2 py-1 text-right">{t.quantity}</td>
                        <td className="px-2 py-1">{t.uom}</td>
                        <td className="px-2 py-1 text-right space-x-1">
                          <button
                            onClick={() => handleAcceptReject(t.id, "accepted")}
                            className="text-green-600 text-xs"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleAcceptReject(t.id, "rejected")}
                            className="text-red-600 text-xs"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
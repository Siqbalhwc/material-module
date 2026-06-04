"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import { BarChart3, AlertTriangle } from "lucide-react";
import { stockApi } from "@/lib/api/client";
import { cn, STORE_LABELS, STORE_COLORS, formatNumber } from "@/lib/utils";
import type { StockBalance, StoreType } from "@/types";

const STORES: StoreType[] = [
  "material_store", "production_storage", "wip", "rc_store", "finished_goods",
];

export default function StockBalancePage() {
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStore, setActiveStore] = useState<StoreType | "all">("all");

  useEffect(() => {
    stockApi.balance()
      .then((r) => setBalances(r.data?.data || []))
      .catch(() => setBalances([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = activeStore === "all"
    ? balances
    : balances.filter((b) => b.store === activeStore);

  return (
    <>
      <Header
        title="Stock Balance"
        subtitle="O + R – C: Opening + Received – Consumed = Closing balance"
      />
      <main className="flex-1 p-6 space-y-4">
        {/* Store filter tabs */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveStore("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
              activeStore === "all"
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            )}>
            All Stores
          </button>
          {STORES.map((store) => (
            <button key={store}
              onClick={() => setActiveStore(store)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
                activeStore === store
                  ? "bg-gray-800 text-white border-gray-800"
                  : cn("bg-white border-gray-200 hover:border-gray-300", STORE_COLORS[store])
              )}>
              {STORE_LABELS[store]}
            </button>
          ))}
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No stock data available</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Product Code", "Product Name", "Store", "Balance", "UOM", ""].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((b) => (
                  <tr key={`${b.product_id}-${b.store}`} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs">{b.product_code}</td>
                    <td className="table-td font-medium">{b.product_name}</td>
                    <td className="table-td">
                      <span className={cn("badge", STORE_COLORS[b.store])}>
                        {STORE_LABELS[b.store]}
                      </span>
                    </td>
                    <td className={cn(
                      "table-td font-mono font-semibold",
                      b.balance < 0 ? "text-red-600" : b.balance === 0 ? "text-gray-400" : "text-gray-900"
                    )}>
                      {formatNumber(b.balance)}
                    </td>
                    <td className="table-td text-gray-400 text-xs">{b.uom}</td>
                    <td className="table-td">
                      {b.balance < 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-500">
                          <AlertTriangle className="h-3 w-3" /> Negative
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Formula explanation */}
        <div className="rounded-xl border border-dashed border-gray-200 p-4 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 mb-1">Stock Formula</p>
          <p className="text-sm text-gray-700 font-mono">
            Balance = Opening (O) + Received (R) − Consumed (C)
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Every gate pass, requisition, WIP consumption, and dispatch is recorded in the stock ledger.
          </p>
        </div>
      </main>
    </>
  );
}

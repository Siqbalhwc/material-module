"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn } from "@/lib/utils";

type RCStock = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  balance: number;
};

type RCMovement = {
  id: string;
  ref_number: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  direction: string;
  quantity: number;
  uom: string;
  reason: string | null;
  created_at: string;
};

const DIR_STYLE: Record<string, string> = {
  return_from_wip: "bg-orange-100 text-orange-700",
  issue_to_wip: "bg-blue-100 text-blue-700",
};

type SortField = "code" | "name" | "category" | "uom" | "balance";
type SortDir = "asc" | "desc";

export default function RCStorePage() {
  const supabase = createClient();

  // RC Stock
  const [stock, setStock] = useState<RCStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // RC Movements
  const [movements, setMovements] = useState<RCMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);

  const fetchStock = async () => {
    const { data, error } = await supabase
      .from("stock_balance")
      .select(`product_id, balance, products ( code, name, category, uom )`)
      .eq("store", "rc_store");

    if (!error && data) {
      const mapped: RCStock[] = (data || []).map((row: any) => ({
        product_id: row.product_id,
        code: row.products?.code ?? "",
        name: row.products?.name ?? "Unknown",
        category: row.products?.category ?? "",
        uom: row.products?.uom ?? "",
        balance: row.balance ?? 0,
      }));
      setStock(mapped);
    }
    setLoadingStock(false);
  };

  const fetchMovements = async () => {
    const { data, error } = await supabase
      .from("rc_movements")
      .select(`*, products(code, name)`)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: RCMovement[] = data.map((row: any) => ({
        id: row.id,
        ref_number: row.ref_number,
        product_id: row.product_id,
        product_name: row.products?.name,
        product_code: row.products?.code,
        direction: row.direction,
        quantity: row.quantity,
        uom: row.uom,
        reason: row.reason,
        created_at: row.created_at,
      }));
      setMovements(mapped);
    }
    setLoadingMovements(false);
  };

  useEffect(() => {
    fetchStock();
    fetchMovements();
  }, []);

  // Stock filtering & sorting
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

  return (
    <>
      <Header
        title="RC Store"
        subtitle="Stage 4 ↔ WIP: Returnable component movements"
      />
      <main className="flex-1 p-6 space-y-8">
        {/* Current RC Stock */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" /> Current RC Stock
          </h2>

          <div className="relative max-w-sm mb-3">
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
            {loadingStock ? (
              <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
            ) : filteredStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <RotateCcw className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No stock in RC store yet.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {(["code", "name", "category", "uom", "balance"] as SortField[]).map((field) => (
                      <th
                        key={field}
                        className="table-th cursor-pointer select-none hover:bg-gray-100"
                        onClick={() => handleSort(field)}
                      >
                        <span className="inline-flex items-center">
                          {field.charAt(0).toUpperCase() + field.slice(1)}
                          {renderSortIcon(field)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredStock.map((item) => (
                    <tr key={item.product_id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td font-mono text-xs font-medium text-brand-600">{item.code}</td>
                      <td className="table-td font-medium text-gray-900">{item.name}</td>
                      <td className="table-td text-gray-500">{item.category}</td>
                      <td className="table-td text-xs uppercase text-gray-500">{item.uom}</td>
                      <td className="table-td font-medium">{item.balance.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Recent Movements */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <RotateCcw className="h-5 w-5" /> Recent Movements
          </h2>
          <div className="card overflow-hidden">
            {loadingMovements ? (
              <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
            ) : movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <RotateCcw className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No movements yet.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">Ref No.</th>
                    <th className="table-th">Product</th>
                    <th className="table-th">Direction</th>
                    <th className="table-th">Quantity</th>
                    <th className="table-th">Reason</th>
                    <th className="table-th">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td font-mono text-xs text-brand-600">{m.ref_number}</td>
                      <td className="table-td">{m.product_name || m.product_id}</td>
                      <td className="table-td">
                        <span className={cn("badge", DIR_STYLE[m.direction])}>
                          {m.direction === "return_from_wip" ? "← Return from WIP" : "→ Issue to WIP"}
                        </span>
                      </td>
                      <td className="table-td">{m.quantity} {m.uom}</td>
                      <td className="table-td text-gray-400 text-xs">{m.reason || "—"}</td>
                      <td className="table-td">{formatDate(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
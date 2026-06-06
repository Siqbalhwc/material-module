"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Package, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type MaterialStock = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  balance: number;
  reorder_level: number;
};

type SortField = "code" | "name" | "category" | "uom" | "balance" | "reorder_level";
type SortDir = "asc" | "desc";

export default function MaterialStorePage() {
  const [items, setItems] = useState<MaterialStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
          // Only show Raw Material and Chemical (exclude Store / Consumable)
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
      setItems(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStock();
  }, []);

  const filtered = useMemo(() => {
    let list = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q)
      );
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
      if (typeof valA === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
    });

    return list;
  }, [items, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-brand-600 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />
    );
  };

  return (
    <>
      <Header
        title="Material Store (Raw Materials & Chemicals)"
        subtitle="Current stock of production inputs — received via Gate Pass, issued to WIP"
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Package className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery ? "No items match your search" : "No stock recorded yet"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {(["code", "name", "category", "uom", "balance", "reorder_level"] as SortField[]).map((field) => (
                    <th
                      key={field}
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort(field)}
                    >
                      <span className="inline-flex items-center">
                        {field === "reorder_level" ? "Reorder Level" : field.charAt(0).toUpperCase() + field.slice(1)}
                        {renderSortIcon(field)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((item) => {
                  const lowStock = item.balance <= item.reorder_level && item.reorder_level > 0;
                  return (
                    <tr
                      key={item.product_id}
                      className={cn(
                        "hover:bg-gray-50 transition-colors",
                        lowStock && "bg-amber-50"
                      )}
                    >
                      <td className="table-td font-mono text-xs font-medium text-brand-600">{item.code}</td>
                      <td className="table-td font-medium text-gray-900">
                        {item.name}
                        {lowStock && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline ml-2" />
                        )}
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
      </main>
    </>
  );
}
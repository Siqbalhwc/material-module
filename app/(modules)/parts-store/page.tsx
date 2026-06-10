"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Package, Printer, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PartsStockMovement = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  opening: number;
  received: number;
  closing: number;
};

type SortField = "code" | "name" | "category" | "uom" | "opening" | "received" | "closing";
type SortDir = "asc" | "desc";

export default function PartsStorePage() {
  const supabase = createClient();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [movements, setMovements] = useState<PartsStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [visibleColumns, setVisibleColumns] = useState({
    code: true,
    name: true,
    category: true,
    uom: true,
    opening: true,
    received: true,
    closing: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const fetchMovements = async () => {
    setLoading(true);
    const monthStart = selectedMonth + "-01";
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 7) + "-01";

    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom )")
      .eq("store", "parts_store");

    if (prodErr || !allProducts) {
      setMovements([]);
      setLoading(false);
      return;
    }

    const uniqueMap = new Map<string, PartsStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          category: (row.products as any)?.category ?? "",
          uom: (row.products as any)?.uom ?? "",
          opening: 0,
          received: 0,
          closing: 0,
        });
      }
    }
    const items = Array.from(uniqueMap.values());

    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "parts_store")
        .lt("created_at", monthStart);
      const opening = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
      item.opening = opening;
    }

    for (const item of items) {
      const { data: monthData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "parts_store")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      let received = 0;
      for (const r of (monthData || [])) {
        if (r.direction === 1) received += r.quantity;
        else received -= r.quantity;
      }
      item.received = received;
      item.closing = item.opening + received;
    }

    setMovements(items);
    setLoading(false);
  };

  useEffect(() => { fetchMovements(); }, [selectedMonth]);

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
        case "opening": valA = a.opening; valB = b.opening; break;
        case "received": valA = a.received; valB = b.received; break;
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

  const toggleColumn = (key: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <Header
        title="Parts Store (Consumables / Spares)"
        subtitle="Monthly receipt of store/consumable items from Gate Pass"
      />
      <main className="flex-1 p-6 space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Month:</label>
            <input type="month" className="input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-md px-2.5 py-1.5" onClick={() => setShowColumnMenu(!showColumnMenu)}>
                <Settings2 className="h-3.5 w-3.5" /> Columns
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                  <div className="p-2 space-y-1">
                    {Object.entries(visibleColumns).map(([key, value]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input type="checkbox" checked={value} onChange={() => toggleColumn(key as keyof typeof visibleColumns)} className="rounded border-gray-300" />
                        <span className="capitalize text-gray-600">{key === "uom" ? "UOM" : key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1">
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
          </div>
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4">Receipts – {selectedMonth}</h2>
          <div className="relative max-w-sm mb-3 print:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="card overflow-hidden">
            {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400"><Package className="h-10 w-10 mx-auto mb-3 opacity-30" />No items yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {visibleColumns.code && <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>Code {renderSortIcon("code")}</th>}
                    {visibleColumns.name && <th className="table-th cursor-pointer" onClick={() => handleSort("name")}>Name {renderSortIcon("name")}</th>}
                    {visibleColumns.category && <th className="table-th cursor-pointer" onClick={() => handleSort("category")}>Category {renderSortIcon("category")}</th>}
                    {visibleColumns.uom && <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>UOM {renderSortIcon("uom")}</th>}
                    {visibleColumns.opening && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("opening")}>Opening {renderSortIcon("opening")}</th>}
                    {visibleColumns.received && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("received")}>Received {renderSortIcon("received")}</th>}
                    {visibleColumns.closing && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("closing")}>Closing {renderSortIcon("closing")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(item => (
                    <tr key={item.product_id} className="hover:bg-gray-50">
                      {visibleColumns.code && <td className="table-td font-mono text-xs">{item.code}</td>}
                      {visibleColumns.name && <td className="table-td font-medium">{item.name}</td>}
                      {visibleColumns.category && <td className="table-td">{item.category}</td>}
                      {visibleColumns.uom && <td className="table-td uppercase text-xs">{item.uom}</td>}
                      {visibleColumns.opening && <td className="table-td text-right">{item.opening.toFixed(3)}</td>}
                      {visibleColumns.received && <td className="table-td text-right">{item.received.toFixed(3)}</td>}
                      {visibleColumns.closing && <td className="table-td text-right font-medium">{item.closing.toFixed(3)}</td>}
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
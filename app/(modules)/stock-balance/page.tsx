"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Printer, Settings2, X
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type StoreClosing = {
  material_store: number;
  wip: number;
  rc_store: number;
  finished_goods: number;
  parts_store: number;
};

type ProductPosition = {
  product_id: string;
  code: string;
  name: string;
  uom: string;
  opening: number;
  inflows: number;
  dispatched: number;
  stores: StoreClosing;
  totalClosing: number;
};

type SortField =
  "code" | "name" | "uom" | "opening" | "inflows" | "dispatched" | "totalClosing";
type SortDir = "asc" | "desc";

const STORE_LABELS: Record<keyof StoreClosing, string> = {
  material_store: "Material Store",
  wip: "WIP",
  rc_store: "RC Store",
  finished_goods: "Finished Goods",
  parts_store: "Parts Store",
};

export default function StockPositionPage() {
  const supabase = createClient();

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const [positions, setPositions] = useState<ProductPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [visibleColumns, setVisibleColumns] = useState({
    code: true,
    name: true,
    uom: true,
    opening: true,
    inflows: true,
    dispatched: true,
    material_store: true,
    wip: true,
    rc_store: true,
    finished_goods: true,
    parts_store: false,
    totalClosing: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const [drillProduct, setDrillProduct] = useState<ProductPosition | null>(null);
  const [drillStore, setDrillStore] = useState<keyof StoreClosing | null>(null);
  const [drillEntries, setDrillEntries] = useState<any[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // ── Fetch data ──────────────────────────────────────────────
  const fetchPositions = async () => {
    setLoading(true);
    if (!startDate || !endDate || startDate > endDate) {
      setPositions([]);
      setLoading(false);
      return;
    }

    const start = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, uom, conversion_kg )");

    if (prodErr || !allProducts) {
      setPositions([]);
      setLoading(false);
      return;
    }

    const uniqueMap = new Map<string, ProductPosition>();
    const storeKeys: (keyof StoreClosing)[] = [
      "material_store", "wip", "rc_store", "finished_goods", "parts_store",
    ];

    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          uom: (row.products as any)?.uom ?? "",
          opening: 0,
          inflows: 0,
          dispatched: 0,
          stores: {
            material_store: 0,
            wip: 0,
            rc_store: 0,
            finished_goods: 0,
            parts_store: 0,
          },
          totalClosing: 0,
        });
      }
    }

    const items = Array.from(uniqueMap.values());

    // Opening balances
    for (const item of items) {
      let totalOpening = 0;
      for (const store of storeKeys) {
        const { data: before } = await supabase
          .from("stock_ledger")
          .select("quantity, direction")
          .eq("product_id", item.product_id)
          .eq("store", store)
          .lt("created_at", start);
        const opening = (before || []).reduce(
          (sum, r) => sum + r.quantity * r.direction, 0
        );
        (item as any)[`_opening_${store}`] = opening;
        totalOpening += opening;
      }
      item.opening = totalOpening;
    }

    // Movements within range
    for (const item of items) {
      const { data: rangeData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, store, reference_type")
        .eq("product_id", item.product_id)
        .gte("created_at", start)
        .lt("created_at", end);

      let totalInflows = 0;
      let dispatched = 0;
      const storeMovements: Record<string, { in: number; out: number }> = {};
      for (const store of storeKeys) {
        storeMovements[store] = { in: 0, out: 0 };
      }

      for (const r of (rangeData || [])) {
        const store = r.store as string;
        if (storeMovements[store]) {
          if (r.direction === 1) {
            storeMovements[store].in += r.quantity;
            totalInflows += r.quantity;
          } else if (r.direction === -1) {
            storeMovements[store].out += r.quantity;
            if (r.reference_type === "outward_gate_pass") {
              dispatched += r.quantity;
            }
          }
        }
      }

      item.inflows = totalInflows;
      item.dispatched = dispatched;

      for (const store of storeKeys) {
        const opening = (item as any)[`_opening_${store}`] || 0;
        item.stores[store] =
          opening + storeMovements[store].in - storeMovements[store].out;
      }

      item.totalClosing = storeKeys.reduce(
        (sum, store) => sum + item.stores[store], 0
      );
    }

    setPositions(items);
    setLoading(false);
  };

  useEffect(() => {
    fetchPositions();
  }, [startDate, endDate]);

  // ── Filtering & sorting ────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...positions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "code": valA = a.code; valB = b.code; break;
        case "name": valA = a.name; valB = b.name; break;
        case "uom": valA = a.uom; valB = b.uom; break;
        case "opening": valA = a.opening; valB = b.opening; break;
        case "inflows": valA = a.inflows; valB = b.inflows; break;
        case "dispatched": valA = a.dispatched; valB = b.dispatched; break;
        case "totalClosing": valA = a.totalClosing; valB = b.totalClosing; break;
        default: return 0;
      }
      if (typeof valA === "string")
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [positions, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field)
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-brand-600 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />
    );
  };

  const toggleColumn = (key: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Drill‑down ──────────────────────────────────────────────
  const openDrillDown = async (
    product: ProductPosition,
    store: keyof StoreClosing
  ) => {
    setDrillProduct(product);
    setDrillStore(store);
    setDrillLoading(true);

    const start = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data } = await supabase
      .from("stock_ledger")
      .select(
        "quantity, direction, txn_type, reference_type, reference_id, notes, created_at"
      )
      .eq("product_id", product.product_id)
      .eq("store", store)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true });

    setDrillEntries(data || []);
    setDrillLoading(false);
  };

  const closeDrillDown = () => {
    setDrillProduct(null);
    setDrillStore(null);
    setDrillEntries([]);
  };

  const handlePrint = () => window.print();

  return (
    <>
      <Header
        title="Stock Position"
        subtitle="Opening + Inflows – Dispatched = Total Closing"
      />
      <main className="flex-1 p-6 space-y-6 print:space-y-4">
        {/* Controls */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">From:</label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <label className="text-sm font-medium">To:</label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-md px-2.5 py-1.5"
                onClick={() => setShowColumnMenu(!showColumnMenu)}
              >
                <Settings2 className="h-3.5 w-3.5" /> Columns
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                  <div className="p-2 space-y-1">
                    {Object.entries(visibleColumns).map(([key, value]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={() =>
                            toggleColumn(key as keyof typeof visibleColumns)
                          }
                          className="rounded border-gray-300"
                        />
                        <span className="capitalize text-gray-600">
                          {key === "totalClosing"
                            ? "Total Closing"
                            : key.replace(/_/g, " ")}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handlePrint}
              className="btn-secondary flex items-center gap-1"
            >
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
          </div>
        </div>

        {/* Table */}
        <section>
          <div className="relative max-w-sm mb-3 print:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              className="input pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="card overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-gray-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                No data for the selected range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1300px]">
                  <thead className="bg-gray-50">
                    <tr>
                      {visibleColumns.code && (
                        <th
                          className="table-th cursor-pointer"
                          onClick={() => handleSort("code")}
                        >
                          Code {renderSortIcon("code")}
                        </th>
                      )}
                      {visibleColumns.name && (
                        <th
                          className="table-th cursor-pointer"
                          onClick={() => handleSort("name")}
                        >
                          Name {renderSortIcon("name")}
                        </th>
                      )}
                      {visibleColumns.uom && (
                        <th
                          className="table-th cursor-pointer"
                          onClick={() => handleSort("uom")}
                        >
                          UOM {renderSortIcon("uom")}
                        </th>
                      )}
                      {visibleColumns.opening && (
                        <th
                          className="table-th cursor-pointer text-right"
                          onClick={() => handleSort("opening")}
                        >
                          Opening (KG) {renderSortIcon("opening")}
                        </th>
                      )}
                      {visibleColumns.inflows && (
                        <th
                          className="table-th cursor-pointer text-right"
                          onClick={() => handleSort("inflows")}
                        >
                          Inflows (KG) {renderSortIcon("inflows")}
                        </th>
                      )}
                      {visibleColumns.dispatched && (
                        <th
                          className="table-th cursor-pointer text-right"
                          onClick={() => handleSort("dispatched")}
                        >
                          Dispatched (KG) {renderSortIcon("dispatched")}
                        </th>
                      )}
                      {visibleColumns.material_store && (
                        <th className="table-th text-right">
                          Material Store (KG)
                        </th>
                      )}
                      {visibleColumns.wip && (
                        <th className="table-th text-right">WIP (KG)</th>
                      )}
                      {visibleColumns.rc_store && (
                        <th className="table-th text-right">RC Store (KG)</th>
                      )}
                      {visibleColumns.finished_goods && (
                        <th className="table-th text-right">
                          Finished Goods (KG)
                        </th>
                      )}
                      {visibleColumns.parts_store && (
                        <th className="table-th text-right">
                          Parts Store (KG)
                        </th>
                      )}
                      {visibleColumns.totalClosing && (
                        <th
                          className="table-th cursor-pointer text-right"
                          onClick={() => handleSort("totalClosing")}
                        >
                          Total Closing (KG) {renderSortIcon("totalClosing")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(item => (
                      <tr
                        key={item.product_id}
                        className="hover:bg-gray-50"
                      >
                        {visibleColumns.code && (
                          <td className="table-td font-mono text-xs">
                            {item.code}
                          </td>
                        )}
                        {visibleColumns.name && (
                          <td className="table-td font-medium">
                            {item.name}
                          </td>
                        )}
                        {visibleColumns.uom && (
                          <td className="table-td uppercase text-xs">
                            {item.uom}
                          </td>
                        )}
                        {visibleColumns.opening && (
                          <td className="table-td text-right">
                            {item.opening.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.inflows && (
                          <td className="table-td text-right">
                            {item.inflows.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.dispatched && (
                          <td className="table-td text-right">
                            {item.dispatched.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.material_store && (
                          <td
                            className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline"
                            onClick={() =>
                              openDrillDown(item, "material_store")
                            }
                          >
                            {item.stores.material_store.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.wip && (
                          <td
                            className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline"
                            onClick={() => openDrillDown(item, "wip")}
                          >
                            {item.stores.wip.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.rc_store && (
                          <td
                            className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline"
                            onClick={() => openDrillDown(item, "rc_store")}
                          >
                            {item.stores.rc_store.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.finished_goods && (
                          <td
                            className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline"
                            onClick={() =>
                              openDrillDown(item, "finished_goods")
                            }
                          >
                            {item.stores.finished_goods.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.parts_store && (
                          <td
                            className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline"
                            onClick={() =>
                              openDrillDown(item, "parts_store")
                            }
                          >
                            {item.stores.parts_store.toFixed(3)}
                          </td>
                        )}
                        {visibleColumns.totalClosing && (
                          <td className="table-td text-right font-medium">
                            {item.totalClosing.toFixed(3)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Drill‑down Modal */}
        {drillProduct && drillStore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {drillProduct.name} – {STORE_LABELS[drillStore]}
                </h2>
                <button
                  onClick={closeDrillDown}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Movements from {startDate} to {endDate}
              </p>

              {drillLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : drillEntries.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No movements in the selected period.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-right">Quantity</th>
                      <th className="px-2 py-1 text-left">Direction</th>
                      <th className="px-2 py-1 text-left">Reference</th>
                      <th className="px-2 py-1 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {drillEntries.map((entry, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1">
                          {formatDate(entry.created_at)}
                        </td>
                        <td className="px-2 py-1">{entry.txn_type}</td>
                        <td className="px-2 py-1 text-right">
                          {entry.quantity.toFixed(3)}
                        </td>
                        <td className="px-2 py-1">
                          {entry.direction === 1 ? "In" : "Out"}
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {entry.reference_type} (
                          {entry.reference_id?.slice(0, 8)})
                        </td>
                        <td className="px-2 py-1 text-xs text-gray-500">
                          {entry.notes}
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
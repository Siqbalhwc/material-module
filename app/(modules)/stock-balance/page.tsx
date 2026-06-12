"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Printer, Settings2, X,
  ChevronDown, ChevronRight
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
  category: string;
  opening: number;
  inflows: number;
  material_consumed: number;
  stores: StoreClosing;
  totalClosing: number;
  parent_product_id?: string | null;
  children?: ProductPosition[];
  isChild?: boolean;
};

type SortField = "code" | "name" | "uom" | "opening" | "inflows" | "material_consumed" | "totalClosing";
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
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const [positions, setPositions] = useState<ProductPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const [visibleColumns, setVisibleColumns] = useState({
    code: true, name: true, uom: true,
    opening: true, inflows: true, material_consumed: true,
    material_store: true, wip: true, rc_store: true,
    finished_goods: true, parts_store: false, reconciled: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const [drillProduct, setDrillProduct] = useState<ProductPosition | null>(null);
  const [drillStore, setDrillStore] = useState<keyof StoreClosing | null>(null);
  const [drillEntries, setDrillEntries] = useState<any[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const fetchPositions = async () => {
    setLoading(true);
    if (!startDate || !endDate || startDate > endDate) { setPositions([]); setLoading(false); return; }

    const start = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    // Fetch production runs for net consumed
    const { data: prodRuns } = await supabase
      .from("production_runs")
      .select("raw_material_product_id, kg_consumed, kg_waste")
      .gte("created_at", start).lt("created_at", end)
      .in("status", ["executed", "verified"]);

    const netConsumedMap = new Map<string, number>();
    if (prodRuns) {
      for (const row of prodRuns) {
        const prev = netConsumedMap.get(row.raw_material_product_id) || 0;
        netConsumedMap.set(row.raw_material_product_id, prev + Number(row.kg_consumed) - Number(row.kg_waste));
      }
    }

    const { data: allProducts } = await supabase
      .from("stock_ledger")
      .select("product_id, products(code, name, category, uom, conversion_kg, parent_product_id)");

    if (!allProducts) { setPositions([]); setLoading(false); return; }

    const uniqueMap = new Map<string, ProductPosition>();
    const storeKeys: (keyof StoreClosing)[] = ["material_store", "wip", "rc_store", "finished_goods", "parts_store"];

    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        const cat = (row.products as any)?.category ?? "";
        if (cat !== "Raw Material" && cat !== "Chemical") continue;
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "", name: (row.products as any)?.name ?? "Unknown",
          uom: (row.products as any)?.uom ?? "", category: cat,
          parent_product_id: (row.products as any)?.parent_product_id ?? null,
          opening: 0, inflows: 0, material_consumed: 0,
          stores: { material_store: 0, wip: 0, rc_store: 0, finished_goods: 0, parts_store: 0 },
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
          .from("stock_ledger").select("quantity, direction")
          .eq("product_id", item.product_id).eq("store", store).lt("created_at", start);
        const opening = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
        (item as any)[`_opening_${store}`] = opening;
        totalOpening += opening;
      }
      item.opening = totalOpening;
    }

    // Movements within range
    for (const item of items) {
      const { data: rangeData } = await supabase
        .from("stock_ledger").select("quantity, direction, store, reference_type")
        .eq("product_id", item.product_id).gte("created_at", start).lt("created_at", end);

      let externalInflows = 0;
      const storeMovements: Record<string, { in: number; out: number }> = {};
      for (const store of storeKeys) storeMovements[store] = { in: 0, out: 0 };

      for (const r of (rangeData || [])) {
        const store = r.store as string;
        if (storeMovements[store]) {
          if (r.direction === 1) {
            storeMovements[store].in += r.quantity;
            if (r.reference_type === "gate_pass") externalInflows += r.quantity;
          } else if (r.direction === -1) {
            storeMovements[store].out += r.quantity;
          }
        }
      }
      item.inflows = externalInflows;
      for (const store of storeKeys) {
        const opening = (item as any)[`_opening_${store}`] || 0;
        item.stores[store] = opening + storeMovements[store].in - storeMovements[store].out;
      }
    }

    // Material consumed
    for (const item of items) item.material_consumed = netConsumedMap.get(item.product_id) || 0;

    // Build hierarchy
    const parentMap = new Map<string, ProductPosition>();
    const children: ProductPosition[] = [];
    for (const item of items) {
      if (!item.parent_product_id) parentMap.set(item.product_id, { ...item, children: [] });
      else children.push({ ...item, isChild: true });
    }
    const missingParentIds = Array.from(new Set(children.map(c => c.parent_product_id!).filter(pid => pid && !parentMap.has(pid))));
    if (missingParentIds.length > 0) {
      const { data: missingParents } = await supabase.from("products").select("id, code, name, category, uom").in("id", missingParentIds);
      for (const p of (missingParents || [])) {
        parentMap.set(p.id, { product_id: p.id, code: p.code ?? "", name: p.name ?? "Unknown", uom: p.uom ?? "", category: p.category ?? "", opening: 0, inflows: 0, material_consumed: 0, stores: { material_store: 0, wip: 0, rc_store: 0, finished_goods: 0, parts_store: 0 }, totalClosing: 0, parent_product_id: null, children: [] });
      }
    }
    for (const child of children) {
      const parent = parentMap.get(child.parent_product_id!);
      if (parent) {
        parent.children!.push(child);
        parent.opening += child.opening; parent.inflows += child.inflows;
        parent.material_consumed += child.material_consumed;
        for (const store of storeKeys) parent.stores[store] += child.stores[store];
      } else {
        parentMap.set(child.product_id, { ...child, isChild: false, parent_product_id: null, children: [] });
      }
    }

    // Compute totalClosing for parents
    for (const parent of Array.from(parentMap.values())) {
      parent.totalClosing = storeKeys.reduce((sum, store) => sum + parent.stores[store], 0);
    }

    const displayList: ProductPosition[] = [];
    for (const [, parent] of Array.from(parentMap.entries())) {
      displayList.push(parent);
      if (parent.children && parent.children.length > 0) displayList.push(...parent.children);
    }
    setPositions(displayList);
    setLoading(false);
  };

  useEffect(() => { fetchPositions(); }, [startDate, endDate]);

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const filtered = useMemo(() => {
    let list = [...positions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchingIds = new Set(list.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)).map(i => i.product_id));
      list.forEach(i => { if (i.isChild && i.parent_product_id && matchingIds.has(i.product_id)) matchingIds.add(i.parent_product_id); });
      list = list.filter(i => matchingIds.has(i.product_id));
    }
    const parents = list.filter(i => !i.isChild);
    parents.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case "code": va = a.code; vb = b.code; break;
        case "name": va = a.name; vb = b.name; break;
        case "uom": va = a.uom; vb = b.uom; break;
        case "opening": va = a.opening; vb = b.opening; break;
        case "inflows": va = a.inflows; vb = b.inflows; break;
        case "material_consumed": va = a.material_consumed; vb = b.material_consumed; break;
        case "totalClosing": va = a.totalClosing; vb = b.totalClosing; break;
        default: return 0;
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      else return sortDir === "asc" ? va - vb : vb - va;
    });
    const childMap = new Map<string, ProductPosition[]>();
    list.filter(i => i.isChild).forEach(c => { const pid = c.parent_product_id!; if (!childMap.has(pid)) childMap.set(pid, []); childMap.get(pid)!.push(c); });
    const result: ProductPosition[] = [];
    for (const parent of parents) { result.push(parent); result.push(...(childMap.get(parent.product_id) || [])); }
    return result;
  }, [positions, searchQuery, sortField, sortDir]);

  const handleSort = (f: SortField) => { if (sortField === f) setSortDir(p => p === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };
  const sortIcon = (f: SortField) => sortField !== f ? <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" /> : sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  const toggleCol = (k: keyof typeof visibleColumns) => setVisibleColumns(p => ({ ...p, [k]: !p[k] }));

  const openDrillDown = async (product: ProductPosition, store: keyof StoreClosing) => {
    setDrillProduct(product); setDrillStore(store); setDrillLoading(true);
    const start = startDate;
    const endInclusive = new Date(endDate); endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);
    const { data } = await supabase.from("stock_ledger").select("quantity, direction, txn_type, reference_type, reference_id, notes, created_at")
      .eq("product_id", product.product_id).eq("store", store).gte("created_at", start).lt("created_at", end).order("created_at", { ascending: true });
    setDrillEntries(data || []); setDrillLoading(false);
  };

  const closeDrillDown = () => { setDrillProduct(null); setDrillStore(null); setDrillEntries([]); };

  return (
    <>
      <Header title="Stock Position" subtitle="Opening + Inflows – Material Consumed = Store Closings" />
      <main className="flex-1 p-6 space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3"><label>From:</label><input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} /><label>To:</label><input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowColumnMenu(!showColumnMenu)} className="btn-secondary text-xs"><Settings2 className="h-3.5 w-3.5" /> Columns</button>
            <button onClick={() => window.print()} className="btn-secondary text-xs"><Printer className="h-3.5 w-3.5" /> Print</button>
          </div>
        </div>

        <section>
          <div className="relative max-w-sm mb-3"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
          <div className="card overflow-hidden">
            {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? <div className="py-16 text-center text-gray-400">No data.</div> :
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1300px]">
                  <thead className="bg-gray-50"><tr>
                    <th className="w-8"></th>
                    {visibleColumns.code && <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>Code {sortIcon("code")}</th>}
                    {visibleColumns.name && <th className="table-th cursor-pointer" onClick={() => handleSort("name")}>Name {sortIcon("name")}</th>}
                    {visibleColumns.uom && <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>UOM {sortIcon("uom")}</th>}
                    {visibleColumns.opening && <th className="table-th text-right">Opening (KG)</th>}
                    {visibleColumns.inflows && <th className="table-th text-right">Inflows (KG)</th>}
                    {visibleColumns.material_consumed && <th className="table-th text-right">Mat. Consumed (net KG)</th>}
                    {visibleColumns.material_store && <th className="table-th text-right">Material Store (KG)</th>}
                    {visibleColumns.wip && <th className="table-th text-right">WIP (KG)</th>}
                    {visibleColumns.rc_store && <th className="table-th text-right">RC Store (KG)</th>}
                    {visibleColumns.finished_goods && <th className="table-th text-right">Finished Goods (KG)</th>}
                    {visibleColumns.parts_store && <th className="table-th text-right">Parts Store (KG)</th>}
                    {visibleColumns.reconciled && <th className="table-th text-center">Reconciled?</th>}
                  </tr></thead>
                  <tbody className="divide-y">
                    {filtered.map(item => {
                      const isParent = !item.isChild && item.children && item.children.length > 0;
                      const isChild = !!item.isChild;
                      const isExpanded = expandedParents.has(item.product_id);
                      if (isChild && item.parent_product_id && !expandedParents.has(item.parent_product_id)) return null;
                      const sumStores = item.stores.material_store + item.stores.wip + item.stores.rc_store + item.stores.finished_goods + item.stores.parts_store;
                      const diff = Math.abs(item.opening + item.inflows - item.material_consumed - sumStores);
                      const reconciled = diff < 0.001;

                      return (
                        <tr key={item.product_id} className={cn("hover:bg-gray-50", isChild && "bg-gray-50/50")}>
                          <td className="table-td w-8">{isParent && <button onClick={() => toggleExpand(item.product_id)}>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}</td>
                          {visibleColumns.code && <td className={cn("table-td font-mono text-xs", isChild && "pl-6")}>{item.code}</td>}
                          {visibleColumns.name && <td className={cn("table-td font-medium", isChild && "pl-6")}>{isChild && "└ "}{item.name}{isParent && <span className="ml-1 text-[10px] text-gray-400">({item.children!.length} variants)</span>}</td>}
                          {visibleColumns.uom && <td className="table-td uppercase text-xs">{item.uom}</td>}
                          {visibleColumns.opening && <td className="table-td text-right">{item.opening.toFixed(3)}</td>}
                          {visibleColumns.inflows && <td className="table-td text-right">{item.inflows.toFixed(3)}</td>}
                          {visibleColumns.material_consumed && <td className="table-td text-right">{item.material_consumed.toFixed(3)}</td>}
                          {visibleColumns.material_store && <td className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline" onClick={() => openDrillDown(item, "material_store")}>{item.stores.material_store.toFixed(3)}</td>}
                          {visibleColumns.wip && <td className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline" onClick={() => openDrillDown(item, "wip")}>{item.stores.wip.toFixed(3)}</td>}
                          {visibleColumns.rc_store && <td className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline" onClick={() => openDrillDown(item, "rc_store")}>{item.stores.rc_store.toFixed(3)}</td>}
                          {visibleColumns.finished_goods && <td className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline" onClick={() => openDrillDown(item, "finished_goods")}>{item.stores.finished_goods.toFixed(3)}</td>}
                          {visibleColumns.parts_store && <td className="table-td text-right cursor-pointer hover:text-brand-600 hover:underline" onClick={() => openDrillDown(item, "parts_store")}>{item.stores.parts_store.toFixed(3)}</td>}
                          {visibleColumns.reconciled && <td className="table-td text-center">{reconciled ? <span className="text-green-600">✅ Yes</span> : <span className="text-red-600">⚠ {diff.toFixed(3)} kg</span>}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
          </div>
        </section>

        {/* Drill‑down Modal */}
        {drillProduct && drillStore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6 space-y-4">
              <div className="flex justify-between"><h2 className="text-lg font-semibold">{drillProduct.name} – {STORE_LABELS[drillStore]}</h2><button onClick={closeDrillDown}><X className="h-5 w-5" /></button></div>
              <p className="text-sm text-gray-500">Movements from {startDate} to {endDate}</p>
              {drillLoading ? <p>Loading...</p> : drillEntries.length === 0 ? <p>No movements.</p> :
                <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-2 py-1">Date</th><th>Type</th><th className="text-right">Qty</th><th>Dir</th><th>Ref</th><th>Notes</th></tr></thead><tbody>{drillEntries.map((e, i) => <tr key={i}><td className="px-2 py-1">{formatDate(e.created_at)}</td><td>{e.txn_type}</td><td className="text-right">{e.quantity.toFixed(3)}</td><td>{e.direction === 1 ? "In" : "Out"}</td><td className="text-xs">{e.reference_type}</td><td className="text-xs text-gray-500">{e.notes}</td></tr>)}</tbody></table>}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
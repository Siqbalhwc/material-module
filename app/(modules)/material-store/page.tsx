"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Package,
  AlertTriangle, Send, Bell, X, Printer, Settings2
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";

// ── Types ─────────────────────────────────────────────────────
type MaterialStockMovement = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  conversion_kg?: number;
  reorder_level: number;
  opening_kg: number;
  received_supplier_kg: number;
  received_rc_kg: number;
  issued_wip_kg: number;
  closing_kg: number;
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

type SortField =
  | "code" | "name" | "category" | "uom" | "reorder_level"
  | "opening_kg" | "received_supplier_kg" | "received_rc_kg"
  | "issued_wip_kg" | "closing_kg";
type SortDir = "asc" | "desc";

export default function MaterialStorePage() {
  const supabase = createClient();

  // Date range – default to current month
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(lastDayOfMonth);

  const [movements, setMovements] = useState<MaterialStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Column visibility – bags columns hidden by default
  const [visibleColumns, setVisibleColumns] = useState({
    code: true,
    name: true,
    category: true,
    uom: true,
    reorder_level: false,
    opening_kg: true,
    received_supplier_kg: true,
    received_rc_kg: true,
    issued_wip_kg: true,
    closing_kg: true,
    opening_bags: false,
    closing_bags: false,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Incoming transfers (from RC)
  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  // Issue to WIP modal
  const [issueItem, setIssueItem] = useState<MaterialStockMovement | null>(null);
  const [issueQtyKg, setIssueQtyKg] = useState("");
  const [issueQtyBags, setIssueQtyBags] = useState("");
  const [issuing, setIssuing] = useState(false);

  // ── Fetch movements for date range ──────────────────────────
  const fetchMovements = async () => {
    setLoading(true);

    // Ensure start <= end
    const start = startDate;
    const end = endDate;
    if (!start || !end || start > end) {
      setMovements([]);
      setLoading(false);
      return;
    }

    // Use start date as the boundary, and include the whole end day by using endDate + 1 day
    const endDateInclusive = new Date(end);
    endDateInclusive.setDate(endDateInclusive.getDate() + 1);
    const endDateStr = endDateInclusive.toISOString().slice(0, 10);

    // 1. Get all products that ever appeared in material_store
    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom, reorder_level, conversion_kg )")
      .eq("store", "material_store");

    if (prodErr || !allProducts) {
      setMovements([]);
      setLoading(false);
      return;
    }

    const uniqueMap = new Map<string, MaterialStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          category: (row.products as any)?.category ?? "",
          uom: (row.products as any)?.uom ?? "",
          conversion_kg: (row.products as any)?.conversion_kg ?? undefined,
          reorder_level: (row.products as any)?.reorder_level ?? 0,
          opening_kg: 0,
          received_supplier_kg: 0,
          received_rc_kg: 0,
          issued_wip_kg: 0,
          closing_kg: 0,
        });
      }
    }
    const items = Array.from(uniqueMap.values());

    // 2. Opening balance = sum of all movements before start date
    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "material_store")
        .lt("created_at", start);
      const opening = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
      item.opening_kg = opening;
    }

    // 3. Movements within the range [start, end)
    for (const item of items) {
      const { data: rangeData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id)
        .eq("store", "material_store")
        .gte("created_at", start)
        .lt("created_at", endDateStr);

      let supplier = 0, rc = 0, wip = 0;
      for (const r of (rangeData || [])) {
        if (r.direction === 1) {
          if (r.reference_type === "gate_pass") supplier += r.quantity;
          else if (r.reference_type === "store_transfer") rc += r.quantity;
          else supplier += r.quantity;
        } else if (r.direction === -1) {
          if (r.reference_type === "store_transfer") wip += r.quantity;
          else wip += r.quantity;
        }
      }
      item.received_supplier_kg = supplier;
      item.received_rc_kg = rc;
      item.issued_wip_kg = wip;
      item.closing_kg = item.opening_kg + supplier + rc - wip;
    }

    // Filter to Raw Material and Chemical categories only
    const filteredItems = items.filter(
      i => i.category === "Raw Material" || i.category === "Chemical"
    );

    setMovements(filteredItems);
    setLoading(false);
  };

  // ── Fetch incoming transfers ────────────────────────────────
  const fetchIncoming = async () => {
    const { data } = await supabase
      .from("store_transfers")
      .select(`*, products(code, name)`)
      .eq("to_store", "material_store")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
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
    fetchMovements();
    fetchIncoming();
  }, [startDate, endDate]);   // re‑fetch whenever dates change

  // ── Filtering & sorting ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...movements];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "code": valA = a.code; valB = b.code; break;
        case "name": valA = a.name; valB = b.name; break;
        case "category": valA = a.category; valB = b.category; break;
        case "uom": valA = a.uom; valB = b.uom; break;
        case "reorder_level": valA = a.reorder_level; valB = b.reorder_level; break;
        case "opening_kg": valA = a.opening_kg; valB = b.opening_kg; break;
        case "received_supplier_kg": valA = a.received_supplier_kg; valB = b.received_supplier_kg; break;
        case "received_rc_kg": valA = a.received_rc_kg; valB = b.received_rc_kg; break;
        case "issued_wip_kg": valA = a.issued_wip_kg; valB = b.issued_wip_kg; break;
        case "closing_kg": valA = a.closing_kg; valB = b.closing_kg; break;
        default: return 0;
      }
      if (typeof valA === "string")
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [movements, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field)
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
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

  // ── Accept / Reject incoming transfer ───────────────────────
  const handleIncomingAction = async (id: string, action: "accepted" | "rejected") => {
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
            store: "material_store" as StoreType,
            txn_type: "received",
            quantity: transfer.quantity,
            direction: 1,
            reference_type: "store_transfer",
            reference_id: id,
          },
        ]);
        if (error) throw error;
      }
      await supabase.from("store_transfers").update({
        status: action,
        [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString(),
      }).eq("id", id);
      fetchIncoming();
      fetchMovements();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ── Issue to WIP ────────────────────────────────────────────
  const handleIssueToWIP = async () => {
    if (!issueItem) return;
    const qtyKg = parseFloat(issueQtyKg);
    if (isNaN(qtyKg) || qtyKg <= 0 || qtyKg > issueItem.closing_kg) {
      alert(`Invalid quantity (max ${issueItem.closing_kg.toFixed(3)} kg)`);
      return;
    }
    setIssuing(true);
    try {
      await supabase.from("store_transfers").insert({
        from_store: "material_store",
        to_store: "wip",
        product_id: issueItem.product_id,
        quantity: qtyKg,
        uom: issueItem.uom,
        status: "pending",
        notes: `Issue to WIP – ${issueItem.name}`,
      });
      alert("Transfer sent to WIP.");
      fetchMovements();
      setIssueItem(null);
      setIssueQtyKg("");
      setIssueQtyBags("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIssuing(false);
    }
  };

  const updateIssueBags = (bagsStr: string) => {
    setIssueQtyBags(bagsStr);
    const bags = parseFloat(bagsStr);
    if (issueItem && issueItem.conversion_kg && !isNaN(bags)) {
      setIssueQtyKg((bags * issueItem.conversion_kg).toFixed(3));
    } else {
      setIssueQtyKg("");
    }
  };

  const updateIssueKg = (kgStr: string) => {
    setIssueQtyKg(kgStr);
    const kg = parseFloat(kgStr);
    if (issueItem && issueItem.conversion_kg && !isNaN(kg)) {
      setIssueQtyBags((kg / issueItem.conversion_kg).toFixed(3));
    } else {
      setIssueQtyBags("");
    }
  };

  const handlePrint = () => window.print();

  return (
    <>
      <Header
        title="Material Store (Raw Materials & Chemicals)"
        subtitle="Custom date‑range report – all quantities in KG"
        actions={
          <button
            className="relative btn-secondary flex items-center gap-2"
            onClick={() => setShowIncoming(true)}
          >
            <Bell className="h-4 w-4" />
            {incoming.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {incoming.length}
              </span>
            )}
            Incoming
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-6 print:space-y-4">
        {/* Date range, columns, print */}
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
            {/* Column visibility */}
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
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={() => toggleColumn(key as keyof typeof visibleColumns)}
                          className="rounded border-gray-300"
                        />
                        <span className="capitalize text-gray-600">
                          {key === "reorder_level"
                            ? "Reorder Level"
                            : key.replace(/_kg$/, " (KG)").replace(/_bags$/, " (Bags)").replace(/_/g, " ")}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-1">
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
          </div>
        </div>

        {/* Movement Table */}
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Stock Movement – {startDate} to {endDate}
          </h2>
          <div className="relative max-w-sm mb-3 print:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="input pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="card overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-gray-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No data for the selected range.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {visibleColumns.code && (
                      <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>
                        Code {renderSortIcon("code")}
                      </th>
                    )}
                    {visibleColumns.name && (
                      <th className="table-th cursor-pointer" onClick={() => handleSort("name")}>
                        Name {renderSortIcon("name")}
                      </th>
                    )}
                    {visibleColumns.category && (
                      <th className="table-th cursor-pointer" onClick={() => handleSort("category")}>
                        Category {renderSortIcon("category")}
                      </th>
                    )}
                    {visibleColumns.uom && (
                      <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>
                        UOM {renderSortIcon("uom")}
                      </th>
                    )}
                    {visibleColumns.reorder_level && (
                      <th className="table-th cursor-pointer text-right" onClick={() => handleSort("reorder_level")}>
                        Reorder {renderSortIcon("reorder_level")}
                      </th>
                    )}
                    {visibleColumns.opening_kg && (
                      <th className="table-th cursor-pointer text-right" onClick={() => handleSort("opening_kg")}>
                        Opening (KG) {renderSortIcon("opening_kg")}
                      </th>
                    )}
                    {visibleColumns.opening_bags && (
                      <th className="table-th cursor-pointer text-right">Opening (Bags)</th>
                    )}
                    {visibleColumns.received_supplier_kg && (
                      <th className="table-th cursor-pointer text-right" onClick={() => handleSort("received_supplier_kg")}>
                        Recv Supplier (KG) {renderSortIcon("received_supplier_kg")}
                      </th>
                    )}
                    {visibleColumns.received_rc_kg && (
                      <th className="table-th cursor-pointer text-right" onClick={() => handleSort("received_rc_kg")}>
                        Recv RC (KG) {renderSortIcon("received_rc_kg")}
                      </th>
                    )}
                    {visibleColumns.issued_wip_kg && (
                      <th className="table-th cursor-pointer text-right" onClick={() => handleSort("issued_wip_kg")}>
                        Issued WIP (KG) {renderSortIcon("issued_wip_kg")}
                      </th>
                    )}
                    {visibleColumns.closing_kg && (
                      <th className="table-th cursor-pointer text-right" onClick={() => handleSort("closing_kg")}>
                        Closing (KG) {renderSortIcon("closing_kg")}
                      </th>
                    )}
                    {visibleColumns.closing_bags && (
                      <th className="table-th cursor-pointer text-right">Closing (Bags)</th>
                    )}
                    <th className="table-th print:hidden"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(item => {
                    const lowStock =
                      item.closing_kg <= item.reorder_level && item.reorder_level > 0;
                    const hasBags = item.uom === "bags" && item.conversion_kg != null;
                    const toBags = (kg: number) => (kg / item.conversion_kg!).toFixed(3);

                    return (
                      <tr
                        key={item.product_id}
                        className={cn("hover:bg-gray-50", lowStock && "bg-amber-50")}
                      >
                        {visibleColumns.code && (
                          <td className="table-td font-mono text-xs">{item.code}</td>
                        )}
                        {visibleColumns.name && (
                          <td className="table-td font-medium">
                            {item.name}
                            {lowStock && (
                              <AlertTriangle className="h-3 w-3 text-amber-500 inline ml-1" />
                            )}
                          </td>
                        )}
                        {visibleColumns.category && (
                          <td className="table-td">{item.category}</td>
                        )}
                        {visibleColumns.uom && (
                          <td className="table-td uppercase text-xs">{item.uom}</td>
                        )}
                        {visibleColumns.reorder_level && (
                          <td className="table-td text-right">{item.reorder_level}</td>
                        )}
                        {visibleColumns.opening_kg && (
                          <td className="table-td text-right">{item.opening_kg.toFixed(3)}</td>
                        )}
                        {visibleColumns.opening_bags && (
                          <td className="table-td text-right">
                            {hasBags ? toBags(item.opening_kg) : "—"}
                          </td>
                        )}
                        {visibleColumns.received_supplier_kg && (
                          <td className="table-td text-right">{item.received_supplier_kg.toFixed(3)}</td>
                        )}
                        {visibleColumns.received_rc_kg && (
                          <td className="table-td text-right">{item.received_rc_kg.toFixed(3)}</td>
                        )}
                        {visibleColumns.issued_wip_kg && (
                          <td className="table-td text-right">{item.issued_wip_kg.toFixed(3)}</td>
                        )}
                        {visibleColumns.closing_kg && (
                          <td className="table-td text-right font-medium">{item.closing_kg.toFixed(3)}</td>
                        )}
                        {visibleColumns.closing_bags && (
                          <td className="table-td text-right font-medium">
                            {hasBags ? toBags(item.closing_kg) : "—"}
                          </td>
                        )}
                        <td className="table-td print:hidden">
                          <button
                            className="text-xs text-brand-600"
                            onClick={() => {
                              setIssueItem(item);
                              setIssueQtyKg("");
                              setIssueQtyBags("");
                            }}
                          >
                            <Send className="h-3 w-3 inline" /> Issue to WIP
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Incoming Transfers Modal */}
        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
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
                      <th className="px-2 py-1 text-right">Qty (KG)</th>
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
                            onClick={() => handleIncomingAction(t.id, "accepted")}
                            className="text-green-600 text-xs"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleIncomingAction(t.id, "rejected")}
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

        {/* Issue to WIP Modal */}
        {issueItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-white rounded-xl p-6 w-96 space-y-4">
              <h2 className="text-lg font-semibold">
                Issue to WIP: {issueItem.name}
              </h2>
              <p className="text-sm text-gray-500">
                Available (closing): {issueItem.closing_kg.toFixed(3)} kg
              </p>

              <div>
                <label className="label">Quantity (KG)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max={issueItem.closing_kg}
                  className="input"
                  value={issueQtyKg}
                  onChange={e => updateIssueKg(e.target.value)}
                />
              </div>

              {issueItem.uom === "bags" && issueItem.conversion_kg != null && (
                <div>
                  <label className="label">Bags (1 bag = {issueItem.conversion_kg} kg)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="input"
                    value={issueQtyBags}
                    onChange={e => updateIssueBags(e.target.value)}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setIssueItem(null);
                    setIssueQtyKg("");
                    setIssueQtyBags("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={issuing || !issueQtyKg}
                  onClick={handleIssueToWIP}
                >
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
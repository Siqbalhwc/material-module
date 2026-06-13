"use client";
import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Package,
  AlertTriangle, Send, Bell, X, Printer, Settings2,
  ChevronDown, ChevronRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";

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
  parent_product_id?: string | null;
  children?: MaterialStockMovement[];
  isChild?: boolean;
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

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

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

  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  const [issueItem, setIssueItem] = useState<MaterialStockMovement | null>(null);
  const [issueQtyKg, setIssueQtyKg] = useState("");
  const [issueQtyBags, setIssueQtyBags] = useState("");
  const [issuing, setIssuing] = useState(false);

  const fetchMovements = async () => {
    setLoading(true);
    const monthStart = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom, reorder_level, conversion_kg, parent_product_id )")
      .eq("store", "material_store");

    if (prodErr || !allProducts) {
      setMovements([]);
      setLoading(false);
      return;
    }

    const uniqueMap = new Map<string, MaterialStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        const prod = (row.products as any);
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: prod?.code ?? "",
          name: prod?.name ?? "Unknown",
          category: prod?.category ?? "",
          uom: prod?.uom ?? "",
          conversion_kg: prod?.conversion_kg ?? undefined,
          reorder_level: prod?.reorder_level ?? 0,
          opening_kg: 0,
          received_supplier_kg: 0,
          received_rc_kg: 0,
          issued_wip_kg: 0,
          closing_kg: 0,
          parent_product_id: prod?.parent_product_id ?? null,
        });
      }
    }
    const items = Array.from(uniqueMap.values());

    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "material_store")
        .lt("created_at", monthStart);
      const opening = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
      item.opening_kg = opening;
    }

    for (const item of items) {
      const { data: monthData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id)
        .eq("store", "material_store")
        .gte("created_at", monthStart)
        .lt("created_at", end);

      let supplier = 0, rc = 0, wip = 0;
      for (const r of (monthData || [])) {
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

    const filteredItems = items.filter(
      i => i.category === "Raw Material" || i.category === "Chemical"
    );

    // Build hierarchy
    const parentMap = new Map<string, MaterialStockMovement>();
    const childItems: MaterialStockMovement[] = [];
    for (const item of filteredItems) {
      if (!item.parent_product_id) {
        parentMap.set(item.product_id, { ...item, children: [] });
      } else {
        childItems.push({ ...item, isChild: true });
      }
    }

    const missingParentIds = Array.from(
      new Set(childItems.map(c => c.parent_product_id!).filter(pid => pid && !parentMap.has(pid)))
    );

    if (missingParentIds.length > 0) {
      const { data: missingParents } = await supabase
        .from("products")
        .select("id, code, name, category, uom, conversion_kg, reorder_level")
        .in("id", missingParentIds);
      for (const p of (missingParents || [])) {
        parentMap.set(p.id, {
          product_id: p.id, code: p.code ?? "", name: p.name ?? "Unknown",
          category: p.category ?? "", uom: p.uom ?? "",
          conversion_kg: p.conversion_kg ?? undefined,
          reorder_level: p.reorder_level ?? 0,
          opening_kg: 0, received_supplier_kg: 0, received_rc_kg: 0,
          issued_wip_kg: 0, closing_kg: 0,
          parent_product_id: null, children: [],
        });
      }
    }

    for (const child of childItems) {
      const parent = parentMap.get(child.parent_product_id!);
      if (parent) {
        parent.children!.push(child);
        parent.opening_kg += child.opening_kg;
        parent.received_supplier_kg += child.received_supplier_kg;
        parent.received_rc_kg += child.received_rc_kg;
        parent.issued_wip_kg += child.issued_wip_kg;
        parent.closing_kg += child.closing_kg;
      } else {
        parentMap.set(child.product_id, { ...child, isChild: false, parent_product_id: null, children: [] });
      }
    }

    const displayList: MaterialStockMovement[] = [];
    for (const parent of Array.from(parentMap.values())) {
      displayList.push(parent);
      if (parent.children && parent.children.length > 0) {
        displayList.push(...parent.children);
      }
    }

    setMovements(displayList);
    setLoading(false);
  };

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
  }, [startDate, endDate]);

  const toggleExpand = (productId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let list = [...movements];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchingIds = new Set(
        list.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)).map(i => i.product_id)
      );
      list.forEach(i => { if (i.isChild && i.parent_product_id && matchingIds.has(i.product_id)) matchingIds.add(i.parent_product_id); });
      list = list.filter(i => matchingIds.has(i.product_id));
    }
    const parents = list.filter(i => !i.isChild);
    parents.sort((a, b) => {
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
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    const childMap = new Map<string, MaterialStockMovement[]>();
    list.filter(i => i.isChild).forEach(c => {
      const pid = c.parent_product_id!;
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(c);
    });
    const result: MaterialStockMovement[] = [];
    for (const parent of parents) {
      result.push(parent);
      result.push(...(childMap.get(parent.product_id) || []));
    }
    return result;
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

  const handleIncomingAction = async (id: string, action: "accepted" | "rejected") => {
    const transfer = incoming.find(t => t.id === id);
    if (!transfer) return;
    try {
      if (action === "accepted") {
        const { error } = await supabase.from("stock_ledger").insert([
          { product_id: transfer.product_id, store: transfer.from_store as StoreType, txn_type: "issued", quantity: transfer.quantity, direction: -1, reference_type: "store_transfer", reference_id: id },
          { product_id: transfer.product_id, store: "material_store" as StoreType, txn_type: "received", quantity: transfer.quantity, direction: 1, reference_type: "store_transfer", reference_id: id },
        ]);
        if (error) throw error;
      }
      await supabase.from("store_transfers").update({
        status: action,
        [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString(),
      }).eq("id", id);
      fetchIncoming();
      fetchMovements();
    } catch (e: any) { alert(e.message); }
  };

  const handleIssueToWIP = async () => {
    if (!issueItem) return;
    const qtyKg = parseFloat(issueQtyKg);
    if (isNaN(qtyKg) || qtyKg <= 0 || qtyKg > issueItem.closing_kg) {
      alert(`Invalid quantity (max ${issueItem.closing_kg.toFixed(2)} kg)`);
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
    } catch (e: any) { alert(e.message); }
    finally { setIssuing(false); }
  };

  const updateIssueBags = (bagsStr: string) => {
    setIssueQtyBags(bagsStr);
    const bags = parseFloat(bagsStr);
    if (issueItem && issueItem.conversion_kg && !isNaN(bags)) {
      setIssueQtyKg((bags * issueItem.conversion_kg).toFixed(2));
    } else { setIssueQtyKg(""); }
  };

  const updateIssueKg = (kgStr: string) => {
    setIssueQtyKg(kgStr);
    const kg = parseFloat(kgStr);
    if (issueItem && issueItem.conversion_kg && !isNaN(kg)) {
      setIssueQtyBags((kg / issueItem.conversion_kg).toFixed(2));
    } else { setIssueQtyBags(""); }
  };

  const handlePrint = () => window.print();

  const renderRow = (item: MaterialStockMovement) => {
    const isParent = !item.isChild && item.children && item.children.length > 0;
    const isChild = !!item.isChild;
    const isExpanded = expandedParents.has(item.product_id);
    const lowStock = item.closing_kg <= item.reorder_level && item.reorder_level > 0;
    const hasBags = item.uom === "bags" && item.conversion_kg != null;
    const toBags = (kg: number) => (kg / item.conversion_kg!).toFixed(2);

    if (isChild && item.parent_product_id && !expandedParents.has(item.parent_product_id)) {
      return null;
    }

    return (
      <tr
        key={item.product_id}
        className={cn(
          "hover:bg-gray-50 transition-colors",
          isChild && "bg-gray-50/50",
          lowStock && "bg-amber-50",
        )}
      >
        <td className="table-td w-8 print:hidden text-xs font-medium text-gray-700">
          {isParent && (
            <button onClick={() => toggleExpand(item.product_id)} className="p-0.5 text-gray-400 hover:text-gray-600">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
        {visibleColumns.code && (
          <td className={cn("table-td text-xs font-medium font-mono text-brand-600 min-w-[100px]", isChild && "pl-6")}>{item.code}</td>
        )}
        {visibleColumns.name && (
          <td className={cn("table-td text-xs font-medium text-gray-700", isChild && "pl-6")}>
            {isChild && <span className="text-gray-300 mr-1">└</span>}
            {item.name}
            {lowStock && <AlertTriangle className="h-3 w-3 text-amber-500 inline ml-1" />}
            {isParent && <span className="ml-1.5 text-[10px] text-gray-400 font-normal">({item.children!.length} variants)</span>}
          </td>
        )}
        {visibleColumns.category && <td className="table-td text-xs font-medium text-gray-700 whitespace-nowrap">{item.category}</td>}
        {visibleColumns.uom && <td className="table-td text-xs font-medium text-gray-700 uppercase">{item.uom}</td>}
        {visibleColumns.reorder_level && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.reorder_level}</td>}
        {visibleColumns.opening_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.opening_kg.toFixed(2)}</td>}
        {visibleColumns.received_supplier_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.received_supplier_kg.toFixed(2)}</td>}
        {visibleColumns.received_rc_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.received_rc_kg.toFixed(2)}</td>}
        {visibleColumns.issued_wip_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.issued_wip_kg.toFixed(2)}</td>}
        {visibleColumns.closing_kg && <td className={cn("table-td text-xs font-medium text-gray-700 text-right", isParent ? "font-semibold" : "")}>{item.closing_kg.toFixed(2)}</td>}
        {visibleColumns.closing_bags && <td className="table-td text-xs font-medium text-gray-700 text-right">{hasBags ? toBags(item.closing_kg) : "—"}</td>}
        <td className="table-td text-xs font-medium text-right print:hidden">
          {!isParent && (
            <button className="text-brand-600 hover:text-brand-700" onClick={() => { setIssueItem(item); setIssueQtyKg(""); setIssueQtyBags(""); }}>
              <Send className="h-3 w-3 inline" /> Issue to WIP
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Material Store (Raw Materials & Chemicals)"
        subtitle="Date‑range report – all quantities in KG"
        actions={
          <button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
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

      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">From:</label>
          <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <label className="text-sm font-medium">To:</label>
          <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setShowColumnMenu(!showColumnMenu)}><Settings2 className="h-3.5 w-3.5" /> Columns</button>
            {showColumnMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                <div className="p-2 space-y-1">
                  {Object.entries(visibleColumns).map(([key, value]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input type="checkbox" checked={value} onChange={() => toggleColumn(key as keyof typeof visibleColumns)} className="rounded border-gray-300" />
                      <span className="capitalize text-gray-600">{key === "reorder_level" ? "Reorder Lvl" : key.replace(/_kg$/, "").replace(/_bags$/, " (Bags)").replace(/_/g, " ")}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={handlePrint} className="btn-secondary text-xs flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Print</button>
        </div>
      </div>

      <div className="relative max-w-sm mb-4 print:hidden">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {/* Table subtitle */}
      <div className="flex items-center justify-end mb-2 print:hidden">
        <span className="text-[10px] text-gray-400 font-medium">All quantities in KG</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">No data.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th w-8 print:hidden whitespace-nowrap"></th>
                {visibleColumns.code && <th className="table-th cursor-pointer whitespace-nowrap min-w-[100px]" onClick={() => handleSort("code")}>Code {renderSortIcon("code")}</th>}
                {visibleColumns.name && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("name")}>Name {renderSortIcon("name")}</th>}
                {visibleColumns.category && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("category")}>Category {renderSortIcon("category")}</th>}
                {visibleColumns.uom && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("uom")}>UOM {renderSortIcon("uom")}</th>}
                {visibleColumns.reorder_level && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("reorder_level")}>Reorder {renderSortIcon("reorder_level")}</th>}
                {visibleColumns.opening_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("opening_kg")}>Opening {renderSortIcon("opening_kg")}</th>}
                {visibleColumns.received_supplier_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("received_supplier_kg")}>Recv Supplier {renderSortIcon("received_supplier_kg")}</th>}
                {visibleColumns.received_rc_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("received_rc_kg")}>Recv RC {renderSortIcon("received_rc_kg")}</th>}
                {visibleColumns.issued_wip_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("issued_wip_kg")}>Issued WIP {renderSortIcon("issued_wip_kg")}</th>}
                {visibleColumns.closing_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("closing_kg")}>Closing {renderSortIcon("closing_kg")}</th>}
                {visibleColumns.closing_bags && <th className="table-th text-right whitespace-nowrap">Closing (Bags)</th>}
                <th className="table-th print:hidden whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => renderRow(item))}
            </tbody>
          </table>
        )}
      </div>

      {/* Incoming Modal */}
      {showIncoming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-4">
            <div className="flex justify-between"><h2 className="text-lg font-semibold">Incoming Transfers</h2><button onClick={() => setShowIncoming(false)}><X className="h-5 w-5" /></button></div>
            {incoming.length === 0 ? <p className="text-sm text-gray-400">No pending transfers.</p> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="px-2 py-1">From</th><th className="px-2 py-1">Product</th><th className="px-2 py-1 text-right">Qty (KG)</th><th className="px-2 py-1">UOM</th><th className="px-2 py-1"></th></tr></thead>
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

      {/* Issue Modal */}
      {issueItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
          <div className="bg-white rounded-xl p-6 w-96 space-y-4">
            <h2 className="text-lg font-semibold">Issue to WIP: {issueItem.name}</h2>
            <p className="text-sm text-gray-500">Available (closing): {issueItem.closing_kg.toFixed(2)} kg</p>
            <div>
              <label className="label">Quantity (KG)</label>
              <input type="number" step="0.001" min="0" max={issueItem.closing_kg} className="input" value={issueQtyKg} onChange={e => updateIssueKg(e.target.value)} />
            </div>
            {issueItem.uom === "bags" && issueItem.conversion_kg != null && (
              <div>
                <label className="label">Bags (1 bag = {issueItem.conversion_kg} kg)</label>
                <input type="number" step="0.001" min="0" className="input" value={issueQtyBags} onChange={e => updateIssueBags(e.target.value)} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setIssueItem(null); setIssueQtyKg(""); setIssueQtyBags(""); }}>Cancel</button>
              <button className="btn-primary" disabled={issuing || !issueQtyKg} onClick={handleIssueToWIP}>{issuing ? "Sending..." : "Send"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
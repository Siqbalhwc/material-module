"use client";
import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Package,
  Printer, X, Settings2,
  ChevronDown, ChevronRight, Download
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";
import * as XLSX from 'xlsx';

type FGStockMovement = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  conversion_kg?: number;
  opening_kg: number;
  received_kg: number;
  issued_kg: number;
  closing_kg: number;
  parent_product_id?: string | null;
  children?: FGStockMovement[];
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

type SortField = "code" | "name" | "category" | "uom" | "opening_kg" | "received_kg" | "issued_kg" | "closing_kg";
type SortDir = "asc" | "desc";

export default function FinishedGoodsPage() {
  const supabase = createClient();
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const [movements, setMovements] = useState<FGStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const [visibleColumns, setVisibleColumns] = useState({
    code: true, name: true, category: true, uom: true,
    opening_kg: true, received_kg: true, issued_kg: true, closing_kg: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  const [companyName, setCompanyName] = useState("MaterialFlow");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("company_settings").select("company_name, logo_url").limit(1).maybeSingle().then(({ data }) => {
      if (data) { setCompanyName(data.company_name || "MaterialFlow"); setLogoUrl(data.logo_url || null); }
    });
  }, []);

  const fetchMovements = async () => {
    setLoading(true);
    const start = startDate;
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data: allProducts } = await supabase
      .from("stock_ledger")
      .select("product_id, products(code, name, category, uom, conversion_kg, parent_product_id)")
      .eq("store", "finished_goods");

    if (!allProducts) { setMovements([]); setLoading(false); return; }

    const uniqueMap = new Map<string, FGStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        const prod = (row.products as any);
        uniqueMap.set(row.product_id, {
          product_id: row.product_id, code: prod?.code ?? "", name: prod?.name ?? "Unknown",
          category: prod?.category ?? "", uom: prod?.uom ?? "",
          conversion_kg: prod?.conversion_kg ?? undefined,
          parent_product_id: prod?.parent_product_id ?? null,
          opening_kg: 0, received_kg: 0, issued_kg: 0, closing_kg: 0,
        });
      }
    }
    const items = Array.from(uniqueMap.values());

    for (const item of items) {
      const { data: before } = await supabase
        .from("stock_ledger").select("quantity, direction")
        .eq("product_id", item.product_id).eq("store", "finished_goods").lt("created_at", start);
      item.opening_kg = (before || []).reduce((sum, r) => sum + r.quantity * r.direction, 0);
    }

    for (const item of items) {
      const { data: month } = await supabase
        .from("stock_ledger").select("quantity, direction")
        .eq("product_id", item.product_id).eq("store", "finished_goods").gte("created_at", start).lt("created_at", end);
      let recv = 0, iss = 0;
      for (const r of (month || [])) {
        if (r.direction === 1) recv += r.quantity;
        else iss += r.quantity;
      }
      item.received_kg = recv; item.issued_kg = iss;
      item.closing_kg = item.opening_kg + recv - iss;
    }

    // Build hierarchy
    const parentMap = new Map<string, FGStockMovement>();
    const children: FGStockMovement[] = [];
    for (const item of items) {
      if (!item.parent_product_id) parentMap.set(item.product_id, { ...item, children: [] });
      else children.push({ ...item, isChild: true });
    }
    const missingParentIds = Array.from(new Set(children.map(c => c.parent_product_id!).filter(pid => pid && !parentMap.has(pid))));
    if (missingParentIds.length > 0) {
      const { data: missingParents } = await supabase.from("products").select("id, code, name, category, uom, conversion_kg").in("id", missingParentIds);
      for (const p of (missingParents || [])) {
        parentMap.set(p.id, { product_id: p.id, code: p.code ?? "", name: p.name ?? "Unknown", category: p.category ?? "", uom: p.uom ?? "", conversion_kg: p.conversion_kg ?? undefined, opening_kg: 0, received_kg: 0, issued_kg: 0, closing_kg: 0, parent_product_id: null, children: [] });
      }
    }
    for (const child of children) {
      const parent = parentMap.get(child.parent_product_id!);
      if (parent) {
        parent.children!.push(child);
        parent.opening_kg += child.opening_kg; parent.received_kg += child.received_kg;
        parent.issued_kg += child.issued_kg; parent.closing_kg += child.closing_kg;
      } else {
        parentMap.set(child.product_id, { ...child, isChild: false, parent_product_id: null, children: [] });
      }
    }

    const displayList: FGStockMovement[] = [];
    for (const parent of Array.from(parentMap.values())) {
      displayList.push(parent);
      if (parent.children && parent.children.length > 0) displayList.push(...parent.children);
    }
    setMovements(displayList);
    setLoading(false);
  };

  const fetchIncoming = async () => {
    const { data } = await supabase.from("store_transfers").select("*, products(code, name)")
      .eq("to_store", "finished_goods").eq("status", "pending").order("created_at", { ascending: false });
    if (data) setIncoming(data.map((r: any) => ({ id: r.id, from_store: r.from_store, product_id: r.product_id, product_name: r.products?.name ?? "", product_code: r.products?.code ?? "", quantity: r.quantity, uom: r.uom })));
  };

  useEffect(() => { fetchMovements(); fetchIncoming(); }, [startDate, endDate]);

  const toggleExpand = (id: string) => { setExpandedParents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  const filtered = useMemo(() => {
    let list = [...movements];
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
        case "category": va = a.category; vb = b.category; break;
        case "uom": va = a.uom; vb = b.uom; break;
        case "opening_kg": va = a.opening_kg; vb = b.opening_kg; break;
        case "received_kg": va = a.received_kg; vb = b.received_kg; break;
        case "issued_kg": va = a.issued_kg; vb = b.issued_kg; break;
        case "closing_kg": va = a.closing_kg; vb = b.closing_kg; break;
        default: return 0;
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      else return sortDir === "asc" ? va - vb : vb - va;
    });
    const childMap = new Map<string, FGStockMovement[]>();
    list.filter(i => i.isChild).forEach(c => { const pid = c.parent_product_id!; if (!childMap.has(pid)) childMap.set(pid, []); childMap.get(pid)!.push(c); });
    const result: FGStockMovement[] = [];
    for (const parent of parents) { result.push(parent); result.push(...(childMap.get(parent.product_id) || [])); }
    return result;
  }, [movements, searchQuery, sortField, sortDir]);

  const handleSort = (f: SortField) => { if (sortField === f) setSortDir(p => p === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };
  const sortIcon = (f: SortField) => sortField !== f ? <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" /> : sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  const toggleCol = (k: keyof typeof visibleColumns) => setVisibleColumns(p => ({ ...p, [k]: !p[k] }));

  const handleIncomingAction = async (id: string, action: "accepted" | "rejected") => {
    const t = incoming.find(x => x.id === id); if (!t) return;
    if (action === "accepted") {
      await supabase.from("stock_ledger").insert([
        { product_id: t.product_id, store: t.from_store as StoreType, txn_type: "issued", quantity: t.quantity, direction: -1, reference_type: "store_transfer", reference_id: id },
        { product_id: t.product_id, store: "finished_goods" as StoreType, txn_type: "received", quantity: t.quantity, direction: 1, reference_type: "store_transfer", reference_id: id },
      ]);
    }
    await supabase.from("store_transfers").update({ status: action, [action === "accepted" ? "accepted_at" : "rejected_at"]: new Date().toISOString() }).eq("id", id);
    fetchIncoming(); fetchMovements();
  };

  const handleExportExcel = async () => {
    const summaryData = filtered.map(item => ({
      Code: item.code,
      Name: item.name,
      Category: item.category,
      UOM: item.uom,
      "Opening (KG)": item.opening_kg,
      "Received (KG)": item.received_kg,
      "Issued (KG)": item.issued_kg,
      "Closing (KG)": item.closing_kg,
    }));

    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data: transactions } = await supabase
      .from("stock_ledger")
      .select("created_at, txn_type, quantity, direction, reference_type, reference_id, notes, products(name, code)")
      .eq("store", "finished_goods")
      .gte("created_at", startDate)
      .lt("created_at", end)
      .order("created_at", { ascending: true });

    const transactionData = (transactions || []).map((t: any) => ({
      Date: new Date(t.created_at).toLocaleDateString("en-GB"),
      Type: t.txn_type,
      Product: t.products?.name || "Unknown",
      Code: t.products?.code || "",
      Direction: t.direction === 1 ? "In" : "Out",
      Quantity: t.quantity,
      Reference: t.reference_type || "",
      "Ref ID": t.reference_id ? t.reference_id.slice(0, 8) : "",
      Notes: t.notes || "",
    }));

    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    const ws2 = XLSX.utils.json_to_sheet(transactionData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");
    XLSX.utils.book_append_sheet(wb, ws2, "Transactions");
    XLSX.writeFile(wb, `finished_goods_${startDate}_to_${endDate}.xlsx`);
  };

  const renderRow = (item: FGStockMovement) => {
    const isParent = !item.isChild && item.children && item.children.length > 0;
    const isChild = !!item.isChild;
    const isExpanded = expandedParents.has(item.product_id);
    if (isChild && item.parent_product_id && !expandedParents.has(item.parent_product_id)) return null;

    return (
      <tr key={item.product_id} className={cn("hover:bg-gray-50", isChild && "bg-gray-50/50")}>
        <td className="table-td w-8 print:hidden text-xs font-medium text-gray-700">
          {isParent && <button onClick={() => toggleExpand(item.product_id)}>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}
        </td>
        {visibleColumns.code && <td className={cn("table-td text-xs font-medium font-mono text-brand-600 min-w-[100px]", isChild && "pl-6")}>{item.code}</td>}
        {visibleColumns.name && <td className={cn("table-td text-xs font-medium text-gray-700", isChild && "pl-6")}>{isChild && "└ "}{item.name}{isParent && <span className="ml-1 text-[10px] text-gray-400">({item.children!.length} variants)</span>}</td>}
        {visibleColumns.category && <td className="table-td text-xs font-medium text-gray-700 whitespace-nowrap">{item.category}</td>}
        {visibleColumns.uom && <td className="table-td text-xs font-medium text-gray-700 uppercase">{item.uom}</td>}
        {visibleColumns.opening_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.opening_kg.toFixed(2)}</td>}
        {visibleColumns.received_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.received_kg.toFixed(2)}</td>}
        {visibleColumns.issued_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.issued_kg.toFixed(2)}</td>}
        {visibleColumns.closing_kg && <td className="table-td text-xs font-medium text-gray-700 text-right font-semibold">{item.closing_kg.toFixed(2)}</td>}
      </tr>
    );
  };

  return (
    <div className="p-6">
      <style jsx global>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 15px 20px; }
          .no-print { display: none !important; }
        }
        @media screen {
          .print-area { display: none; }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title="Finished Goods"
          subtitle="Date‑range report"
          actions={
            <button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
              <Package className="h-4 w-4" />
              {incoming.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{incoming.length}</span>}
              Incoming
            </button>
          }
        />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3"><label className="text-sm font-medium">From:</label><input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} /><label className="text-sm font-medium">To:</label><input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setShowColumnMenu(!showColumnMenu)}><Settings2 className="h-3.5 w-3.5" /> Columns</button>
            <button onClick={() => window.print()} className="btn-secondary text-xs flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Print</button>
            <button onClick={handleExportExcel} className="btn-secondary text-xs flex items-center gap-1"><Download className="h-3.5 w-3.5" /> Excel</button>
          </div>
        </div>
        <div className="relative max-w-sm mb-4"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
        <div className="flex items-center justify-end mb-2"><span className="text-[10px] text-gray-400 font-medium">All quantities in KG</span></div>
        <div className="card overflow-hidden">
          {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? <div className="py-16 text-center text-gray-400">No data.</div> :
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>
                <th className="table-th w-8 print:hidden whitespace-nowrap"></th>
                {visibleColumns.code && <th className="table-th cursor-pointer whitespace-nowrap min-w-[100px]" onClick={() => handleSort("code")}>Code {sortIcon("code")}</th>}
                {visibleColumns.name && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("name")}>Name {sortIcon("name")}</th>}
                {visibleColumns.category && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("category")}>Category {sortIcon("category")}</th>}
                {visibleColumns.uom && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("uom")}>UOM {sortIcon("uom")}</th>}
                {visibleColumns.opening_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("opening_kg")}>Opening {sortIcon("opening_kg")}</th>}
                {visibleColumns.received_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("received_kg")}>Received {sortIcon("received_kg")}</th>}
                {visibleColumns.issued_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("issued_kg")}>Issued {sortIcon("issued_kg")}</th>}
                {visibleColumns.closing_kg && <th className="table-th cursor-pointer text-right whitespace-nowrap" onClick={() => handleSort("closing_kg")}>Closing {sortIcon("closing_kg")}</th>}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">{filtered.map(item => renderRow(item))}</tbody>
            </table>}
        </div>
      </div>

      {/* Print area */}
      <div className="print-area">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-contain" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-400"><Package className="h-5 w-5 text-white" /></div>}
            <div><h1 className="text-lg font-bold text-gray-900">{companyName}</h1><p className="text-[10px] text-gray-500">Finished Goods Report</p></div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-900">{startDate} to {endDate}</p>
            <p className="text-[10px] text-gray-500">Opening + Received – Issued = Closing</p>
          </div>
        </div>
        <table className="w-full text-[10px] border border-gray-200 rounded-lg overflow-hidden mb-4">
          <thead className="bg-gray-50"><tr>
            <th className="px-1.5 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">Code</th>
            <th className="px-1.5 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">Name</th>
            <th className="px-1.5 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">Cat</th>
            <th className="px-1.5 py-1.5 text-center font-medium text-gray-600 whitespace-nowrap">UOM</th>
            <th className="px-1.5 py-1.5 text-right font-medium text-gray-600 whitespace-nowrap">Opening</th>
            <th className="px-1.5 py-1.5 text-right font-medium text-gray-600 whitespace-nowrap">Received</th>
            <th className="px-1.5 py-1.5 text-right font-medium text-gray-600 whitespace-nowrap">Issued</th>
            <th className="px-1.5 py-1.5 text-right font-medium text-gray-600 whitespace-nowrap">Closing</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(item => {
              const isParent = !item.isChild && item.children && item.children.length > 0;
              const isChild = !!item.isChild;
              return (
                <tr key={item.product_id} className={isChild ? "bg-gray-50/50" : ""}>
                  <td className="px-1.5 py-1 text-xs font-medium font-mono text-gray-700">{isChild && "└ "}{item.code}</td>
                  <td className="px-1.5 py-1 text-xs font-medium text-gray-700">{item.name}{isParent && <span className="ml-1 text-[8px] text-gray-400">({item.children!.length})</span>}</td>
                  <td className="px-1.5 py-1 text-xs text-gray-600 whitespace-nowrap">{item.category}</td>
                  <td className="px-1.5 py-1 text-xs text-gray-600 text-center uppercase">{item.uom}</td>
                  <td className="px-1.5 py-1 text-xs font-medium text-gray-700 text-right">{item.opening_kg.toFixed(2)}</td>
                  <td className="px-1.5 py-1 text-xs font-medium text-gray-700 text-right">{item.received_kg.toFixed(2)}</td>
                  <td className="px-1.5 py-1 text-xs font-medium text-gray-700 text-right">{item.issued_kg.toFixed(2)}</td>
                  <td className={cn("px-1.5 py-1 text-xs font-medium text-gray-700 text-right", isParent && "font-semibold")}>{item.closing_kg.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="text-[9px] text-gray-500 border-t pt-2"><p>Printed on {new Date().toLocaleString()} | All quantities in KG</p></div>
      </div>

      {/* Incoming modal */}
      {showIncoming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="bg-white rounded-xl p-6 w-full max-w-2xl"><div className="flex justify-between"><h2 className="text-lg font-semibold">Incoming</h2><button onClick={() => setShowIncoming(false)}><X className="h-5 w-5" /></button></div>{incoming.length === 0 ? <p>No pending transfers.</p> : <table className="w-full text-sm"><thead><tr><th>From</th><th>Product</th><th>Qty</th><th>UOM</th><th></th></tr></thead><tbody>{incoming.map(t => <tr key={t.id}><td>{t.from_store}</td><td>{t.product_name}</td><td>{t.quantity}</td><td>{t.uom}</td><td className="space-x-1"><button onClick={() => handleIncomingAction(t.id, "accepted")} className="text-green-600 text-xs">Accept</button><button onClick={() => handleIncomingAction(t.id, "rejected")} className="text-red-600 text-xs">Reject</button></td></tr>)}</tbody></table>}</div></div>}
    </div>
  );
}
"use client";
import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import {
  Plus, Send, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown, Settings2, Printer
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  verified: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

type OutwardGatePass = {
  id: string;
  ogp_number: string;
  customer_id: string | null;
  customer_name: string | null;
  vehicle_number: string;
  driver_name: string | null;
  dispatch_date: string;
  status: string;
  item_count: number;
};

type SortField = "ogp_number" | "dispatch_date" | "customer_name" | "vehicle_number" | "item_count" | "status";
type SortDir = "asc" | "desc";

export default function OutwardGatePassPage() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const supabase = createClient();
  const [records, setRecords] = useState<OutwardGatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("dispatch_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [visibleColumns, setVisibleColumns] = useState({
    ogp_number: true,
    dispatch_date: true,
    customer_name: true,
    vehicle_number: true,
    item_count: true,
    status: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const [companyName, setCompanyName] = useState("MaterialFlow");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("company_settings")
      .select("company_name, logo_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCompanyName(data.company_name || "MaterialFlow");
          setLogoUrl(data.logo_url || null);
        }
      });
  }, []);

  const fetchOutwardGatePasses = async () => {
    setLoading(true);
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("outward_gate_passes")
      .select(`*, customers(name), ogp_line_items(count)`)
      .gte("dispatch_date", startDate)
      .lt("dispatch_date", end)
      .order("dispatch_date", { ascending: false });

    if (!error && data) {
      setRecords(data.map((r: any) => ({
        id: r.id,
        ogp_number: r.ogp_number,
        customer_id: r.customer_id,
        customer_name: r.customers?.name ?? null,
        vehicle_number: r.vehicle_number,
        driver_name: r.driver_name,
        dispatch_date: r.dispatch_date,
        status: r.status,
        item_count: r.ogp_line_items?.[0]?.count ?? 0,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchOutwardGatePasses(); }, [startDate, endDate]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        r.ogp_number.toLowerCase().includes(q) ||
        (r.customer_name && r.customer_name.toLowerCase().includes(q)) ||
        r.vehicle_number.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "ogp_number": valA = a.ogp_number; valB = b.ogp_number; break;
        case "dispatch_date": valA = a.dispatch_date; valB = b.dispatch_date; break;
        case "customer_name": valA = a.customer_name || ""; valB = b.customer_name || ""; break;
        case "vehicle_number": valA = a.vehicle_number; valB = b.vehicle_number; break;
        case "item_count": valA = a.item_count; valB = b.item_count; break;
        case "status": valA = a.status; valB = b.status; break;
        default: return 0;
      }
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [records, searchQuery, sortField, sortDir]);

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
    <div className="p-6">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px 30px; }
          .no-print { display: none !important; }
        }
        @media screen {
          .print-area { display: none; }
        }
      `}</style>

      {/* Screen view */}
      <div className="no-print">
        <PageHeader
          title="Outward Gate Pass"
          subtitle="Finished goods dispatched to customers"
          actions={
            <Link href="/outward-gate-pass/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New Outward Gate Pass
            </Link>
          }
        />

        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">From:</label>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <label className="text-sm font-medium">To:</label>
            <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setShowColumnMenu(!showColumnMenu)}><Settings2 className="h-3.5 w-3.5" /> Columns</button>
            <button onClick={() => window.print()} className="btn-secondary text-xs flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Print</button>
          </div>
        </div>

        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Send className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">{searchQuery ? "No gate passes match your search" : "No outward gate passes yet"}</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {visibleColumns.ogp_number && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("ogp_number")}>OGP No. {renderSortIcon("ogp_number")}</th>}
                  {visibleColumns.dispatch_date && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("dispatch_date")}>Date {renderSortIcon("dispatch_date")}</th>}
                  {visibleColumns.customer_name && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("customer_name")}>Customer {renderSortIcon("customer_name")}</th>}
                  {visibleColumns.vehicle_number && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("vehicle_number")}>Vehicle {renderSortIcon("vehicle_number")}</th>}
                  {visibleColumns.item_count && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("item_count")}>Items {renderSortIcon("item_count")}</th>}
                  {visibleColumns.status && <th className="table-th cursor-pointer whitespace-nowrap" onClick={() => handleSort("status")}>Status {renderSortIcon("status")}</th>}
                  <th className="table-th whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    {visibleColumns.ogp_number && <td className="table-td text-xs font-medium font-mono text-brand-600">{r.ogp_number}</td>}
                    {visibleColumns.dispatch_date && <td className="table-td text-xs font-medium text-gray-700">{formatDate(r.dispatch_date)}</td>}
                    {visibleColumns.customer_name && <td className="table-td text-xs font-medium text-gray-700">{r.customer_name || "—"}</td>}
                    {visibleColumns.vehicle_number && <td className="table-td text-xs font-medium text-gray-700 font-mono">{r.vehicle_number}</td>}
                    {visibleColumns.item_count && <td className="table-td text-xs font-medium text-gray-700 text-center">{r.item_count}</td>}
                    {visibleColumns.status && <td className="table-td text-xs font-medium"><span className={cn("badge", STATUS_STYLE[r.status])}>{r.status}</span></td>}
                    <td className="table-td text-xs font-medium">
                      <Link href={`/outward-gate-pass/${r.id}`} className="text-brand-600 hover:text-brand-700"><Eye className="h-3.5 w-3.5 inline" /> View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Print area */}
      <div className="print-area">
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-lg object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-400"><Send className="h-6 w-6 text-white" /></div>}
            <div><h1 className="text-xl font-bold text-gray-900">{companyName}</h1><p className="text-xs text-gray-500">Outward Gate Pass Register</p></div>
          </div>
          <div className="text-right"><p className="text-sm font-semibold text-gray-900">{startDate} to {endDate}</p><p className="text-xs text-gray-500">Total Records: {filtered.length}</p></div>
        </div>
        <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden mb-6">
          <thead className="bg-gray-50">
            <tr>
              {visibleColumns.ogp_number && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">OGP No.</th>}
              {visibleColumns.dispatch_date && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Date</th>}
              {visibleColumns.customer_name && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Customer</th>}
              {visibleColumns.vehicle_number && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Vehicle</th>}
              {visibleColumns.item_count && <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Items</th>}
              {visibleColumns.status && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Status</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(r => (
              <tr key={r.id}>
                {visibleColumns.ogp_number && <td className="px-2 py-2 text-xs font-medium font-mono text-gray-700">{r.ogp_number}</td>}
                {visibleColumns.dispatch_date && <td className="px-2 py-2 text-xs font-medium text-gray-700">{formatDate(r.dispatch_date)}</td>}
                {visibleColumns.customer_name && <td className="px-2 py-2 text-xs font-medium text-gray-700">{r.customer_name || "—"}</td>}
                {visibleColumns.vehicle_number && <td className="px-2 py-2 text-xs font-medium text-gray-700 font-mono">{r.vehicle_number}</td>}
                {visibleColumns.item_count && <td className="px-2 py-2 text-xs font-medium text-gray-700 text-center">{r.item_count}</td>}
                {visibleColumns.status && <td className="px-2 py-2 text-xs font-medium"><span className={cn("badge", STATUS_STYLE[r.status])}>{r.status}</span></td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-gray-500 border-t pt-3"><p>Printed on {new Date().toLocaleString()}</p></div>
      </div>
    </div>
  );
}
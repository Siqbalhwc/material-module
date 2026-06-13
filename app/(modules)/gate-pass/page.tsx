"use client";
import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import {
  Plus, Truck, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown, Settings2, Printer
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  verified: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

type GatePassWithMeta = {
  id: string;
  igp_number: string;
  supplier_id: string | null;
  vehicle_number: string;
  driver_name: string | null;
  received_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  supplier_name: string | null;
  item_count: number;
};

type SortField = "igp_number" | "received_date" | "supplier_name" | "vehicle_number" | "item_count" | "status";
type SortDir = "asc" | "desc";

export default function GatePassPage() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const [records, setRecords] = useState<GatePassWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("received_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [visibleColumns, setVisibleColumns] = useState({
    igp_number: true,
    received_date: true,
    supplier_name: true,
    vehicle_number: true,
    item_count: true,
    status: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Company settings for print header
  const [companyName, setCompanyName] = useState("MaterialFlow");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const supabase = createClient();

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

  const fetchGatePasses = async () => {
    setLoading(true);
    const endInclusive = new Date(endDate);
    endInclusive.setDate(endInclusive.getDate() + 1);
    const end = endInclusive.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("inward_gate_passes")
      .select(`*, suppliers(name), igp_line_items(count)`)
      .gte("received_date", startDate)
      .lt("received_date", end)
      .order("received_date", { ascending: false });

    if (error) {
      console.error("Failed to fetch gate passes:", error);
      setRecords([]);
    } else {
      const mapped: GatePassWithMeta[] = (data || []).map((row: any) => ({
        id: row.id,
        igp_number: row.igp_number,
        supplier_id: row.supplier_id,
        vehicle_number: row.vehicle_number,
        driver_name: row.driver_name,
        received_date: row.received_date,
        status: row.status,
        notes: row.notes,
        created_at: row.created_at,
        supplier_name: row.suppliers?.name ?? null,
        item_count: row.igp_line_items?.[0]?.count ?? 0,
      }));
      setRecords(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGatePasses();
  }, [startDate, endDate]);

  const filtered = useMemo(() => {
    let list = [...records];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.igp_number.toLowerCase().includes(q) ||
          (r.supplier_name && r.supplier_name.toLowerCase().includes(q)) ||
          r.vehicle_number.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "igp_number": valA = a.igp_number; valB = b.igp_number; break;
        case "received_date": valA = a.received_date; valB = b.received_date; break;
        case "supplier_name": valA = a.supplier_name || ""; valB = b.supplier_name || ""; break;
        case "vehicle_number": valA = a.vehicle_number; valB = b.vehicle_number; break;
        case "item_count": valA = a.item_count; valB = b.item_count; break;
        case "status": valA = a.status; valB = b.status; break;
        default: return 0;
      }
      if (typeof valA === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
    });

    return list;
  }, [records, searchQuery, sortField, sortDir]);

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

  const toggleColumn = (key: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6">
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px 30px; }
          .screen-only { display: none !important; }
        }
        @media screen {
          .print-only-header { display: none; }
        }
      `}</style>

      {/* Screen view */}
      <div className="screen-only">
        <PageHeader
          title="Inward Gate Pass"
          subtitle="Material received into factory store"
          actions={
            <Link href="/gate-pass/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New Gate Pass
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
            <div className="relative">
              <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setShowColumnMenu(!showColumnMenu)}>
                <Settings2 className="h-3.5 w-3.5" /> Columns
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                  <div className="p-2 space-y-1">
                    {Object.entries(visibleColumns).map(([key, value]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input type="checkbox" checked={value} onChange={() => toggleColumn(key as keyof typeof visibleColumns)} className="rounded border-gray-300" />
                        <span className="capitalize text-gray-600">{key === "igp_number" ? "IGP No." : key === "received_date" ? "Date" : key === "supplier_name" ? "Supplier" : key === "vehicle_number" ? "Vehicle" : key === "item_count" ? "Items" : "Status"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => window.print()} className="btn-secondary text-xs flex items-center gap-1">
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>

        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {/* Print area */}
      <div className="print-area">
        {/* Print header */}
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-lg object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-400">
                <Truck className="h-6 w-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{companyName}</h1>
              <p className="text-xs text-gray-500">Inward Gate Pass Register</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">
              {startDate} to {endDate}
            </p>
            <p className="text-xs text-gray-500">Total Records: {filtered.length}</p>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden mb-6">
          <thead className="bg-gray-50">
            <tr>
              {visibleColumns.igp_number && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">IGP No.</th>}
              {visibleColumns.received_date && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Date</th>}
              {visibleColumns.supplier_name && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Supplier</th>}
              {visibleColumns.vehicle_number && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Vehicle</th>}
              {visibleColumns.item_count && <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Items</th>}
              {visibleColumns.status && <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Status</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <tr key={r.id}>
                {visibleColumns.igp_number && <td className="px-2 py-2 text-xs font-medium font-mono text-gray-700">{r.igp_number}</td>}
                {visibleColumns.received_date && <td className="px-2 py-2 text-xs font-medium text-gray-700">{formatDate(r.received_date)}</td>}
                {visibleColumns.supplier_name && <td className="px-2 py-2 text-xs font-medium text-gray-700">{r.supplier_name || "—"}</td>}
                {visibleColumns.vehicle_number && <td className="px-2 py-2 text-xs font-medium text-gray-700 font-mono">{r.vehicle_number}</td>}
                {visibleColumns.item_count && <td className="px-2 py-2 text-xs font-medium text-gray-700 text-center">{r.item_count}</td>}
                {visibleColumns.status && <td className="px-2 py-2 text-xs font-medium"><span className={cn("badge", STATUS_STYLE[r.status])}>{r.status}</span></td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div className="text-xs text-gray-500 border-t pt-3">
          <p>Printed on {new Date().toLocaleString()}</p>
          <p className="mt-1">This is a computer‑generated document.</p>
        </div>
      </div>

      {/* Screen table (repeated for screen view) */}
      <div className="screen-only">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Truck className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">{searchQuery ? "No gate passes match your search" : "No gate passes yet"}</p>
              {!searchQuery && (
                <Link href="/gate-pass/new" className="btn-primary mt-4">
                  <Plus className="h-4 w-4" /> Create first gate pass
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {visibleColumns.igp_number && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort("igp_number")}>
                      <span className="inline-flex items-center">IGP No. {renderSortIcon("igp_number")}</span>
                    </th>
                  )}
                  {visibleColumns.received_date && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort("received_date")}>
                      <span className="inline-flex items-center">Date {renderSortIcon("received_date")}</span>
                    </th>
                  )}
                  {visibleColumns.supplier_name && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort("supplier_name")}>
                      <span className="inline-flex items-center">Supplier {renderSortIcon("supplier_name")}</span>
                    </th>
                  )}
                  {visibleColumns.vehicle_number && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort("vehicle_number")}>
                      <span className="inline-flex items-center">Vehicle {renderSortIcon("vehicle_number")}</span>
                    </th>
                  )}
                  {visibleColumns.item_count && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort("item_count")}>
                      <span className="inline-flex items-center">Items {renderSortIcon("item_count")}</span>
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort("status")}>
                      <span className="inline-flex items-center">Status {renderSortIcon("status")}</span>
                    </th>
                  )}
                  <th className="table-th whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.igp_number && (
                      <td className="table-td text-xs font-medium font-mono text-brand-600">{r.igp_number}</td>
                    )}
                    {visibleColumns.received_date && (
                      <td className="table-td text-xs font-medium text-gray-700">{formatDate(r.received_date)}</td>
                    )}
                    {visibleColumns.supplier_name && (
                      <td className="table-td text-xs font-medium text-gray-700">{r.supplier_name || "—"}</td>
                    )}
                    {visibleColumns.vehicle_number && (
                      <td className="table-td text-xs font-medium text-gray-700 font-mono">{r.vehicle_number}</td>
                    )}
                    {visibleColumns.item_count && (
                      <td className="table-td text-xs font-medium text-gray-700 text-center">{r.item_count}</td>
                    )}
                    {visibleColumns.status && (
                      <td className="table-td text-xs font-medium">
                        <span className={cn("badge", STATUS_STYLE[r.status])}>{r.status}</span>
                      </td>
                    )}
                    <td className="table-td text-xs font-medium">
                      <Link href={`/gate-pass/${r.id}`}
                        className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700">
                        <Eye className="h-3.5 w-3.5" /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
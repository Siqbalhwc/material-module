"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import {
  Plus, Send, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown,
  Settings2, Printer
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

  const fetchOutwardGatePasses = async () => {
    const { data, error } = await supabase
      .from("outward_gate_passes")
      .select(`*, customers(name), ogp_line_items(count)`)
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

  useEffect(() => { fetchOutwardGatePasses(); }, []);

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

  const handlePrint = () => window.print();

  return (
    <>
      <Header
        title="Outward Gate Pass"
        subtitle="Finished goods dispatched to customers"
        actions={
          <Link href="/outward-gate-pass/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Outward Gate Pass
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by OGP No., Customer or Vehicle"
              className="input pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
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
                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                  <div className="p-2 space-y-1">
                    {Object.entries(visibleColumns).map(([key, value]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input type="checkbox" checked={value} onChange={() => toggleColumn(key as keyof typeof visibleColumns)} className="rounded border-gray-300" />
                        <span className="capitalize text-gray-600">
                          {key === "ogp_number" ? "OGP No." : key === "dispatch_date" ? "Date" : key === "customer_name" ? "Customer" : key === "vehicle_number" ? "Vehicle" : key === "item_count" ? "Items" : "Status"}
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

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Send className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery ? "No gate passes match your search" : "No outward gate passes yet"}
              </p>
              {!searchQuery && (
                <Link href="/outward-gate-pass/new" className="btn-primary mt-4">
                  <Plus className="h-4 w-4" /> Create first gate pass
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {visibleColumns.ogp_number && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("ogp_number")}>
                      <span className="inline-flex items-center">OGP No. {renderSortIcon("ogp_number")}</span>
                    </th>
                  )}
                  {visibleColumns.dispatch_date && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("dispatch_date")}>
                      <span className="inline-flex items-center">Date {renderSortIcon("dispatch_date")}</span>
                    </th>
                  )}
                  {visibleColumns.customer_name && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("customer_name")}>
                      <span className="inline-flex items-center">Customer {renderSortIcon("customer_name")}</span>
                    </th>
                  )}
                  {visibleColumns.vehicle_number && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("vehicle_number")}>
                      <span className="inline-flex items-center">Vehicle {renderSortIcon("vehicle_number")}</span>
                    </th>
                  )}
                  {visibleColumns.item_count && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("item_count")}>
                      <span className="inline-flex items-center">Items {renderSortIcon("item_count")}</span>
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("status")}>
                      <span className="inline-flex items-center">Status {renderSortIcon("status")}</span>
                    </th>
                  )}
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.ogp_number && (
                      <td className="table-td font-mono text-xs font-medium text-brand-600">{r.ogp_number}</td>
                    )}
                    {visibleColumns.dispatch_date && (
                      <td className="table-td">{formatDate(r.dispatch_date)}</td>
                    )}
                    {visibleColumns.customer_name && (
                      <td className="table-td">{r.customer_name || "—"}</td>
                    )}
                    {visibleColumns.vehicle_number && (
                      <td className="table-td font-mono text-xs">{r.vehicle_number}</td>
                    )}
                    {visibleColumns.item_count && (
                      <td className="table-td text-center">{r.item_count}</td>
                    )}
                    {visibleColumns.status && (
                      <td className="table-td">
                        <span className={cn("badge", STATUS_STYLE[r.status])}>{r.status}</span>
                      </td>
                    )}
                    <td className="table-td">
                      <Link href={`/outward-gate-pass/${r.id}`}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors">
                        <Eye className="h-3.5 w-3.5" /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
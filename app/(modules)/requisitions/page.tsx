"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, FileText, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn, REQ_STATUS_COLORS, STORE_LABELS } from "@/lib/utils";
import type { StoreType, RequisitionStatus } from "@/types";

type RequisitionWithMeta = {
  id: string;
  req_number: string;
  from_store: string;
  to_store: string;
  status: RequisitionStatus;   // ← typed correctly
  required_date: string | null;
  item_count: number;
  created_at: string;
};

type SortField = "req_number" | "from_store" | "to_store" | "item_count" | "required_date" | "status" | "created_at";
type SortDir = "asc" | "desc";

export default function RequisitionsPage() {
  const [records, setRecords] = useState<RequisitionWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [visibleColumns, setVisibleColumns] = useState({
    req_number: true,
    from_store: true,
    to_store: true,
    item_count: true,
    required_date: true,
    status: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const supabase = createClient();

  const fetchRequisitions = async () => {
    const { data, error } = await supabase
      .from("requisitions")
      .select(`*, requisition_items(count)`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch requisitions:", error);
    } else {
      const mapped: RequisitionWithMeta[] = (data || []).map((r: any) => ({
        id: r.id,
        req_number: r.req_number,
        from_store: r.from_store,
        to_store: r.to_store,
        status: r.status as RequisitionStatus,   // cast once
        required_date: r.required_date,
        item_count: r.requisition_items?.[0]?.count ?? 0,
        created_at: r.created_at,
      }));
      setRecords(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequisitions();
  }, []);

  const filtered = useMemo(() => {
    let list = [...records];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) =>
        r.req_number.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "req_number": valA = a.req_number; valB = b.req_number; break;
        case "from_store": valA = a.from_store; valB = b.from_store; break;
        case "to_store": valA = a.to_store; valB = b.to_store; break;
        case "item_count": valA = a.item_count; valB = b.item_count; break;
        case "required_date": valA = a.required_date || ""; valB = b.required_date || ""; break;
        case "status": valA = a.status; valB = b.status; break;
        case "created_at": valA = a.created_at; valB = b.created_at; break;
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
        title="Requisitions"
        subtitle="Stage 2 → 3: Material requested from store to production"
        actions={
          <Link href="/requisitions/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Requisition
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Requisition No."
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
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
                        {key === "req_number" ? "Req No." : key === "from_store" ? "From" : key === "to_store" ? "To" : key === "item_count" ? "Items" : key === "required_date" ? "Required Date" : "Status"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">{searchQuery ? "No requisitions match your search" : "No requisitions yet"}</p>
              {!searchQuery && (
                <Link href="/requisitions/new" className="btn-primary mt-4">
                  <Plus className="h-4 w-4" /> Create first requisition
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {visibleColumns.req_number && <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("req_number")}><span className="inline-flex items-center">Req No. {renderSortIcon("req_number")}</span></th>}
                  {visibleColumns.from_store && <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("from_store")}><span className="inline-flex items-center">From {renderSortIcon("from_store")}</span></th>}
                  {visibleColumns.to_store && <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("to_store")}><span className="inline-flex items-center">To {renderSortIcon("to_store")}</span></th>}
                  {visibleColumns.item_count && <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("item_count")}><span className="inline-flex items-center">Items {renderSortIcon("item_count")}</span></th>}
                  {visibleColumns.required_date && <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("required_date")}><span className="inline-flex items-center">Required Date {renderSortIcon("required_date")}</span></th>}
                  {visibleColumns.status && <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("status")}><span className="inline-flex items-center">Status {renderSortIcon("status")}</span></th>}
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.req_number && <td className="table-td font-mono text-xs font-medium text-brand-600">{r.req_number}</td>}
                    {visibleColumns.from_store && <td className="table-td text-xs">{STORE_LABELS[r.from_store as StoreType] || r.from_store}</td>}
                    {visibleColumns.to_store && <td className="table-td text-xs">{STORE_LABELS[r.to_store as StoreType] || r.to_store}</td>}
                    {visibleColumns.item_count && <td className="table-td text-center">{r.item_count}</td>}
                    {visibleColumns.required_date && <td className="table-td">{r.required_date ? formatDate(r.required_date) : "—"}</td>}
                    {visibleColumns.status && <td className="table-td"><span className={cn("badge", REQ_STATUS_COLORS[r.status])}>{r.status}</span></td>}
                    <td className="table-td">
                      <Link href={`/requisitions/${r.id}`} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors">
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
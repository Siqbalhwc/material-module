"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, Truck, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
  const [records, setRecords] = useState<GatePassWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("received_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const supabase = createClient();

  const fetchGatePasses = async () => {
    const { data, error } = await supabase
      .from("inward_gate_passes")
      .select(`
        *,
        suppliers ( name ),
        igp_line_items ( count )
      `)
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
  }, []);

  // Filter & sort
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

  return (
    <>
      <Header
        title="Inward Gate Pass"
        subtitle="Stage 1 → 2: Material received into factory store"
        actions={
          <Link href="/gate-pass/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Gate Pass
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by IGP No., Supplier or Vehicle"
            className="input pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Truck className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery ? "No gate passes match your search" : "No gate passes yet"}
              </p>
              {!searchQuery && (
                <Link href="/gate-pass/new" className="btn-primary mt-4">
                  <Plus className="h-4 w-4" /> Create first gate pass
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {[
                    { label: "IGP No.", field: "igp_number" },
                    { label: "Date", field: "received_date" },
                    { label: "Supplier", field: "supplier_name" },
                    { label: "Vehicle", field: "vehicle_number" },
                    { label: "Items", field: "item_count" },
                    { label: "Status", field: "status" },
                  ].map((col) => (
                    <th
                      key={col.field}
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort(col.field as SortField)}
                    >
                      <span className="inline-flex items-center">
                        {col.label} {renderSortIcon(col.field as SortField)}
                      </span>
                    </th>
                  ))}
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs font-medium text-brand-600">
                      {r.igp_number}
                    </td>
                    <td className="table-td">{formatDate(r.received_date)}</td>
                    <td className="table-td">{r.supplier_name || "—"}</td>
                    <td className="table-td font-mono text-xs">{r.vehicle_number}</td>
                    <td className="table-td text-center">{r.item_count}</td>
                    <td className="table-td">
                      <span className={cn("badge", STATUS_STYLE[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="table-td">
                      <Link
                        href={`/gate-pass/${r.id}`}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors"
                      >
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
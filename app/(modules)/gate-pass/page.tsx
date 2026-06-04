"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, Truck, Eye } from "lucide-react";
import { gatePassApi } from "@/lib/api/client";
import { formatDate, cn } from "@/lib/utils";
import type { InwardGatePass } from "@/types";

const STATUS_STYLE: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  verified: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

export default function GatePassPage() {
  const [records, setRecords] = useState<InwardGatePass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gatePassApi.list()
      .then((r) => setRecords(r.data?.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

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
      <main className="flex-1 p-6">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Truck className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No gate passes yet</p>
              <Link href="/gate-pass/new" className="btn-primary mt-4">
                <Plus className="h-4 w-4" /> Create first gate pass
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["IGP No.", "Date", "Supplier", "Vehicle", "Items", "Status", ""].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs font-medium text-brand-600">{r.igp_number}</td>
                    <td className="table-td">{formatDate(r.received_date)}</td>
                    <td className="table-td">{r.supplier?.name || "—"}</td>
                    <td className="table-td font-mono text-xs">{r.vehicle_number}</td>
                    <td className="table-td text-center">{r.line_items?.length ?? 0}</td>
                    <td className="table-td">
                      <span className={cn("badge", STATUS_STYLE[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="table-td">
                      <Link href={`/gate-pass/${r.id}`}
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

"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, Send, Eye } from "lucide-react";
import { dispatchApi } from "@/lib/api/client";
import { formatDate, cn, DISPATCH_STATUS_COLORS } from "@/lib/utils";
import type { DispatchOrder } from "@/types";

export default function DispatchPage() {
  const [records, setRecords] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dispatchApi.list()
      .then((r) => setRecords(r.data?.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Header
        title="Dispatch"
        subtitle="Stage 5 → 6: Finished goods dispatched to customers"
        actions={
          <Link href="/dispatch/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Dispatch
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Send className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No dispatch orders yet</p>
              <Link href="/dispatch/new" className="btn-primary mt-4">
                <Plus className="h-4 w-4" /> Create dispatch order
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["DO No.", "Customer", "Vehicle", "Delivery Date", "Challan", "Items", "Status", ""].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs font-medium text-brand-600">{r.do_number}</td>
                    <td className="table-td">{r.customer?.name || "—"}</td>
                    <td className="table-td font-mono text-xs">{r.vehicle_number || "—"}</td>
                    <td className="table-td">{r.delivery_date ? formatDate(r.delivery_date) : "—"}</td>
                    <td className="table-td font-mono text-xs">{r.challan_number || "—"}</td>
                    <td className="table-td text-center">{r.items?.length ?? 0}</td>
                    <td className="table-td">
                      <span className={cn("badge", DISPATCH_STATUS_COLORS[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="table-td">
                      <Link href={`/dispatch/${r.id}`}
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

"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, FileText, Eye } from "lucide-react";
import { requisitionApi } from "@/lib/api/client";
import { formatDate, cn, REQ_STATUS_COLORS, STORE_LABELS } from "@/lib/utils";
import type { Requisition } from "@/types";

export default function RequisitionsPage() {
  const [records, setRecords] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    requisitionApi.list()
      .then((r) => setRecords(r.data?.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Header
        title="Requisitions"
        subtitle="Stage 2 → 3: Material issued to production"
        actions={
          <Link href="/requisitions/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Requisition
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No requisitions yet</p>
              <Link href="/requisitions/new" className="btn-primary mt-4">
                <Plus className="h-4 w-4" /> Create requisition
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Req No.", "From", "To", "Items", "Required Date", "Status", ""].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs font-medium text-brand-600">{r.req_number}</td>
                    <td className="table-td text-xs">{STORE_LABELS[r.from_store]}</td>
                    <td className="table-td text-xs">{STORE_LABELS[r.to_store]}</td>
                    <td className="table-td text-center">{r.items?.length ?? 0}</td>
                    <td className="table-td">{r.required_date ? formatDate(r.required_date) : "—"}</td>
                    <td className="table-td">
                      <span className={cn("badge", REQ_STATUS_COLORS[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="table-td">
                      <Link href={`/requisitions/${r.id}`}
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

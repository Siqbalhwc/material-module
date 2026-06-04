"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, Wrench, Eye, PlayCircle } from "lucide-react";
import { wipApi } from "@/lib/api/client";
import { formatDate, cn } from "@/lib/utils";
import type { WIPBatch } from "@/types";

const STATUS_STYLE: Record<string, string> = {
  planned:     "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-700",
  completed:   "bg-green-100 text-green-700",
  on_hold:     "bg-orange-100 text-orange-700",
  cancelled:   "bg-red-100 text-red-600",
};

export default function WIPPage() {
  const [records, setRecords] = useState<WIPBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wipApi.list()
      .then((r) => setRecords(r.data?.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const handleStart = async (id: string) => {
    await wipApi.start(id);
    setRecords((p) => p.map((r) => r.id === id ? { ...r, status: "in_progress" } : r));
  };

  return (
    <>
      <Header
        title="WIP Batches"
        subtitle="Stage 3 → 4: Work in progress tracking"
        actions={
          <Link href="/wip/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Batch
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Wrench className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No WIP batches yet</p>
              <Link href="/wip/new" className="btn-primary mt-4">
                <Plus className="h-4 w-4" /> Create batch
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Batch No.", "Product", "Planned Qty", "Actual Qty", "Started", "Status", ""].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs font-medium text-brand-600">{r.batch_number}</td>
                    <td className="table-td">{r.product?.name || r.product_id}</td>
                    <td className="table-td">{r.planned_qty}</td>
                    <td className="table-td">{r.actual_qty ?? "—"}</td>
                    <td className="table-td">{r.started_at ? formatDate(r.started_at) : "—"}</td>
                    <td className="table-td">
                      <span className={cn("badge", STATUS_STYLE[r.status])}>
                        {r.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        {r.status === "planned" && (
                          <button onClick={() => handleStart(r.id)}
                            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors">
                            <PlayCircle className="h-3.5 w-3.5" /> Start
                          </button>
                        )}
                        <Link href={`/wip/${r.id}`}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors">
                          <Eye className="h-3.5 w-3.5" /> View
                        </Link>
                      </div>
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

"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn, REQ_STATUS_COLORS, STORE_LABELS } from "@/lib/utils";
import type { StoreType, RequisitionStatus } from "@/types";

type RequisitionDetail = {
  id: string;
  req_number: string;
  from_store: StoreType;
  to_store: StoreType;
  status: RequisitionStatus;
  required_date: string | null;
  notes: string | null;
  created_at: string;
  items: {
    id: string;
    product_name: string;
    product_code: string;
    uom: string;
    requested_qty: number;
    batch_number: string | null;
  }[];
};

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [req, setReq] = useState<RequisitionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      try {
        const { data: header, error: headerErr } = await supabase
          .from("requisitions")
          .select("*")
          .eq("id", id)
          .single();
        if (headerErr) throw headerErr;

        const { data: items, error: itemsErr } = await supabase
          .from("requisition_items")
          .select("*, products(code, name)")
          .eq("requisition_id", id);
        if (itemsErr) throw itemsErr;

        setReq({
          id: header.id,
          req_number: header.req_number,
          from_store: header.from_store as StoreType,
          to_store: header.to_store as StoreType,
          status: header.status as RequisitionStatus,
          required_date: header.required_date,
          notes: header.notes,
          created_at: header.created_at,
          items: (items || []).map((it: any) => ({
            id: it.id,
            product_name: it.products?.name ?? "Unknown",
            product_code: it.products?.code ?? "",
            uom: it.uom,
            requested_qty: it.requested_qty,
            batch_number: it.notes,
          })),
        });
      } catch (err: any) {
        setError(err.message || "Failed to load requisition.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading…
      </div>
    );

  if (error || !req)
    return (
      <>
        <Header title="Requisition" />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-gray-400 space-y-2">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">{error || "Not found"}</p>
          <Link href="/requisitions" className="text-sm text-brand-600 hover:underline">
            ← Back
          </Link>
        </main>
      </>
    );

  return (
    <>
      <Header
        title={`Requisition: ${req.req_number}`}
        subtitle={`${STORE_LABELS[req.from_store]} → ${STORE_LABELS[req.to_store]}`}
        actions={
          <Link href="/requisitions" className="btn-secondary inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />
      <main className="flex-1 p-6 max-w-4xl">
        <div className="card p-6 space-y-6">
          <div>
            <span className={cn("badge text-sm", REQ_STATUS_COLORS[req.status])}>
              {req.status}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">From</span>
              <p className="font-medium">{STORE_LABELS[req.from_store]}</p>
            </div>
            <div>
              <span className="text-gray-500">To</span>
              <p className="font-medium">{STORE_LABELS[req.to_store]}</p>
            </div>
            <div>
              <span className="text-gray-500">Required Date</span>
              <p className="font-medium">
                {req.required_date ? formatDate(req.required_date) : "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Created</span>
              <p className="font-medium">{formatDate(req.created_at)}</p>
            </div>
          </div>

          {req.notes && (
            <div>
              <span className="text-gray-500 text-sm">Notes</span>
              <p className="text-sm mt-1">{req.notes}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Requested Items
            </h3>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-left">UOM</th>
                  <th className="px-3 py-2 text-left">Batch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {req.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2 font-medium">
                      {it.product_name}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-brand-600">
                      {it.product_code}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {it.requested_qty}
                    </td>
                    <td className="px-3 py-2 uppercase text-xs">{it.uom}</td>
                    <td className="px-3 py-2">
                      {it.batch_number || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
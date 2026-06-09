"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, Wrench, Eye, CheckCircle, XCircle, Package, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn } from "@/lib/utils";
import type { StoreType } from "@/types";

// WIP Batch type (placeholder)
type WIPBatch = {
  id: string;
  batch_number: string;
  product_id: string;
  product_name?: string;
  planned_qty: number;
  actual_qty?: number;
  status: string;
  started_at?: string;
  created_at: string;
};

// Pending receipt type (issued requisition)
type PendingReceipt = {
  id: string;
  req_number: string;
  required_date: string | null;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    product_code: string;
    uom: string;
    requested_qty: number;
    issued_qty: number | null;
  }[];
};

const BATCH_STATUS_STYLE: Record<string, string> = {
  planned: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-orange-100 text-orange-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function WIPPage() {
  const supabase = createClient();

  // WIP batches
  const [batches, setBatches] = useState<WIPBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);

  // Pending receipts
  const [receipts, setReceipts] = useState<PendingReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);

  // Fetch WIP batches (if table exists)
  const fetchBatches = async () => {
    const { data, error } = await supabase
      .from("wip_batches")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setBatches(data as WIPBatch[]);
    }
    setLoadingBatches(false);
  };

  // Fetch issued requisitions (pending receipts)
  const fetchReceipts = async () => {
    const { data, error } = await supabase
      .from("requisitions")
      .select(`id, req_number, required_date, requisition_items(id, product_id, requested_qty, issued_qty, products(code, name, uom))`)
      .eq("to_store", "wip")
      .eq("status", "issued")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: PendingReceipt[] = data.map((r: any) => ({
        id: r.id,
        req_number: r.req_number,
        required_date: r.required_date,
        items: (r.requisition_items || []).map((it: any) => ({
          id: it.id,
          product_id: it.product_id,
          product_name: it.products?.name ?? "Unknown",
          product_code: it.products?.code ?? "",
          uom: it.uom,
          requested_qty: it.requested_qty,
          issued_qty: it.issued_qty,
        })),
      }));
      setReceipts(mapped);
    }
    setLoadingReceipts(false);
  };

  useEffect(() => {
    fetchBatches();
    fetchReceipts();
  }, []);

  // Verify a receipt
  const handleVerify = async (reqId: string) => {
    setVerifying(reqId);
    try {
      const receipt = receipts.find((r) => r.id === reqId);
      if (!receipt) return;

      // Update requisition status to approved
      const { error: reqErr } = await supabase
        .from("requisitions")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", reqId);
      if (reqErr) throw reqErr;

      // Insert stock ledger entries for WIP (direction +1)
      const ledgerRows = receipt.items.map((it) => ({
        product_id: it.product_id,
        store: "wip" as StoreType,
        txn_type: "received",
        quantity: it.issued_qty ?? it.requested_qty,
        direction: 1,
        reference_type: "requisition",
        reference_id: reqId,
        notes: `Received from Material Store – Req ${receipt.req_number}`,
      }));

      const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
      if (ledgerErr) throw ledgerErr;

      // Remove from pending list
      setReceipts((prev) => prev.filter((r) => r.id !== reqId));
    } catch (err: any) {
      console.error("Verification failed:", err);
      alert("Failed to verify: " + (err.message || "Unknown error"));
    } finally {
      setVerifying(null);
    }
  };

  // Reject a receipt (return to store)
  const handleReject = async (reqId: string) => {
    const reason = prompt("Enter rejection reason:");
    if (reason === null) return; // user cancelled

    setVerifying(reqId);
    try {
      const receipt = receipts.find((r) => r.id === reqId);
      if (!receipt) return;

      // Update requisition status back to submitted
      const { error: reqErr } = await supabase
        .from("requisitions")
        .update({ status: "submitted", issued_at: null, issued_by: null })
        .eq("id", reqId);
      if (reqErr) throw reqErr;

      // Return stock to material_store (direction +1)
      const ledgerRows = receipt.items.map((it) => ({
        product_id: it.product_id,
        store: "material_store" as StoreType,
        txn_type: "returned",
        quantity: it.issued_qty ?? it.requested_qty,
        direction: 1,
        reference_type: "requisition",
        reference_id: reqId,
        notes: `Rejected by WIP: ${reason}. Req ${receipt.req_number}`,
      }));

      const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
      if (ledgerErr) throw ledgerErr;

      // Clear issued_qty in requisition_items
      for (const it of receipt.items) {
        await supabase
          .from("requisition_items")
          .update({ issued_qty: null })
          .eq("id", it.id);
      }

      // Remove from pending list
      setReceipts((prev) => prev.filter((r) => r.id !== reqId));
      alert("Rejected. Stock returned to Material Store. Requisition is now re‑opened for adjustment.");
    } catch (err: any) {
      console.error("Rejection failed:", err);
      alert("Failed to reject: " + (err.message || "Unknown error"));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <>
      <Header
        title="WIP – Production Management"
        subtitle="Verify incoming materials and manage batches"
        actions={
          <Link href="/wip/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Batch
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-8">
        {/* Pending Receipts Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" /> Pending Receipts
            {receipts.length > 0 && (
              <span className="h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {receipts.length}
              </span>
            )}
          </h2>

          {loadingReceipts ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : receipts.length === 0 ? (
            <div className="card p-6 text-center text-sm text-gray-400">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No pending receipts. All issued materials have been verified.
            </div>
          ) : (
            <div className="space-y-4">
              {receipts.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{r.req_number}</p>
                      {r.required_date && (
                        <p className="text-xs text-gray-500">Required by {formatDate(r.required_date)}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVerify(r.id)}
                        disabled={verifying === r.id}
                        className="btn-primary text-xs py-1 px-3 inline-flex items-center gap-1"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        {verifying === r.id ? "Processing…" : "Verify"}
                      </button>
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={verifying === r.id}
                        className="btn-secondary text-xs py-1 px-3 inline-flex items-center gap-1 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>

                  <table className="w-full text-sm border border-gray-100 rounded">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Product</th>
                        <th className="px-2 py-1 text-left">Code</th>
                        <th className="px-2 py-1 text-right">Requested</th>
                        <th className="px-2 py-1 text-right">Issued</th>
                        <th className="px-2 py-1 text-left">UOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {r.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-2 py-1">{it.product_name}</td>
                          <td className="px-2 py-1 font-mono text-xs">{it.product_code}</td>
                          <td className="px-2 py-1 text-right">{it.requested_qty}</td>
                          <td className="px-2 py-1 text-right">{it.issued_qty ?? "—"}</td>
                          <td className="px-2 py-1 uppercase text-xs">{it.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WIP Batches Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Production Batches
          </h2>

          <div className="card overflow-hidden">
            {loadingBatches ? (
              <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
            ) : batches.length === 0 ? (
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
                    <th className="table-th">Batch No.</th>
                    <th className="table-th">Product</th>
                    <th className="table-th">Planned Qty</th>
                    <th className="table-th">Actual Qty</th>
                    <th className="table-th">Started</th>
                    <th className="table-th">Status</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td font-mono text-xs font-medium text-brand-600">{b.batch_number}</td>
                      <td className="table-td">{b.product_name || b.product_id}</td>
                      <td className="table-td">{b.planned_qty}</td>
                      <td className="table-td">{b.actual_qty ?? "—"}</td>
                      <td className="table-td">{b.started_at ? formatDate(b.started_at) : "—"}</td>
                      <td className="table-td">
                        <span className={cn("badge", BATCH_STATUS_STYLE[b.status])}>
                          {b.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="table-td">
                        <Link href={`/wip/${b.id}`}
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
        </div>
      </main>
    </>
  );
}
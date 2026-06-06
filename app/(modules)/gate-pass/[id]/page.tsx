"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { ArrowLeft, Printer, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  verified: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

type GatePassDetail = {
  id: string;
  igp_number: string;
  supplier_name: string | null;
  vehicle_number: string;
  driver_name: string | null;
  received_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  items: {
    id: string;
    product_name: string;
    product_code: string;
    uom: string;
    received_qty: number;
    batch_number: string | null;
  }[];
};

export default function GatePassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [gp, setGp] = useState<GatePassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    (async () => {
      try {
        // Fetch gate pass header + supplier name
        const { data: header, error: headerErr } = await supabase
          .from("inward_gate_passes")
          .select(`*, suppliers(name)`)
          .eq("id", id)
          .single();

        if (headerErr) throw headerErr;

        // Fetch line items with product name/code
        const { data: items, error: itemsErr } = await supabase
          .from("igp_line_items")
          .select(`*, products(code, name)`)
          .eq("igp_id", id);

        if (itemsErr) throw itemsErr;

        setGp({
          id: header.id,
          igp_number: header.igp_number,
          supplier_name: header.suppliers?.name ?? null,
          vehicle_number: header.vehicle_number,
          driver_name: header.driver_name,
          received_date: header.received_date,
          status: header.status,
          notes: header.notes,
          created_at: header.created_at,
          items: (items || []).map((it: any) => ({
            id: it.id,
            product_name: it.products?.name ?? "Unknown",
            product_code: it.products?.code ?? "",
            uom: it.uom,
            received_qty: it.received_qty,
            batch_number: it.batch_number,
          })),
        });
      } catch (err: any) {
        setError(err.message || "Failed to load gate pass.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>
    );
  }

  if (error || !gp) {
    return (
      <>
        <Header title="Gate Pass" />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-gray-400 space-y-2">
          <Truck className="h-10 w-10 opacity-30" />
          <p className="text-sm">{error || "Gate pass not found."}</p>
          <Link href="/gate-pass" className="text-sm text-brand-600 hover:underline">
            ← Back to list
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Header
        title={`Gate Pass: ${gp.igp_number}`}
        subtitle={`Received on ${formatDate(gp.received_date)}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <button onClick={handlePrint} className="btn-secondary inline-flex items-center gap-1">
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
            <Link href="/gate-pass" className="btn-secondary inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </div>
        }
      />
      <main className="flex-1 p-6 max-w-4xl print:max-w-full">
        <div className="card p-6 space-y-6 print:shadow-none print:border-none">
          {/* Header Info */}
          <div className="print:hidden">
            <span className={cn("badge text-sm", STATUS_STYLE[gp.status])}>{gp.status}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Supplier</span>
              <p className="font-medium">{gp.supplier_name || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">Vehicle</span>
              <p className="font-medium">{gp.vehicle_number}</p>
            </div>
            <div>
              <span className="text-gray-500">Driver</span>
              <p className="font-medium">{gp.driver_name || "—"}</p>
            </div>
            <div>
              <span className="text-gray-500">Received Date</span>
              <p className="font-medium">{formatDate(gp.received_date)}</p>
            </div>
          </div>

          {gp.notes && (
            <div>
              <span className="text-gray-500 text-sm">Notes</span>
              <p className="text-sm mt-1">{gp.notes}</p>
            </div>
          )}

          {/* Line Items Table */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Material Received</h3>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden print:border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">Product</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">Code</th>
                  <th className="px-3 py-2 text-right text-gray-600 font-medium">Qty</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">UOM</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">Batch No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gp.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-medium">{item.product_name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-brand-600">{item.product_code}</td>
                    <td className="px-3 py-2 text-right">{item.received_qty}</td>
                    <td className="px-3 py-2 uppercase text-xs">{item.uom}</td>
                    <td className="px-3 py-2">{item.batch_number || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer for print */}
          <div className="hidden print:block text-xs text-gray-500 mt-6 border-t pt-3">
            Printed on {new Date().toLocaleString()}
          </div>
        </div>
      </main>
    </>
  );
}
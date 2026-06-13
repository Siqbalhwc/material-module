"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
  const [companyName, setCompanyName] = useState("MaterialFlow");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    (async () => {
      try {
        const { data: settings } = await supabase
          .from("company_settings")
          .select("company_name, logo_url")
          .limit(1)
          .maybeSingle();
        if (settings) {
          setCompanyName(settings.company_name || "MaterialFlow");
          setLogoUrl(settings.logo_url || null);
        }

        const { data: header, error: headerErr } = await supabase
          .from("inward_gate_passes")
          .select(`*, suppliers(name)`)
          .eq("id", id)
          .single();
        if (headerErr) throw headerErr;

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
      <div className="p-6">
        <main className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-2">
          <Truck className="h-10 w-10 opacity-30" />
          <p className="text-sm">{error || "Gate pass not found."}</p>
          <Link href="/gate-pass" className="text-sm text-brand-600 hover:underline">← Back to list</Link>
        </main>
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px 30px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="p-6 no-print">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inward Gate Pass: {gp.igp_number}</h1>
            <p className="text-sm text-gray-500 mt-1">Received on {formatDate(gp.received_date)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-secondary inline-flex items-center gap-1">
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
            <Link href="/gate-pass" className="btn-secondary inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </div>
        </div>
      </div>

      {/* Print Area */}
      <div className="print-area">
        {/* Company Header */}
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-14 w-14 rounded-lg object-contain" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-green-400">
                <Truck className="h-7 w-7 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{companyName}</h1>
              <p className="text-xs text-gray-500">Inward Gate Pass</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">{gp.igp_number}</p>
            <p className="text-xs text-gray-500">Date: {formatDate(gp.received_date)}</p>
            <span className={cn("inline-block mt-1 text-xs px-2 py-0.5 rounded-full border", STATUS_STYLE[gp.status])}>
              {gp.status}
            </span>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
          <div>
            <span className="text-xs text-gray-500 font-medium">Supplier</span>
            <p className="text-sm font-medium text-gray-900 mt-1">{gp.supplier_name || "—"}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500 font-medium">Vehicle Number</span>
            <p className="text-sm font-medium text-gray-900 mt-1">{gp.vehicle_number}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500 font-medium">Driver Name</span>
            <p className="text-sm font-medium text-gray-900 mt-1">{gp.driver_name || "—"}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500 font-medium">Received Date</span>
            <p className="text-sm font-medium text-gray-900 mt-1">{formatDate(gp.received_date)}</p>
          </div>
        </div>

        {gp.notes && (
          <div className="mb-6">
            <span className="text-xs text-gray-500 font-medium">Notes</span>
            <p className="text-sm text-gray-700 mt-1">{gp.notes}</p>
          </div>
        )}

        {/* Items Table */}
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Material Received</h3>
        <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden mb-6">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Product</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Code</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Qty</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">UOM</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Batch No.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gp.items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 text-xs font-medium text-gray-700">{item.product_name}</td>
                <td className="px-3 py-2 text-xs font-medium font-mono text-brand-600">{item.product_code}</td>
                <td className="px-3 py-2 text-xs font-medium text-gray-700 text-right">{item.received_qty.toFixed(2)}</td>
                <td className="px-3 py-2 text-xs font-medium text-gray-700 uppercase">{item.uom}</td>
                <td className="px-3 py-2 text-xs font-medium text-gray-700">{item.batch_number || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div className="text-xs text-gray-500 border-t pt-3 mt-8">
          <p>Printed on {new Date().toLocaleString()}</p>
          <p className="mt-1">This is a computer‑generated document.</p>
        </div>
      </div>

      {/* Screen view (non‑print) */}
      <div className="px-6 no-print">
        <div className="card p-6 space-y-6 max-w-4xl">
          <div>
            <span className={cn("badge text-sm", STATUS_STYLE[gp.status])}>{gp.status}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-xs text-gray-500 font-medium">Supplier</span><p className="text-sm font-medium text-gray-900 mt-1">{gp.supplier_name || "—"}</p></div>
            <div><span className="text-xs text-gray-500 font-medium">Vehicle Number</span><p className="text-sm font-medium text-gray-900 mt-1">{gp.vehicle_number}</p></div>
            <div><span className="text-xs text-gray-500 font-medium">Driver Name</span><p className="text-sm font-medium text-gray-900 mt-1">{gp.driver_name || "—"}</p></div>
            <div><span className="text-xs text-gray-500 font-medium">Received Date</span><p className="text-sm font-medium text-gray-900 mt-1">{formatDate(gp.received_date)}</p></div>
          </div>

          {gp.notes && (
            <div><span className="text-xs text-gray-500 font-medium">Notes</span><p className="text-sm text-gray-700 mt-1">{gp.notes}</p></div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Material Received</h3>
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Product</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Code</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Qty</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">UOM</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Batch No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gp.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700">{item.product_name}</td>
                    <td className="px-3 py-2 text-xs font-medium font-mono text-brand-600">{item.product_code}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 text-right">{item.received_qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 uppercase">{item.uom}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700">{item.batch_number || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
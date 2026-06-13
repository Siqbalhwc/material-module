"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
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
        // Fetch company settings
        const { data: settings } = await supabase
          .from("company_settings")
          .select("company_name, logo_url")
          .limit(1)
          .maybeSingle();
        if (settings) {
          setCompanyName(settings.company_name || "MaterialFlow");
          setLogoUrl(settings.logo_url || null);
        }

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
      <div className="p-6">
        <PageHeader title="Gate Pass" />
        <main className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-2">
          <Truck className="h-10 w-10 opacity-30" />
          <p className="text-sm">{error || "Gate pass not found."}</p>
          <Link href="/gate-pass" className="text-sm text-brand-600 hover:underline">
            ← Back to list
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title={`Inward Gate Pass: ${gp.igp_number}`}
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

      {/* Print‑only header */}
      <div className="hidden print:block mb-6">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-lg object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-400">
                <Truck className="h-6 w-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{companyName}</h1>
              <p className="text-xs text-gray-500">Inward Gate Pass</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">{gp.igp_number}</p>
            <p className="text-xs text-gray-500">Date: {formatDate(gp.received_date)}</p>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-6 print:shadow-none print:border-none">
        {/* Status badge */}
        <div className="print:hidden">
          <span className={cn("badge text-sm", STATUS_STYLE[gp.status])}>{gp.status}</span>
        </div>

        {/* Header info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
          <div>
            <span className="text-xs text-gray-500 font-medium">Notes</span>
            <p className="text-sm text-gray-700 mt-1">{gp.notes}</p>
          </div>
        )}

        {/* Line Items Table */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Material Received</h3>
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden print:border-gray-300">
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

        {/* Footer for print */}
        <div className="hidden print:block text-xs text-gray-500 mt-6 border-t pt-3">
          <p>Printed on {new Date().toLocaleString()}</p>
          <p className="mt-1">This is a computer‑generated document.</p>
        </div>
      </div>
    </div>
  );
}
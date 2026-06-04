"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import { Plus, Package, CheckCircle } from "lucide-react";
import { fgApi } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";

export default function FinishedGoodsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: "", quantity: "", uom: "units", qc_passed: true, qc_notes: "", batch_id: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fgApi.list()
      .then((r) => setRecords(r.data?.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fgApi.transfer({ ...form, quantity: parseFloat(form.quantity) });
      setRecords((p) => [res.data?.data, ...p]);
      setShowForm(false);
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <Header
        title="Finished Goods"
        subtitle="Stage 4 → 5: QC-passed goods transferred from WIP"
        actions={
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> Record Transfer
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        {showForm && (
          <div className="card p-6 max-w-xl">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">FG Transfer from WIP</h2>
            <form onSubmit={handleTransfer} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Product *</label>
                <input className="input" required placeholder="Product ID"
                  value={form.product_id} onChange={(e) => setForm((p) => ({ ...p, product_id: e.target.value }))} />
              </div>
              <div>
                <label className="label">Quantity *</label>
                <input className="input" type="number" step="0.001" min="0" required
                  value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="label">UOM</label>
                <select className="input" value={form.uom}
                  onChange={(e) => setForm((p) => ({ ...p, uom: e.target.value }))}>
                  {["kg", "bags", "litres", "units", "pcs"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">WIP Batch ID</label>
                <input className="input" placeholder="Optional"
                  value={form.batch_id} onChange={(e) => setForm((p) => ({ ...p, batch_id: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="qc" className="rounded"
                  checked={form.qc_passed} onChange={(e) => setForm((p) => ({ ...p, qc_passed: e.target.checked }))} />
                <label htmlFor="qc" className="text-sm text-gray-700">QC Passed</label>
              </div>
              <div className="col-span-2">
                <label className="label">QC Notes</label>
                <input className="input" placeholder="Optional"
                  value={form.qc_notes} onChange={(e) => setForm((p) => ({ ...p, qc_notes: e.target.value }))} />
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Record Transfer"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Package className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No finished goods transfers yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Ref No.", "Product", "Quantity", "QC", "QC Notes", "Date"].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs text-brand-600">{r.ref_number}</td>
                    <td className="table-td">{r.product?.name || r.product_id}</td>
                    <td className="table-td">{r.quantity} {r.uom}</td>
                    <td className="table-td">
                      {r.qc_passed
                        ? <CheckCircle className="h-4 w-4 text-green-500" />
                        : <span className="text-xs text-red-500">Failed</span>}
                    </td>
                    <td className="table-td text-xs text-gray-400">{r.qc_notes || "—"}</td>
                    <td className="table-td">{formatDate(r.transferred_at || r.created_at)}</td>
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

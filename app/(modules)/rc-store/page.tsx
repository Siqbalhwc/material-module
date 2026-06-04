"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import { Plus, RotateCcw } from "lucide-react";
import { rcApi } from "@/lib/api/client";
import { formatDate, cn } from "@/lib/utils";

const DIR_STYLE: Record<string, string> = {
  return_from_wip: "bg-orange-100 text-orange-700",
  issue_to_wip:    "bg-blue-100 text-blue-700",
};

export default function RCStorePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: "", quantity: "", direction: "return_from_wip", reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    rcApi.list()
      .then((r) => setRecords(r.data?.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await rcApi.create({ ...form, quantity: parseFloat(form.quantity) });
      setRecords((p) => [res.data?.data, ...p]);
      setShowForm(false);
      setForm({ product_id: "", quantity: "", direction: "return_from_wip", reason: "" });
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <Header
        title="RC Store"
        subtitle="Stage 4 ↔ WIP: Returnable component movements"
        actions={
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> Record Movement
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        {showForm && (
          <div className="card p-6 max-w-xl">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">New RC Movement</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Product (RC Component) *</label>
                <input className="input" required placeholder="Product ID"
                  value={form.product_id} onChange={(e) => setForm((p) => ({ ...p, product_id: e.target.value }))} />
              </div>
              <div>
                <label className="label">Quantity *</label>
                <input className="input" type="number" step="0.001" min="0" required placeholder="0.00"
                  value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="label">Direction *</label>
                <select className="input" value={form.direction}
                  onChange={(e) => setForm((p) => ({ ...p, direction: e.target.value }))}>
                  <option value="return_from_wip">Return from WIP</option>
                  <option value="issue_to_wip">Issue to WIP</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Reason</label>
                <input className="input" placeholder="Optional reason"
                  value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save Movement"}
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
              <RotateCcw className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No RC movements yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Ref No.", "Product", "Direction", "Quantity", "Reason", "Date"].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs text-brand-600">{r.ref_number}</td>
                    <td className="table-td">{r.product?.name || r.product_id}</td>
                    <td className="table-td">
                      <span className={cn("badge", DIR_STYLE[r.direction])}>
                        {r.direction === "return_from_wip" ? "← Return from WIP" : "→ Issue to WIP"}
                      </span>
                    </td>
                    <td className="table-td">{r.quantity} {r.uom}</td>
                    <td className="table-td text-gray-400 text-xs">{r.reason || "—"}</td>
                    <td className="table-td">{formatDate(r.created_at)}</td>
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

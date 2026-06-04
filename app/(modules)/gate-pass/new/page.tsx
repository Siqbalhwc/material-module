"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { gatePassApi } from "@/lib/api/client";
import Link from "next/link";

interface LineItem {
  product_id: string;
  received_qty: string;
  uom: string;
  batch_number: string;
}

export default function NewGatePassPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    vehicle_number: "",
    driver_name: "",
    received_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [items, setItems] = useState<LineItem[]>([
    { product_id: "", received_qty: "", uom: "kg", batch_number: "" },
  ]);

  const addItem = () =>
    setItems((p) => [...p, { product_id: "", received_qty: "", uom: "kg", batch_number: "" }]);

  const removeItem = (i: number) =>
    setItems((p) => p.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof LineItem, val: string) =>
    setItems((p) => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await gatePassApi.create({
        ...form,
        line_items: items.map((it) => ({
          ...it,
          received_qty: parseFloat(it.received_qty),
        })),
      });
      router.push("/gate-pass");
    } catch {
      setError("Failed to save gate pass. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header
        title="New Inward Gate Pass"
        subtitle="Record incoming material at the factory gate"
        actions={
          <Link href="/gate-pass" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />
      <main className="flex-1 p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Header fields */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Gate Pass Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Vehicle Number *</label>
                <input className="input" required placeholder="e.g. ABC-1234"
                  value={form.vehicle_number}
                  onChange={(e) => setForm((p) => ({ ...p, vehicle_number: e.target.value }))} />
              </div>
              <div>
                <label className="label">Received Date *</label>
                <input className="input" type="date" required
                  value={form.received_date}
                  onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Driver Name</label>
                <input className="input" placeholder="Optional"
                  value={form.driver_name}
                  onChange={(e) => setForm((p) => ({ ...p, driver_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" placeholder="Optional remarks"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Material Items</h2>
              <button type="button" onClick={addItem} className="btn-secondary text-xs py-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    {i === 0 && <label className="label">Product / Material</label>}
                    <input className="input" required placeholder="Product ID or name"
                      value={item.product_id}
                      onChange={(e) => updateItem(i, "product_id", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="label">Qty Received</label>}
                    <input className="input" type="number" step="0.001" required min="0" placeholder="0.00"
                      value={item.received_qty}
                      onChange={(e) => updateItem(i, "received_qty", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="label">UOM</label>}
                    <select className="input" value={item.uom}
                      onChange={(e) => updateItem(i, "uom", e.target.value)}>
                      {["kg", "bags", "litres", "units", "metres", "pcs"].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <label className="label">Batch No.</label>}
                    <input className="input" placeholder="Optional"
                      value={item.batch_number}
                      onChange={(e) => updateItem(i, "batch_number", e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)}
                        className="rounded-lg p-2 text-red-400 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/gate-pass" className="btn-secondary">Cancel</Link>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save Gate Pass"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

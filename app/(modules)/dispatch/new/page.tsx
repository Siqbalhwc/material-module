"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { dispatchApi } from "@/lib/api/client";
import Link from "next/link";

interface DispatchItem {
  product_id: string;
  quantity: string;
  uom: string;
  batch_number: string;
}

export default function NewDispatchPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    customer_id: "",
    vehicle_number: "",
    driver_name: "",
    transporter: "",
    delivery_date: "",
    challan_number: "",
    invoice_number: "",
    notes: "",
  });

  const [items, setItems] = useState<DispatchItem[]>([
    { product_id: "", quantity: "", uom: "units", batch_number: "" },
  ]);

  const addItem = () =>
    setItems((p) => [...p, { product_id: "", quantity: "", uom: "units", batch_number: "" }]);

  const removeItem = (i: number) =>
    setItems((p) => p.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof DispatchItem, val: string) =>
    setItems((p) => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await dispatchApi.create({
        ...form,
        items: items.map((it) => ({ ...it, quantity: parseFloat(it.quantity) })),
      });
      router.push("/dispatch");
    } catch {
      setError("Failed to create dispatch order. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header
        title="New Dispatch Order"
        subtitle="Stage 5 → 6: Dispatch finished goods to customer"
        actions={
          <Link href="/dispatch" className="btn-secondary">
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

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Dispatch Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Customer ID</label>
                <input className="input" placeholder="Customer ID"
                  value={form.customer_id}
                  onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))} />
              </div>
              <div>
                <label className="label">Delivery Date</label>
                <input className="input" type="date"
                  value={form.delivery_date}
                  onChange={(e) => setForm((p) => ({ ...p, delivery_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Vehicle Number</label>
                <input className="input" placeholder="e.g. ABC-1234"
                  value={form.vehicle_number}
                  onChange={(e) => setForm((p) => ({ ...p, vehicle_number: e.target.value }))} />
              </div>
              <div>
                <label className="label">Transporter</label>
                <input className="input" placeholder="Transporter name"
                  value={form.transporter}
                  onChange={(e) => setForm((p) => ({ ...p, transporter: e.target.value }))} />
              </div>
              <div>
                <label className="label">Challan Number</label>
                <input className="input" placeholder="e.g. CH-0001"
                  value={form.challan_number}
                  onChange={(e) => setForm((p) => ({ ...p, challan_number: e.target.value }))} />
              </div>
              <div>
                <label className="label">Invoice Number</label>
                <input className="input" placeholder="e.g. INV-0001"
                  value={form.invoice_number}
                  onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <input className="input" placeholder="Optional"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Items to Dispatch</h2>
              <button type="button" onClick={addItem} className="btn-secondary text-xs py-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    {i === 0 && <label className="label">Product</label>}
                    <input className="input" required placeholder="Product ID"
                      value={item.product_id}
                      onChange={(e) => updateItem(i, "product_id", e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <label className="label">Quantity</label>}
                    <input className="input" type="number" step="0.001" min="0" required
                      value={item.quantity}
                      onChange={(e) => updateItem(i, "quantity", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="label">UOM</label>}
                    <select className="input" value={item.uom}
                      onChange={(e) => updateItem(i, "uom", e.target.value)}>
                      {["kg", "bags", "litres", "units", "pcs"].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
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
            <Link href="/dispatch" className="btn-secondary">Cancel</Link>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create Dispatch Order"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

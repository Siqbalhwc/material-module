"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { Plus, Trash2, ArrowLeft, Save, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Product } from "@/types";

interface LineItem {
  product_id: string;
  category: string;   // per‑item category
  uom: string;
  requested_qty: string;
  batch_number: string;
}

export default function NewRequisitionPage() {
  const router = useRouter();
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    from_store: "material_store",
    to_store: "wip",
    required_date: "",
    notes: "",
  });

  const [items, setItems] = useState<LineItem[]>([
    { product_id: "", category: "", uom: "kg", requested_qty: "", batch_number: "" },
  ]);

  useEffect(() => {
    supabase.from("products").select("*").eq("is_active", true).then(({ data }) => setProducts(data || []));
  }, []);

  const addItem = () =>
    setItems((prev) => [...prev, { product_id: "", category: "", uom: "kg", requested_qty: "", batch_number: "" }]);

  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof LineItem, val: string) => {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const updated = { ...it, [field]: val };
        if (field === "product_id") {
          const prod = products.find((p) => p.id === val);
          if (prod) {
            updated.uom = prod.uom;
            updated.category = prod.category;
          } else {
            updated.uom = "kg";
            updated.category = "";
          }
        }
        if (field === "category") {
          updated.product_id = "";
        }
        return updated;
      })
    );
  };

  const getFilteredProducts = (category: string) =>
    category ? products.filter((p) => p.category === category) : [];

  const handleSubmit = async (status: "draft" | "submitted") => {
    setError("");
    if (!form.from_store || !form.to_store) {
      setError("Please select both stores.");
      return;
    }
    if (items.some((it) => !it.product_id || !it.requested_qty)) {
      setError("Please fill all product items with quantity.");
      return;
    }
    setLoading(true);
    try {
      const { data: req, error: reqErr } = await supabase
        .from("requisitions")
        .insert({
          from_store: form.from_store,
          to_store: form.to_store,
          status,
          required_date: form.required_date || null,
          notes: form.notes || null,
        })
        .select()
        .single();

      if (reqErr) throw reqErr;

      const lineItemsPayload = items.map((it) => ({
        requisition_id: req.id,
        product_id: it.product_id,
        requested_qty: parseFloat(it.requested_qty),
        uom: it.uom,
        notes: it.batch_number || null, // using notes field for batch
      }));

      const { error: lineErr } = await supabase.from("requisition_items").insert(lineItemsPayload);
      if (lineErr) throw lineErr;

      router.push("/requisitions");
    } catch (err: any) {
      console.error("Save requisition failed:", err);
      setError(err.message || "Failed to save requisition.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header
        title="New Requisition"
        subtitle="Request materials from store for production"
        actions={
          <Link href="/requisitions" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Request Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">From Store *</label>
                <select className="input" value={form.from_store} onChange={(e) => setForm((p) => ({ ...p, from_store: e.target.value }))}>
                  <option value="material_store">Material Store</option>
                  <option value="wip">WIP</option>
                  <option value="rc_store">RC Store</option>
                  <option value="finished_goods">Finished Goods</option>
                </select>
              </div>
              <div>
                <label className="label">To Store *</label>
                <select className="input" value={form.to_store} onChange={(e) => setForm((p) => ({ ...p, to_store: e.target.value }))}>
                  <option value="wip">WIP</option>
                  <option value="material_store">Material Store</option>
                  <option value="rc_store">RC Store</option>
                  <option value="finished_goods">Finished Goods</option>
                </select>
              </div>
              <div>
                <label className="label">Required Date</label>
                <input type="date" className="input" value={form.required_date} onChange={(e) => setForm((p) => ({ ...p, required_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" placeholder="Optional" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Material Items</h2>
              <button type="button" onClick={addItem} className="btn-secondary text-xs py-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">Item {i + 1}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:bg-red-50 p-1 rounded">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                    <div className="md:col-span-2">
                      <label className="label">Category *</label>
                      <select
                        className="input"
                        value={item.category}
                        onChange={(e) => updateItem(i, "category", e.target.value)}
                      >
                        <option value="">-- Select --</option>
                        <option value="Raw Material">Raw Material</option>
                        <option value="Chemical">Chemical</option>
                        <option value="Store / Consumable">Store / Consumable</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="label">Product *</label>
                      <select
                        className="input"
                        value={item.product_id}
                        onChange={(e) => updateItem(i, "product_id", e.target.value)}
                        disabled={!item.category}
                      >
                        <option value="">-- Select Product --</option>
                        {getFilteredProducts(item.category).map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.uom})</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Quantity</label>
                      <input
                        type="number" step="0.001" min="0" className="input" required
                        placeholder="0.00"
                        value={item.requested_qty}
                        onChange={(e) => updateItem(i, "requested_qty", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">UOM</label>
                      <input className="input bg-gray-50" readOnly value={item.uom} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Batch No.</label>
                      <input className="input" placeholder="Optional" value={item.batch_number}
                        onChange={(e) => updateItem(i, "batch_number", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/requisitions" className="btn-secondary">Cancel</Link>
            <button type="button" disabled={loading} onClick={() => handleSubmit("draft")} className="btn-secondary inline-flex items-center gap-1">
              <Save className="h-4 w-4" /> Save Draft
            </button>
            <button type="button" disabled={loading} onClick={() => handleSubmit("submitted")} className="btn-primary inline-flex items-center gap-1">
              <Send className="h-4 w-4" /> Submit
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
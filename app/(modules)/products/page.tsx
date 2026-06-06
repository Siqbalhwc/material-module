"use client";
import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import { Plus, ShoppingBag, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    uom: "kg",
    is_rc: false,
    reorder_level: "0",
  });

  const supabase = createClient();

  // Fetch products from Supabase
  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch products:", error);
    }
    setProducts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .insert([
          {
            code: form.code,
            name: form.name,
            category: form.category,
            uom: form.uom,
            is_rc: form.is_rc,
            reorder_level: parseFloat(form.reorder_level),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      setProducts((prev) => [data as Product, ...prev]);
      setShowForm(false);
      setForm({
        code: "",
        name: "",
        category: "",
        uom: "kg",
        is_rc: false,
        reorder_level: "0",
      });
    } catch (err: any) {
      console.error("Create product failed:", err);
      alert("Failed to create product: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header
        title="Products"
        subtitle="Master list — raw materials, chemicals and RC components"
        actions={
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> Add Product
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        {showForm && (
          <div className="card p-6 max-w-2xl">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">New Product</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Code *</label>
                <input
                  className="input"
                  required
                  placeholder="e.g. PPD-001"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Name *</label>
                <input
                  className="input"
                  required
                  placeholder="Product name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Category *</label>
                <input
                  className="input"
                  required
                  placeholder="e.g. Raw Material"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">UOM *</label>
                <select
                  className="input"
                  value={form.uom}
                  onChange={(e) => setForm((p) => ({ ...p, uom: e.target.value }))}
                >
                  {["kg", "bags", "litres", "units", "metres", "pcs"].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Reorder Level</label>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  min="0"
                  value={form.reorder_level}
                  onChange={(e) => setForm((p) => ({ ...p, reorder_level: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="is_rc"
                  className="rounded"
                  checked={form.is_rc}
                  onChange={(e) => setForm((p) => ({ ...p, is_rc: e.target.checked }))}
                />
                <label htmlFor="is_rc" className="text-sm text-gray-700">
                  Returnable Component (RC)
                </label>
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              Loading…
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No products yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Code", "Name", "Category", "UOM", "Reorder Level", "RC", "Status"].map(
                    (h) => (
                      <th key={h} className="table-th">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-mono text-xs font-medium text-brand-600">
                      {p.code}
                    </td>
                    <td className="table-td font-medium">{p.name}</td>
                    <td className="table-td text-gray-500">{p.category}</td>
                    <td className="table-td text-xs uppercase">{p.uom}</td>
                    <td className="table-td">{p.reorder_level}</td>
                    <td className="table-td">
                      {p.is_rc && (
                        <span className="inline-flex items-center gap-1 text-xs text-purple-600">
                          <RotateCcw className="h-3 w-3" /> RC
                        </span>
                      )}
                    </td>
                    <td className="table-td">
                      <span
                        className={cn(
                          "badge",
                          p.is_active
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-100 text-gray-400"
                        )}
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
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
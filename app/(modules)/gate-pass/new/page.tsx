"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { Plus, Trash2, ArrowLeft, Save, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Product, Supplier } from "@/types";

interface LineItem {
  product_id: string;
  product_name?: string;
  category?: string;
  uom: string;
  conversion_kg?: number;    // from product master
  bags: string;              // number of bags (only for bag items)
  received_qty: string;      // total kg/litres/units
  batch_number: string;
}

export default function NewGatePassPage() {
  const router = useRouter();
  const supabase = createClient();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories] = useState(["Raw Material", "Chemical", "Store / Consumable"]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    supplier_id: "",
    vehicle_number: "",
    driver_name: "",
    received_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [items, setItems] = useState<LineItem[]>([
    { product_id: "", uom: "kg", bags: "", received_qty: "", batch_number: "" },
  ]);

  // Fetch suppliers & all products on mount
  useEffect(() => {
    (async () => {
      const { data: supp } = await supabase.from("suppliers").select("*").eq("is_active", true);
      setSuppliers(supp || []);
      const { data: prod } = await supabase.from("products").select("*").eq("is_active", true);
      setProducts(prod || []);
    })();
  }, []);

  // Filter products by selected category
  const filteredProducts = selectedCategory
    ? products.filter((p) => p.category === selectedCategory)
    : [];

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { product_id: "", uom: "kg", bags: "", received_qty: "", batch_number: "" },
    ]);

  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof LineItem, val: string) => {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;

        const updated = { ...it, [field]: val };

        // When product changes, auto-fill uom and conversion_kg
        if (field === "product_id") {
          const prod = products.find((p) => p.id === val);
          if (prod) {
            updated.uom = prod.uom;
            updated.conversion_kg = prod.conversion_kg;
            updated.product_name = prod.name;
            updated.category = prod.category;
            // Reset quantities
            updated.bags = "";
            updated.received_qty = "";
          }
        }

        // When bags changes, auto-calculate received_qty
        if (field === "bags" && updated.uom === "bags" && updated.conversion_kg) {
          const bags = parseFloat(val);
          if (!isNaN(bags)) {
            updated.received_qty = (bags * updated.conversion_kg).toFixed(3);
          } else {
            updated.received_qty = "";
          }
        }

        return updated;
      })
    );
  };

  const handleSave = async (status: "draft" | "verified") => {
    setError("");
    if (!form.supplier_id) {
      setError("Please select a supplier.");
      return;
    }
    if (!form.vehicle_number) {
      setError("Vehicle number is required.");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.product_id || !it.received_qty)) {
      setError("Please fill all product items with quantity.");
      return;
    }

    setLoading(true);
    try {
      // 1. Insert gate pass header
      const { data: gp, error: gpErr } = await supabase
        .from("inward_gate_passes")
        .insert({
          supplier_id: form.supplier_id || null,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name || null,
          received_date: form.received_date,
          notes: form.notes || null,
          status: status,
        })
        .select()
        .single();

      if (gpErr) throw gpErr;

      // 2. Insert line items
      const lineItemsPayload = items.map((it) => ({
        igp_id: gp.id,
        product_id: it.product_id,
        received_qty: parseFloat(it.received_qty),
        uom: it.uom,
        batch_number: it.batch_number || null,
      }));

      const { error: lineErr } = await supabase.from("igp_line_items").insert(lineItemsPayload);
      if (lineErr) throw lineErr;

      // 3. If verified, insert stock ledger entries
      if (status === "verified") {
        const ledgerPayload = items.map((it) => ({
          product_id: it.product_id,
          store: "material_store",
          txn_type: "received",
          quantity: parseFloat(it.received_qty),
          direction: 1,
          reference_type: "gate_pass",
          reference_id: gp.id,
          notes: `IGP ${gp.igp_number}`,
        }));

        const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerPayload);
        if (ledgerErr) throw ledgerErr;
      }

      router.push("/gate-pass");
    } catch (err: any) {
      console.error("Save gate pass failed:", err);
      setError(err.message || "Failed to save gate pass.");
    } finally {
      setLoading(false);
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
      <main className="flex-1 p-6 max-w-4xl">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="space-y-6"
        >
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
                <label className="label">Supplier *</label>
                <select
                  className="input"
                  required
                  value={form.supplier_id}
                  onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value }))}
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {suppliers.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    No suppliers found. Add one via SQL or the Suppliers page.
                  </p>
                )}
              </div>
              <div>
                <label className="label">Vehicle Number *</label>
                <input
                  className="input"
                  required
                  placeholder="e.g. ABC-1234"
                  value={form.vehicle_number}
                  onChange={(e) => setForm((p) => ({ ...p, vehicle_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Received Date *</label>
                <input
                  className="input"
                  type="date"
                  required
                  value={form.received_date}
                  onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Driver Name</label>
                <input
                  className="input"
                  placeholder="Optional"
                  value={form.driver_name}
                  onChange={(e) => setForm((p) => ({ ...p, driver_name: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <input
                  className="input"
                  placeholder="Optional remarks"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
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

            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Item {i + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-red-400 hover:bg-red-50 p-1 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Category dropdown (global for all items? individual? We'll keep it as a filter above the product) */}
                  {/* For simplicity, we'll select category first, then product */}
                  <div className="grid grid-cols-12 gap-2 items-end">
                    {/* Category */}
                    <div className="col-span-3">
                      <label className="label">Category *</label>
                      <select
                        className="input"
                        value={item.category || ""}
                        onChange={(e) => {
                          const cat = e.target.value;
                          // Reset product when category changes
                          updateItem(i, "product_id", "");
                          setSelectedCategory(cat);
                          // Update local category field
                          setItems((prev) =>
                            prev.map((it, idx) =>
                              idx === i ? { ...it, category: cat } : it
                            )
                          );
                        }}
                      >
                        <option value="">-- Select --</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Product */}
                    <div className="col-span-4">
                      <label className="label">Product *</label>
                      <select
                        className="input"
                        value={item.product_id}
                        onChange={(e) => updateItem(i, "product_id", e.target.value)}
                        disabled={!item.category}
                      >
                        <option value="">-- Select Product --</option>
                        {filteredProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.uom})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Bags (only if uom = bags) */}
                    {item.uom === "bags" && (
                      <div className="col-span-2">
                        <label className="label">Bags</label>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={item.bags}
                          onChange={(e) => updateItem(i, "bags", e.target.value)}
                        />
                      </div>
                    )}

                    {/* Quantity (kg/litres/units) */}
                    <div className={item.uom === "bags" ? "col-span-2" : "col-span-3"}>
                      <label className="label">
                        {item.uom === "bags" ? "Total Kg" : item.uom === "kg" ? "Kg" : item.uom}
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.001"
                        min="0"
                        required
                        placeholder="0.00"
                        value={item.received_qty}
                        onChange={(e) => updateItem(i, "received_qty", e.target.value)}
                      />
                    </div>

                    {/* Batch number */}
                    <div className="col-span-2">
                      <label className="label">Batch No.</label>
                      <input
                        className="input"
                        placeholder="Optional"
                        value={item.batch_number}
                        onChange={(e) => updateItem(i, "batch_number", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link href="/gate-pass" className="btn-secondary">
              Cancel
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave("draft")}
              className="btn-secondary inline-flex items-center gap-1"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave("verified")}
              className="btn-primary inline-flex items-center gap-1"
            >
              <CheckCircle className="h-4 w-4" />
              Verify & Receive
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
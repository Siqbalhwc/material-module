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
  category: string;
  uom: string;
  conversion_kg?: number;
  bags: string;
  received_qty: string;
  batch_number: string;
}

export default function NewGatePassPage() {
  const router = useRouter();
  const supabase = createClient();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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
    {
      product_id: "",
      category: "",
      uom: "kg",
      bags: "",
      received_qty: "",
      batch_number: "",
    },
  ]);

  // Fetch suppliers & products once
  useEffect(() => {
    (async () => {
      const { data: supp } = await supabase.from("suppliers").select("*").eq("is_active", true);
      setSuppliers(supp || []);
      const { data: prod } = await supabase.from("products").select("*").eq("is_active", true);
      setProducts(prod || []);
    })();
  }, []);

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { product_id: "", category: "", uom: "kg", bags: "", received_qty: "", batch_number: "" },
    ]);

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
            updated.conversion_kg = prod.conversion_kg;
            updated.product_name = prod.name;
            updated.category = prod.category;
            updated.bags = "";
            updated.received_qty = "";
          } else {
            updated.uom = "kg";
            updated.conversion_kg = undefined;
            updated.product_name = undefined;
          }
        }

        if (field === "bags" && updated.uom === "bags" && updated.conversion_kg) {
          const bags = parseFloat(val);
          if (!isNaN(bags)) {
            updated.received_qty = (bags * updated.conversion_kg).toFixed(3);
          } else {
            updated.received_qty = "";
          }
        }

        if (field === "category") {
          updated.product_id = "";
          updated.product_name = undefined;
        }

        return updated;
      })
    );
  };

  const getFilteredProducts = (category: string) => {
    if (!category) return [];
    return products.filter((p) => p.category === category);
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

      // 3. If verified, insert stock ledger entries – now with correct store per category
      if (status === "verified") {
        const ledgerPayload = items.map((it) => {
          // Determine target store: "Store / Consumable" -> parts_store, else material_store
          const targetStore = it.category === "Store / Consumable" ? "parts_store" : "material_store";
          return {
            product_id: it.product_id,
            store: targetStore,
            txn_type: "received",
            quantity: parseFloat(it.received_qty),
            direction: 1,
            reference_type: "gate_pass",
            reference_id: gp.id,
            notes: `IGP ${gp.igp_number}`,
          };
        });

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
      <main className="flex-1 p-6">
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Gate Pass Details */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Gate Pass Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="md:col-span-2">
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

          {/* Line Items */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Material Items</h2>
              <button type="button" onClick={addItem} className="btn-secondary text-xs py-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, i) => {
                const productOptions = getFilteredProducts(item.category);
                return (
                  <div key={i} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
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

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                      {/* Category */}
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

                      {/* Product */}
                      <div className="md:col-span-3">
                        <label className="label">Product *</label>
                        <select
                          className="input"
                          value={item.product_id}
                          onChange={(e) => updateItem(i, "product_id", e.target.value)}
                          disabled={!item.category}
                        >
                          <option value="">-- Select Product --</option>
                          {productOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.uom})
                            </option>
                          ))}
                        </select>
                      </div>

                      {item.uom === "bags" && (
                        <div className="md:col-span-1">
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

                      <div className={item.uom === "bags" ? "md:col-span-2" : "md:col-span-3"}>
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

                      <div className="md:col-span-2">
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
                );
              })}
            </div>
          </div>

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
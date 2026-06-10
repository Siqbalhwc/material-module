"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { Plus, Trash2, ArrowLeft, Save, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Customer } from "@/types";

interface LineItem {
  product_id: string;
  product_name?: string;
  uom: string;
  conversion_kg?: number;
  bags: string;
  dispatched_qty: string;
  batch_number: string;
  available: number;          // available stock in finished goods store
}

export default function NewOutwardGatePassPage() {
  const router = useRouter();
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<any[]>([]);   // products with balance
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    customer_id: "",
    vehicle_number: "",
    driver_name: "",
    dispatch_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [items, setItems] = useState<LineItem[]>([
    { product_id: "", uom: "kg", bags: "", dispatched_qty: "", batch_number: "", available: 0 },
  ]);

  // Fetch customers and finished goods with available stock
  useEffect(() => {
    (async () => {
      const { data: cust } = await supabase.from("customers").select("*").eq("is_active", true);
      setCustomers(cust || []);

      // Get finished goods that have stock in finished_goods store
      const { data: stockData } = await supabase
        .from("stock_balance")
        .select("product_id, balance, products( id, code, name, uom, conversion_kg )")
        .eq("store", "finished_goods");

      if (stockData) {
        const productsList = stockData
          .filter((row: any) => row.products && row.balance > 0)   // only those with stock
          .map((row: any) => ({
            ...row.products,
            balance: row.balance,
          }));
        setFinishedGoods(productsList);
      }
    })();
  }, []);

  const addItem = () =>
    setItems(prev => [
      ...prev,
      { product_id: "", uom: "kg", bags: "", dispatched_qty: "", batch_number: "", available: 0 },
    ]);

  const removeItem = (i: number) =>
    setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof LineItem, val: string) => {
    setItems(prev =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const updated = { ...it, [field]: val };

        if (field === "product_id") {
          const prod = finishedGoods.find(p => p.id === val);
          if (prod) {
            updated.uom = prod.uom;
            updated.conversion_kg = prod.conversion_kg;
            updated.product_name = prod.name;
            updated.available = prod.balance;        // set available stock
            updated.bags = "";
            updated.dispatched_qty = "";
          } else {
            updated.uom = "kg";
            updated.conversion_kg = undefined;
            updated.product_name = undefined;
            updated.available = 0;
          }
        }

        // Auto‑calculate kg when bags field changes
        if (field === "bags" && updated.uom === "bags" && updated.conversion_kg) {
          const bags = parseFloat(val);
          if (!isNaN(bags)) {
            updated.dispatched_qty = (bags * updated.conversion_kg).toFixed(3);
          } else {
            updated.dispatched_qty = "";
          }
        }

        return updated;
      })
    );
  };

  const handleSave = async (status: "draft" | "verified") => {
    setError("");
    if (!form.customer_id) { setError("Please select a customer."); return; }
    if (!form.vehicle_number) { setError("Vehicle number is required."); return; }

    for (const it of items) {
      if (!it.product_id || !it.dispatched_qty) {
        setError("Please fill all product items with quantity.");
        return;
      }
      const qty = parseFloat(it.dispatched_qty);
      if (isNaN(qty) || qty <= 0) {
        setError("Quantity must be a positive number.");
        return;
      }
      if (qty > it.available) {
        setError(`Cannot dispatch more than available stock for ${it.product_name || "item"}. Available: ${it.available.toFixed(3)} ${it.uom}`);
        return;
      }
    }

    setLoading(true);
    try {
      const { data: ogp, error: ogpErr } = await supabase
        .from("outward_gate_passes")
        .insert({
          customer_id: form.customer_id || null,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name || null,
          dispatch_date: form.dispatch_date,
          notes: form.notes || null,
          status: status,
        })
        .select()
        .single();
      if (ogpErr) throw ogpErr;

      const linePayload = items.map(it => ({
        ogp_id: ogp.id,
        product_id: it.product_id,
        dispatched_qty: parseFloat(it.dispatched_qty),
        uom: it.uom,
        batch_number: it.batch_number || null,
      }));
      const { error: lineErr } = await supabase.from("ogp_line_items").insert(linePayload);
      if (lineErr) throw lineErr;

      if (status === "verified") {
        const ledgerPayload = items.map(it => ({
          product_id: it.product_id,
          store: "finished_goods",
          txn_type: "dispatched",
          quantity: parseFloat(it.dispatched_qty),
          direction: -1,
          reference_type: "outward_gate_pass",
          reference_id: ogp.id,
          notes: `OGP ${ogp.ogp_number}`,
        }));
        const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerPayload);
        if (ledgerErr) throw ledgerErr;
      }

      router.push("/outward-gate-pass");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save outward gate pass.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header
        title="New Outward Gate Pass"
        subtitle="Record dispatch of finished goods to customer"
        actions={
          <Link href="/outward-gate-pass" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <form onSubmit={e => e.preventDefault()} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Dispatch Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Customer *</label>
                <select className="input" required value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
                  <option value="">-- Select Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">No customers found. Add one via SQL.</p>
                )}
              </div>
              <div>
                <label className="label">Vehicle Number *</label>
                <input className="input" required placeholder="e.g. XYZ-5678" value={form.vehicle_number} onChange={e => setForm(p => ({ ...p, vehicle_number: e.target.value }))} />
              </div>
              <div>
                <label className="label">Dispatch Date *</label>
                <input type="date" className="input" required value={form.dispatch_date} onChange={e => setForm(p => ({ ...p, dispatch_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Driver Name</label>
                <input className="input" placeholder="Optional" value={form.driver_name} onChange={e => setForm(p => ({ ...p, driver_name: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Notes</label>
                <input className="input" placeholder="Optional remarks" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Finished Goods</h2>
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
                    <div className="md:col-span-4">
                      <label className="label">Product *</label>
                      <select
                        className="input"
                        value={item.product_id}
                        onChange={e => updateItem(i, "product_id", e.target.value)}
                      >
                        <option value="">-- Select Finished Good --</option>
                        {finishedGoods.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.uom}) – Avail: {p.balance.toFixed(3)}
                          </option>
                        ))}
                      </select>
                      {finishedGoods.length === 0 && (
                        <p className="text-xs text-red-400 mt-1">No finished goods available in stock.</p>
                      )}
                    </div>

                    {item.uom === "bags" && (
                      <div className="md:col-span-1">
                        <label className="label">Bags</label>
                        <input
                          type="number" min="0" className="input" placeholder="0"
                          value={item.bags}
                          onChange={e => updateItem(i, "bags", e.target.value)}
                        />
                      </div>
                    )}

                    <div className={item.uom === "bags" ? "md:col-span-2" : "md:col-span-3"}>
                      <label className="label">
                        {item.uom === "bags" ? "Total KG" : item.uom === "kg" ? "KG" : item.uom}
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max={item.available || 0}
                        required
                        className="input"
                        placeholder="0.00"
                        value={item.dispatched_qty}
                        onChange={e => updateItem(i, "dispatched_qty", e.target.value)}
                      />
                      {item.available > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Available: {item.available.toFixed(3)} {item.uom}
                          {item.uom === "bags" && item.conversion_kg &&
                            ` (≈ ${(item.available * item.conversion_kg).toFixed(3)} kg)`}
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label className="label">Batch No.</label>
                      <input className="input" placeholder="Optional" value={item.batch_number}
                        onChange={e => updateItem(i, "batch_number", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/outward-gate-pass" className="btn-secondary">Cancel</Link>
            <button type="button" disabled={loading} onClick={() => handleSave("draft")} className="btn-secondary inline-flex items-center gap-1">
              <Save className="h-4 w-4" /> Save Draft
            </button>
            <button type="button" disabled={loading} onClick={() => handleSave("verified")} className="btn-primary inline-flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Verify & Dispatch
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { ArrowLeft } from "lucide-react";
import { wipApi } from "@/lib/api/client";
import Link from "next/link";

export default function NewWIPPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    product_id: "",
    planned_qty: "",
    production_line: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await wipApi.create({
        ...form,
        planned_qty: parseFloat(form.planned_qty),
      });
      router.push("/wip");
    } catch {
      setError("Failed to create WIP batch. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header
        title="New WIP Batch"
        subtitle="Stage 3 → 4: Start a production batch"
        actions={
          <Link href="/wip" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />
      <main className="flex-1 p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Batch Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Product Being Produced *</label>
                <input className="input" required placeholder="Product ID or name"
                  value={form.product_id}
                  onChange={(e) => setForm((p) => ({ ...p, product_id: e.target.value }))} />
              </div>
              <div>
                <label className="label">Planned Quantity *</label>
                <input className="input" type="number" step="0.001" min="0" required placeholder="0.00"
                  value={form.planned_qty}
                  onChange={(e) => setForm((p) => ({ ...p, planned_qty: e.target.value }))} />
              </div>
              <div>
                <label className="label">Production Line</label>
                <input className="input" placeholder="e.g. Line A"
                  value={form.production_line}
                  onChange={(e) => setForm((p) => ({ ...p, production_line: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={3} placeholder="Optional remarks"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/wip" className="btn-secondary">Cancel</Link>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create Batch"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

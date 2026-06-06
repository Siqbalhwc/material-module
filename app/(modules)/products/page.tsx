"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Plus, ShoppingBag, RotateCcw, Settings2, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

const CATEGORIES = [
  { value: "Raw Material", label: "Raw Material (PP, Natural, Calpet, MB)" },
  { value: "Chemical", label: "Chemical (Ink, IPA, Oil)" },
  { value: "Store / Consumable", label: "Store / Consumable" },
];

const UOM_LIST = ["kg", "bags", "litres", "units", "metres", "pcs"];

type SortField = "code" | "name" | "category" | "uom" | "conversion_kg" | "reorder_level" | "is_rc" | "is_active";
type SortDir = "asc" | "desc";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    uom: "kg",
    is_rc: false,
    reorder_level: "0",
    conversion_kg: "",
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    code: true,
    name: true,
    category: true,
    uom: true,
    kgPerBag: true,
    reorder: false,
    rc: false,
    status: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Search & Sort
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const supabase = createClient();

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
    if (!form.category) {
      alert("Please select a category");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        category: form.category,
        uom: form.uom,
        is_rc: form.is_rc,
        reorder_level: parseFloat(form.reorder_level),
      };

      if (form.uom === "bags" && form.conversion_kg) {
        payload.conversion_kg = parseFloat(form.conversion_kg);
      }

      const { data, error } = await supabase
        .from("products")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      setProducts((prev) => [data as Product, ...prev]);
      setShowForm(false);
      setForm({
        name: "",
        category: "",
        uom: "kg",
        is_rc: false,
        reorder_level: "0",
        conversion_kg: "",
      });
    } catch (err: any) {
      console.error("Create product failed:", err);
      alert("Failed to create product: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const toggleColumn = (key: keyof typeof visibleColumns) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter + Sort
  const filteredProducts = useMemo(() => {
    let list = [...products];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let valA: any, valB: any;

      switch (sortField) {
        case "code":
          valA = a.code;
          valB = b.code;
          break;
        case "name":
          valA = a.name;
          valB = b.name;
          break;
        case "category":
          valA = a.category;
          valB = b.category;
          break;
        case "uom":
          valA = a.uom;
          valB = b.uom;
          break;
        case "conversion_kg":
          valA = a.conversion_kg ?? 0;
          valB = b.conversion_kg ?? 0;
          break;
        case "reorder_level":
          valA = a.reorder_level;
          valB = b.reorder_level;
          break;
        case "is_rc":
          valA = a.is_rc ? 1 : 0;
          valB = b.is_rc ? 1 : 0;
          break;
        case "is_active":
          valA = a.is_active ? 1 : 0;
          valB = b.is_active ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (typeof valA === "string") {
        return sortDir === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
    });

    return list;
  }, [products, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-brand-600 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />
    );
  };

  return (
    <>
      <Header
        title="Products"
        subtitle="Master list — raw materials, chemicals and consumables"
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
              <div className="col-span-2">
                <label className="label">Category *</label>
                <select
                  className="input"
                  required
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                >
                  <option value="">-- Select Category --</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
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
                <label className="label">UOM *</label>
                <select
                  className="input"
                  value={form.uom}
                  onChange={(e) => setForm((p) => ({ ...p, uom: e.target.value }))}
                >
                  {UOM_LIST.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {form.uom === "bags" && (
                <div>
                  <label className="label">Kg per bag</label>
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="e.g. 25"
                    value={form.conversion_kg}
                    onChange={(e) => setForm((p) => ({ ...p, conversion_kg: e.target.value }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">Standard bag weight (can be overridden in transactions)</p>
                </div>
              )}

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
                  className="rounded border-gray-300"
                  checked={form.is_rc}
                  onChange={(e) => setForm((p) => ({ ...p, is_rc: e.target.checked }))}
                />
                <label htmlFor="is_rc" className="text-sm text-gray-700 cursor-pointer">
                  Returnable Component (RC)
                </label>
                <span className="text-xs text-gray-400 ml-1">
                  (recovered from WIP, not purchased)
                </span>
              </div>

              <div className="col-span-2 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search & Column toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="relative">
            <button
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-md px-2.5 py-1.5"
              onClick={() => setShowColumnMenu(!showColumnMenu)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Columns
            </button>
            {showColumnMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                <div className="p-2 space-y-1">
                  {Object.entries(visibleColumns).map(([key, value]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={() => toggleColumn(key as keyof typeof visibleColumns)}
                        className="rounded border-gray-300"
                      />
                      <span className="capitalize text-gray-600">
                        {key === "kgPerBag" ? "Kg/Bag" : key === "rc" ? "RC" : key}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              Loading…
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery ? "No products match your search" : "No products yet"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {visibleColumns.code && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("code")}
                    >
                      <span className="inline-flex items-center">
                        Code {renderSortIcon("code")}
                      </span>
                    </th>
                  )}
                  {visibleColumns.name && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("name")}
                    >
                      <span className="inline-flex items-center">
                        Name {renderSortIcon("name")}
                      </span>
                    </th>
                  )}
                  {visibleColumns.category && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("category")}
                    >
                      <span className="inline-flex items-center">
                        Category {renderSortIcon("category")}
                      </span>
                    </th>
                  )}
                  {visibleColumns.uom && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("uom")}
                    >
                      <span className="inline-flex items-center">
                        UOM {renderSortIcon("uom")}
                      </span>
                    </th>
                  )}
                  {visibleColumns.kgPerBag && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("conversion_kg")}
                    >
                      <span className="inline-flex items-center">
                        Kg/Bag {renderSortIcon("conversion_kg")}
                      </span>
                    </th>
                  )}
                  {visibleColumns.reorder && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("reorder_level")}
                    >
                      <span className="inline-flex items-center">
                        Reorder Level {renderSortIcon("reorder_level")}
                      </span>
                    </th>
                  )}
                  {visibleColumns.rc && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("is_rc")}
                    >
                      <span className="inline-flex items-center">
                        RC {renderSortIcon("is_rc")}
                      </span>
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th
                      className="table-th cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort("is_active")}
                    >
                      <span className="inline-flex items-center">
                        Status {renderSortIcon("is_active")}
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.code && (
                      <td className="table-td font-mono text-xs font-medium text-brand-600">{p.code}</td>
                    )}
                    {visibleColumns.name && (
                      <td className="table-td font-medium text-gray-900">{p.name}</td>
                    )}
                    {visibleColumns.category && (
                      <td className="table-td text-gray-500">{p.category}</td>
                    )}
                    {visibleColumns.uom && (
                      <td className="table-td text-xs uppercase text-gray-500">{p.uom}</td>
                    )}
                    {visibleColumns.kgPerBag && (
                      <td className="table-td">
                        {p.uom === "bags" && p.conversion_kg ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                            <span className="font-medium">{p.conversion_kg}</span> kg
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.reorder && (
                      <td className="table-td">{p.reorder_level}</td>
                    )}
                    {visibleColumns.rc && (
                      <td className="table-td">
                        {p.is_rc && (
                          <span className="inline-flex items-center gap-1 text-xs text-purple-600">
                            <RotateCcw className="h-3 w-3" /> RC
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns.status && (
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
                    )}
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
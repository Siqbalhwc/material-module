"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Header from "@/components/layout/Header";
import { Plus, ShoppingBag, RotateCcw, Settings2, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Download, Upload, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";
import * as XLSX from 'xlsx';

// Extended product type with parent info
type ProductWithParent = Product & {
  parent_product_id?: string | null;
  parent_name?: string;
  children?: ProductWithParent[];
};

const CATEGORIES = [
  { value: "Raw Material", label: "Raw Material (PP, Natural, Calpet, MB)" },
  { value: "Chemical", label: "Chemical (Ink, IPA, Oil)" },
  { value: "Store / Consumable", label: "Store / Consumable" },
  { value: "Finished Good", label: "Finished Good" },
];

const UOM_LIST = ["kg", "bags", "litres", "units", "metres", "pcs"];

type SortField = "code" | "name" | "category" | "uom" | "conversion_kg" | "reorder_level" | "is_rc" | "is_active";
type SortDir = "asc" | "desc";

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithParent[]>([]);
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
    parent_product_id: "",
  });

  // Column visibility
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

  // Expand/collapse parents
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // Super admin check
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const supabase = createClient();

  // Check if current user is super_admin
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle()
        .then(({ data }) => setIsSuperAdmin(!!data));
    });
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch products:", error);
    }

    const allProducts = (data || []) as ProductWithParent[];

    // Build parent‑child relationships
    const parentMap = new Map<string, ProductWithParent>();
    const children: ProductWithParent[] = [];

    for (const p of allProducts) {
      if (p.parent_product_id) {
        children.push(p);
      } else {
        parentMap.set(p.id, { ...p, children: [] });
      }
    }

    for (const child of children) {
      const parent = parentMap.get(child.parent_product_id!);
      if (parent) {
        parent.children!.push(child);
      }
    }

    // Flatten for display: parents first, then children indented
    const displayList: ProductWithParent[] = [];
    const parentEntries = Array.from(parentMap.entries());
    for (const [, parent] of parentEntries) {
      displayList.push(parent);
      if (parent.children && parent.children.length > 0) {
        displayList.push(...parent.children);
      }
    }

    setProducts(displayList);
    setLoading(false);
  };

  // List of potential parent products (same category, no parent themselves)
  const parentOptions = useMemo(() => {
    if (!form.category) return [];
    return products.filter(
      p => p.category === form.category && !p.parent_product_id
    );
  }, [products, form.category]);

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

      if (form.parent_product_id) {
        payload.parent_product_id = form.parent_product_id;
      }

      const { data, error } = await supabase
        .from("products")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      setProducts((prev) => [data as ProductWithParent, ...prev]);
      setShowForm(false);
      setForm({
        name: "",
        category: "",
        uom: "kg",
        is_rc: false,
        reorder_level: "0",
        conversion_kg: "",
        parent_product_id: "",
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

  const toggleExpand = (productId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // ── Export ───────────────────────────────────────────────
  const handleExport = () => {
    const flatData = products.map(p => ({
      Code: p.code,
      Name: p.name,
      Category: p.category,
      UOM: p.uom,
      "Kg/Bag": p.conversion_kg || "",
      "Reorder Level": p.reorder_level,
      "Is RC": p.is_rc ? "TRUE" : "FALSE",
      Active: p.is_active ? "TRUE" : "FALSE",
      "Parent Product Name": p.parent_product_id
        ? products.find(x => x.id === p.parent_product_id)?.name || ""
        : "",
    }));

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products_export.xlsx");
  };

  // ── Download Template ───────────────────────────────────
  const handleDownloadTemplate = () => {
    const template = [
      {
        Name: "Example Product",
        Category: "Raw Material",
        UOM: "kg",
        "Kg/Bag": "",
        "Reorder Level": "0",
        "Is RC": "FALSE",
        "Parent Product Name": "",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "product_import_template.xlsx");
  };

  // ── Import ───────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMsg("");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);

      let created = 0;
      let errors = 0;

      for (const row of rows) {
        try {
          const name = row["Name"]?.toString().trim();
          const category = row["Category"]?.toString().trim();
          const uom = row["UOM"]?.toString().trim() || "kg";
          const conversion_kg = row["Kg/Bag"] ? parseFloat(row["Kg/Bag"]) : null;
          const reorder_level = row["Reorder Level"] ? parseFloat(row["Reorder Level"]) : 0;
          const is_rc = row["Is RC"]?.toString().toUpperCase() === "TRUE";
          const parentName = row["Parent Product Name"]?.toString().trim();

          if (!name || !category) {
            errors++;
            continue;
          }

          // Find parent product if specified
          let parentId = null;
          if (parentName) {
            const { data: parent } = await supabase
              .from("products")
              .select("id")
              .eq("name", parentName)
              .maybeSingle();
            if (parent) parentId = parent.id;
          }

          const payload: any = {
            name,
            category,
            uom,
            is_rc,
            reorder_level,
          };
          if (conversion_kg) payload.conversion_kg = conversion_kg;
          if (parentId) payload.parent_product_id = parentId;

          const { error } = await supabase.from("products").insert([payload]);
          if (error) {
            console.error("Import error:", error);
            errors++;
          } else {
            created++;
          }
        } catch {
          errors++;
        }
      }

      setImportMsg(`✅ ${created} products created. ${errors > 0 ? `${errors} rows skipped.` : ""}`);
      fetchProducts();
    } catch (err: any) {
      setImportMsg("❌ Failed to read file.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Nuke ─────────────────────────────────────────────────
const handleNuke = async () => {
  if (!confirm("⚠️ This will DELETE ALL transaction data (stock, gate passes, production runs, transfers).\n\nProducts, suppliers, customers, and users will be kept.\n\nAre you absolutely sure?")) return;

  // Ask if products should also be deleted
  const deleteProducts = confirm("Do you also want to delete ALL PRODUCTS?\n\nClick OK to delete products too, or Cancel to keep products.");

  const input = prompt('Type "DELETE" to confirm:');
  if (input !== "DELETE") return;

  try {
    const tables = [
      "dispatch_items", "dispatch_orders",
      "wip_material_consumption", "wip_batches",
      "requisition_items", "requisitions",
      "fg_transfers", "rc_movements",
      "ogp_line_items", "outward_gate_passes",
      "igp_line_items", "inward_gate_passes",
      "production_runs", "store_transfers",
      "stock_ledger",
    ];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        console.error(`Failed to delete ${table}:`, error.message);
        alert(`Failed to delete ${table}: ${error.message}`);
        return;
      }
    }

    // Optional: delete all products
    if (deleteProducts) {
      const { error: prodErr } = await supabase
        .from("products")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (prodErr) {
        alert("Failed to delete products: " + prodErr.message);
        return;
      }
    }

    alert(`✅ All transaction data cleared.${deleteProducts ? " Products also deleted." : ""}`);
    fetchProducts();
  } catch (err: any) {
    alert("Failed: " + err.message);
  }
};


  // Search filter
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  };

  return (
    <>
      <Header
        title="Products"
        subtitle="Master list — raw materials, chemicals and consumables"
        actions={
          <div className="flex gap-2">
            {isSuperAdmin && (
              <>
                <button onClick={handleDownloadTemplate} className="btn-secondary text-xs flex items-center gap-1">
                  <Download className="h-3.5 w-3.5" /> Template
                </button>
                <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn-secondary text-xs flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Import"}
                </button>
                <button onClick={handleExport} className="btn-secondary text-xs flex items-center gap-1">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                <button onClick={handleNuke} className="btn-secondary text-xs flex items-center gap-1 text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Nuke
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx,.xls,.csv" hidden />
              </>
            )}
            <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>
        }
      />
      <main className="flex-1 p-6 space-y-4">
        {importMsg && (
          <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm">{importMsg}</div>
        )}

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
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value, parent_product_id: "" }))}
                >
                  <option value="">-- Select Category --</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {form.category && parentOptions.length > 0 && (
                <div className="col-span-2">
                  <label className="label">Subcategory of… (optional)</label>
                  <select
                    className="input"
                    value={form.parent_product_id}
                    onChange={(e) => setForm((p) => ({ ...p, parent_product_id: e.target.value }))}
                  >
                    <option value="">-- None (standalone) --</option>
                    {parentOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
              </div>

              <div className="col-span-2 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
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
            <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">{searchQuery ? "No products match your search" : "No products yet"}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th w-8"></th>
                  {visibleColumns.code && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">Code {renderSortIcon("code")}</span>
                    </th>
                  )}
                  {visibleColumns.name && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">Name {renderSortIcon("name")}</span>
                    </th>
                  )}
                  {visibleColumns.category && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">Category {renderSortIcon("category")}</span>
                    </th>
                  )}
                  {visibleColumns.uom && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">UOM {renderSortIcon("uom")}</span>
                    </th>
                  )}
                  {visibleColumns.kgPerBag && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">Kg/Bag {renderSortIcon("conversion_kg")}</span>
                    </th>
                  )}
                  {visibleColumns.reorder && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">Reorder Level {renderSortIcon("reorder_level")}</span>
                    </th>
                  )}
                  {visibleColumns.rc && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">RC {renderSortIcon("is_rc")}</span>
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100">
                      <span className="inline-flex items-center">Status {renderSortIcon("is_active")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProducts.map((p) => {
                  const isParent = p.children && p.children.length > 0;
                  const isChild = !!p.parent_product_id;
                  const isExpanded = expandedParents.has(p.id);

                  if (isChild && p.parent_product_id && !expandedParents.has(p.parent_product_id)) {
                    return null;
                  }

                  return (
                    <tr key={p.id} className={cn("hover:bg-gray-50 transition-colors", isChild && "bg-gray-50/50")}>
                      <td className="table-td w-8">
                        {isParent && (
                          <button onClick={() => toggleExpand(p.id)} className="p-0.5 text-gray-400 hover:text-gray-600">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      {visibleColumns.code && (
                        <td className={cn("table-td font-mono text-xs font-medium text-brand-600", isChild && "pl-6")}>
                          {p.code}
                        </td>
                      )}
                      {visibleColumns.name && (
                        <td className={cn("table-td font-medium", isChild && "pl-6 text-gray-600")}>
                          {isChild && <span className="text-gray-300 mr-1">└</span>}
                          {p.name}
                        </td>
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
                          <span className={cn("badge", p.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-400")}>
                            {p.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
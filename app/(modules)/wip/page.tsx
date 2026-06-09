"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import {
  CheckCircle, XCircle, Package,
  Search, ArrowUpDown, ArrowUp, ArrowDown, Send, Printer, Wrench
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, cn } from "@/lib/utils";
import type { StoreType } from "@/types";

// ── Types ─────────────────────────────────────────────────────
type WIPStock = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  conversion_kg?: number;
  opening: number;
  received: number;
  issued_fg: number;
  issued_rc: number;
  closing: number;
};

type PendingReceipt = {
  id: string;
  req_number: string;
  required_date: string | null;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    product_code: string;
    uom: string;
    requested_qty: number;
    issued_qty: number | null;
  }[];
};

type FGProductOption = {
  id: string;
  name: string;
  code: string;
};

type SortField = "code" | "name" | "category" | "uom" | "closing";
type SortDir = "asc" | "desc";

export default function WIPPage() {
  const supabase = createClient();

  // Month filter
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  // WIP stock movements
  const [stock, setStock] = useState<WIPStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Pending receipts
  const [receipts, setReceipts] = useState<PendingReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);

  // Transfer modal state
  const [transferItem, setTransferItem] = useState<WIPStock | null>(null);
  const [transferTarget, setTransferTarget] = useState<"rc" | "fg">("rc");
  const [transferQty, setTransferQty] = useState("");
  const [transferring, setTransferring] = useState(false);

  // FG product selection / creation
  const [fgProducts, setFgProducts] = useState<FGProductOption[]>([]);
  const [selectedFGProduct, setSelectedFGProduct] = useState("");
  const [newFGName, setNewFGName] = useState("");
  const [newFGWeight, setNewFGWeight] = useState("");

  // ── Fetch WIP stock with monthly movements ─────────────────
  const fetchStock = async () => {
    setLoadingStock(true);

    const monthStart = selectedMonth + "-01";
    const nextMonth = new Date(selectedMonth + "-01");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 7) + "-01";

    // 1. Get all product IDs that have ever been in WIP
    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom, conversion_kg )")
      .eq("store", "wip");

    if (prodErr || !allProducts) {
      setStock([]);
      setLoadingStock(false);
      return;
    }

    // Unique products
    const uniqueMap = new Map<string, any>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          category: (row.products as any)?.category ?? "",
          uom: (row.products as any)?.uom ?? "",
          conversion_kg: (row.products as any)?.conversion_kg ?? null,
          opening: 0, received: 0, issued_fg: 0, issued_rc: 0, closing: 0,
        });
      }
    }

    const stockItems = Array.from(uniqueMap.values());

    // 2. For each product, compute opening balance (sum of all movements before monthStart)
    for (const item of stockItems) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "wip")
        .lt("created_at", monthStart);

      const opening = (before || []).reduce(
        (sum, r) => sum + r.quantity * r.direction,
        0
      );
      item.opening = opening;
    }

    // 3. Within the selected month, sum received / issued
    for (const item of stockItems) {
      const { data: monthData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, txn_type, reference_type")
        .eq("product_id", item.product_id)
        .eq("store", "wip")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      let received = 0, issued_fg = 0, issued_rc = 0;
      for (const r of (monthData || [])) {
        if (r.direction === 1 && r.txn_type === "received") {
          received += r.quantity;
        } else if (r.direction === -1) {
          if (r.reference_type === "fg_transfer") {
            issued_fg += r.quantity;
          } else if (r.reference_type === "rc_movement") {
            issued_rc += r.quantity;
          }
        }
      }

      item.received = received;
      item.issued_fg = issued_fg;
      item.issued_rc = issued_rc;
      item.closing = item.opening + received - (issued_fg + issued_rc);
    }

    setStock(stockItems);
    setLoadingStock(false);
  };

  useEffect(() => {
    fetchStock();
  }, [selectedMonth]);

  // ── Fetch pending receipts ─────────────────────────────────
  const fetchReceipts = async () => {
    const { data, error } = await supabase
      .from("requisitions")
      .select(`id, req_number, required_date, requisition_items(id, product_id, requested_qty, issued_qty, products(code, name, uom))`)
      .eq("to_store", "wip")
      .eq("status", "issued")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: PendingReceipt[] = data.map((r: any) => ({
        id: r.id,
        req_number: r.req_number,
        required_date: r.required_date,
        items: (r.requisition_items || []).map((it: any) => ({
          id: it.id,
          product_id: it.product_id,
          product_name: it.products?.name ?? "Unknown",
          product_code: it.products?.code ?? "",
          uom: it.uom,
          requested_qty: it.requested_qty,
          issued_qty: it.issued_qty,
        })),
      }));
      setReceipts(mapped);
    }
    setLoadingReceipts(false);
  };

  // ── Fetch FG products (category = 'Finished Good') ─────────
  const fetchFGProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, code")
      .eq("category", "Finished Good")
      .eq("is_active", true)
      .order("name");
    if (data) setFgProducts(data as FGProductOption[]);
  };

  useEffect(() => {
    fetchReceipts();
    fetchFGProducts();
  }, []);

  // ── Stock filtering & sorting ──────────────────────────────
  const filteredStock = useMemo(() => {
    let list = [...stock];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "code": valA = a.code; valB = b.code; break;
        case "name": valA = a.name; valB = b.name; break;
        case "category": valA = a.category; valB = b.category; break;
        case "uom": valA = a.uom; valB = b.uom; break;
        case "closing": valA = a.closing; valB = b.closing; break;
        default: return 0;
      }
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [stock, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-600 ml-1" /> : <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />;
  };

  // Print function
  const handlePrint = () => window.print();

  // ── Verify / Reject handlers ──────────────────────────────
  const handleVerify = async (reqId: string) => {
    setVerifying(reqId);
    try {
      const receipt = receipts.find((r) => r.id === reqId);
      if (!receipt) return;

      const { error: reqErr } = await supabase
        .from("requisitions")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", reqId);
      if (reqErr) throw reqErr;

      const ledgerRows = receipt.items.map((it) => ({
        product_id: it.product_id,
        store: "wip" as StoreType,
        txn_type: "received",
        quantity: it.issued_qty ?? it.requested_qty,
        direction: 1,
        reference_type: "requisition",
        reference_id: reqId,
        notes: `Received from Material Store – Req ${receipt.req_number}`,
      }));

      const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
      if (ledgerErr) throw ledgerErr;

      setReceipts((prev) => prev.filter((r) => r.id !== reqId));
      fetchStock();
    } catch (err: any) {
      console.error("Verification failed:", err);
      alert("Failed to verify: " + (err.message || "Unknown error"));
    } finally {
      setVerifying(null);
    }
  };

  const handleReject = async (reqId: string) => {
    const reason = prompt("Enter rejection reason:");
    if (reason === null) return;

    setVerifying(reqId);
    try {
      const receipt = receipts.find((r) => r.id === reqId);
      if (!receipt) return;

      const { error: reqErr } = await supabase
        .from("requisitions")
        .update({ status: "submitted", issued_at: null, issued_by: null })
        .eq("id", reqId);
      if (reqErr) throw reqErr;

      const ledgerRows = receipt.items.map((it) => ({
        product_id: it.product_id,
        store: "material_store" as StoreType,
        txn_type: "returned",
        quantity: it.issued_qty ?? it.requested_qty,
        direction: 1,
        reference_type: "requisition",
        reference_id: reqId,
        notes: `Rejected by WIP: ${reason}. Req ${receipt.req_number}`,
      }));

      const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
      if (ledgerErr) throw ledgerErr;

      for (const it of receipt.items) {
        await supabase
          .from("requisition_items")
          .update({ issued_qty: null })
          .eq("id", it.id);
      }

      setReceipts((prev) => prev.filter((r) => r.id !== reqId));
      fetchStock();
      alert("Rejected. Stock returned to Material Store.");
    } catch (err: any) {
      console.error("Rejection failed:", err);
      alert("Failed to reject: " + (err.message || "Unknown error"));
    } finally {
      setVerifying(null);
    }
  };

  // ── Transfer handler (RC or FG) ────────────────────────────
  const handleTransfer = async () => {
    if (!transferItem) return;
    const qty = parseFloat(transferQty);
    if (isNaN(qty) || qty <= 0 || qty > transferItem.closing) {
      alert("Please enter a valid quantity (up to closing balance).");
      return;
    }

    if (transferTarget === "fg") {
      if (!selectedFGProduct && !newFGName) {
        alert("Please select or create a finished good product.");
        return;
      }
    }

    setTransferring(true);
    try {
      if (transferTarget === "rc") {
        const { data: movement, error: moveErr } = await supabase
          .from("rc_movements")
          .insert({
            product_id: transferItem.product_id,
            direction: "return_from_wip",
            quantity: qty,
            uom: transferItem.uom,
            reason: `Sent from WIP`,
          })
          .select()
          .single();
        if (moveErr) throw moveErr;

        const ledgerRows = [
          {
            product_id: transferItem.product_id,
            store: "wip" as StoreType,
            txn_type: "issued",
            quantity: qty,
            direction: -1,
            reference_type: "rc_movement",
            reference_id: movement.id,
            notes: `Sent to RC Store – Ref ${movement.ref_number}`,
          },
          {
            product_id: transferItem.product_id,
            store: "rc_store" as StoreType,
            txn_type: "received",
            quantity: qty,
            direction: 1,
            reference_type: "rc_movement",
            reference_id: movement.id,
            notes: `Received from WIP – Ref ${movement.ref_number}`,
          },
        ];
        const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
        if (ledgerErr) throw ledgerErr;

      } else {
        let fgProductId = selectedFGProduct;

        if (!fgProductId && newFGName) {
          const { data: newProd, error: prodErr } = await supabase
            .from("products")
            .insert({
              name: newFGName,
              category: "Finished Good",
              uom: "kg",
              is_rc: false,
              reorder_level: 0,
            })
            .select()
            .single();
          if (prodErr) throw prodErr;
          fgProductId = newProd.id;
          setFgProducts(prev => [...prev, { id: newProd.id, name: newProd.name, code: newProd.code }]);
        }

        if (!fgProductId) throw new Error("No finished good product selected.");

        const { data: fgTransfer, error: fgErr } = await supabase
          .from("fg_transfers")
          .insert({
            product_id: fgProductId,
            quantity: parseFloat(newFGWeight) || qty,
            uom: "kg",
            qc_passed: true,
            transferred_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (fgErr) throw fgErr;

        const ledgerRows = [
          {
            product_id: transferItem.product_id,
            store: "wip" as StoreType,
            txn_type: "issued",
            quantity: qty,
            direction: -1,
            reference_type: "fg_transfer",
            reference_id: fgTransfer.id,
            notes: `Transferred to Finished Goods – Ref ${fgTransfer.ref_number}`,
          },
          {
            product_id: fgProductId,
            store: "finished_goods" as StoreType,
            txn_type: "received",
            quantity: parseFloat(newFGWeight) || qty,
            direction: 1,
            reference_type: "fg_transfer",
            reference_id: fgTransfer.id,
            notes: `Received from WIP – Ref ${fgTransfer.ref_number}`,
          },
        ];
        const { error: ledgerErr } = await supabase.from("stock_ledger").insert(ledgerRows);
        if (ledgerErr) throw ledgerErr;
      }

      fetchStock();
      setTransferItem(null);
      setTransferQty("");
      setNewFGName("");
      setNewFGWeight("");
      setSelectedFGProduct("");
    } catch (err: any) {
      console.error("Transfer failed:", err);
      alert("Transfer failed: " + (err.message || "Unknown error"));
    } finally {
      setTransferring(false);
    }
  };

  return (
    <>
      <Header
        title="WIP – Production Management"
        subtitle="Verify incoming materials, manage stock, and transfer to RC or Finished Goods"
      />
      <main className="flex-1 p-6 space-y-8 print:space-y-4">
        {/* Month & Print controls */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Month:</label>
            <input
              type="month"
              className="input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-1">
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>

        {/* Pending Receipts */}
        <section className="print:hidden">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" /> Pending Receipts
            {receipts.length > 0 && (
              <span className="h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {receipts.length}
              </span>
            )}
          </h2>

          {loadingReceipts ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : receipts.length === 0 ? (
            <div className="card p-6 text-center text-sm text-gray-400">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No pending receipts.
            </div>
          ) : (
            <div className="space-y-4">
              {receipts.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{r.req_number}</p>
                      {r.required_date && (
                        <p className="text-xs text-gray-500">Required by {formatDate(r.required_date)}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleVerify(r.id)} disabled={verifying === r.id}
                        className="btn-primary text-xs py-1 px-3 inline-flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {verifying === r.id ? "…" : "Verify"}
                      </button>
                      <button onClick={() => handleReject(r.id)} disabled={verifying === r.id}
                        className="btn-secondary text-xs py-1 px-3 inline-flex items-center gap-1 text-red-600 hover:bg-red-50">
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-sm border border-gray-100 rounded">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Product</th>
                        <th className="px-2 py-1 text-left">Code</th>
                        <th className="px-2 py-1 text-right">Requested</th>
                        <th className="px-2 py-1 text-right">Issued</th>
                        <th className="px-2 py-1 text-left">UOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {r.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-2 py-1">{it.product_name}</td>
                          <td className="px-2 py-1 font-mono text-xs">{it.product_code}</td>
                          <td className="px-2 py-1 text-right">{it.requested_qty}</td>
                          <td className="px-2 py-1 text-right">{it.issued_qty ?? "—"}</td>
                          <td className="px-2 py-1 uppercase text-xs">{it.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* WIP Stock Movements */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Stock Movement – {selectedMonth}
          </h2>

          <div className="relative max-w-sm mb-3 print:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="card overflow-hidden">
            {loadingStock ? (
              <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
            ) : filteredStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Package className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No stock movements for this month.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("code")}>
                      <span className="inline-flex items-center">Code {renderSortIcon("code")}</span>
                    </th>
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("name")}>
                      <span className="inline-flex items-center">Name {renderSortIcon("name")}</span>
                    </th>
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("category")}>
                      <span className="inline-flex items-center">Category {renderSortIcon("category")}</span>
                    </th>
                    <th className="table-th cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("uom")}>
                      <span className="inline-flex items-center">UOM {renderSortIcon("uom")}</span>
                    </th>
                    <th className="table-th text-right">Opening</th>
                    <th className="table-th text-right">Received</th>
                    <th className="table-th text-right">Issued to FG</th>
                    <th className="table-th text-right">Issued to RC</th>
                    <th className="table-th text-right">Closing</th>
                    <th className="table-th print:hidden"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredStock.map((item) => (
                    <tr key={item.product_id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td font-mono text-xs font-medium text-brand-600">{item.code}</td>
                      <td className="table-td font-medium text-gray-900">{item.name}</td>
                      <td className="table-td text-gray-500">{item.category}</td>
                      <td className="table-td text-xs uppercase text-gray-500">{item.uom}</td>
                      <td className="table-td text-right">{item.opening.toFixed(3)}</td>
                      <td className="table-td text-right">{item.received.toFixed(3)}</td>
                      <td className="table-td text-right">{item.issued_fg.toFixed(3)}</td>
                      <td className="table-td text-right">{item.issued_rc.toFixed(3)}</td>
                      <td className="table-td text-right font-medium">{item.closing.toFixed(3)}</td>
                      <td className="table-td print:hidden">
                        <button
                          className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                          onClick={() => {
                            setTransferItem(item);
                            setTransferQty("");
                            setTransferTarget("rc");
                            setNewFGName("");
                            setNewFGWeight("");
                            setSelectedFGProduct("");
                          }}
                        >
                          <Send className="h-3 w-3" /> Transfer Out
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Transfer Out Modal */}
        {transferItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Transfer: {transferItem.name}
              </h2>
              <p className="text-sm text-gray-500">
                Available: {transferItem.closing.toFixed(3)} {transferItem.uom}
              </p>

              <div>
                <label className="label">Quantity to transfer ({transferItem.uom})</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max={transferItem.closing}
                  className="input"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Destination</label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="transferTarget"
                      value="rc"
                      checked={transferTarget === "rc"}
                      onChange={() => setTransferTarget("rc")}
                    />
                    <span className="text-sm">RC Store</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="transferTarget"
                      value="fg"
                      checked={transferTarget === "fg"}
                      onChange={() => setTransferTarget("fg")}
                    />
                    <span className="text-sm">Finished Goods</span>
                  </label>
                </div>
              </div>

              {transferTarget === "fg" && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-sm font-medium text-gray-700">Select Finished Good</p>
                  <select
                    className="input"
                    value={selectedFGProduct}
                    onChange={(e) => { setSelectedFGProduct(e.target.value); setNewFGName(""); }}
                  >
                    <option value="">-- Choose existing --</option>
                    {fgProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>

                  <p className="text-sm text-gray-500">Or create a new finished good:</p>
                  <input
                    className="input"
                    placeholder="New finished good name"
                    value={newFGName}
                    onChange={(e) => { setNewFGName(e.target.value); setSelectedFGProduct(""); }}
                  />

                  <div>
                    <label className="label">Finished Good Weight (kg)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="input"
                      placeholder="e.g., 500"
                      value={newFGWeight}
                      onChange={(e) => setNewFGWeight(e.target.value)}
                    />
                    <p className="text-xs text-gray-400 mt-1">Weight of the finished good produced (if different from consumed qty)</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setTransferItem(null)}>Cancel</button>
                <button className="btn-primary" disabled={transferring} onClick={handleTransfer}>
                  {transferring ? "Processing…" : "Confirm Transfer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
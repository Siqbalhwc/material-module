"use client";
import { useState, useEffect, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Package, Send, X, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { StoreType } from "@/types";

type RCStockMovement = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  opening: number;
  received: number;
  issued: number;
  closing: number;
};

type PendingTransfer = {
  id: string;
  from_store: string;
  product_id: string;
  product_name: string;
  product_code: string;
  quantity: number;
  uom: string;
};

type SortField = "code" | "name" | "category" | "uom" | "opening" | "received" | "issued" | "closing";
type SortDir = "asc" | "desc";

export default function RCStorePage() {
  const supabase = createClient();

  // Month filter
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  // Stock movements
  const [movements, setMovements] = useState<RCStockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Incoming transfers (from WIP)
  const [incoming, setIncoming] = useState<PendingTransfer[]>([]);
  const [showIncoming, setShowIncoming] = useState(false);

  // Issue to Material Store modal
  const [issueItem, setIssueItem] = useState<RCStockMovement | null>(null);
  const [issueQty, setIssueQty] = useState("");
  const [issuing, setIssuing] = useState(false);

  // ── Fetch monthly stock movements ─────────────────────────
  const fetchMovements = async () => {
    setLoadingMovements(true);
    const monthStart = selectedMonth + "-01";
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 7) + "-01";

    // Get all product IDs that have ever been in rc_store
    const { data: allProducts, error: prodErr } = await supabase
      .from("stock_ledger")
      .select("product_id, products( code, name, category, uom )")
      .eq("store", "rc_store");

    if (prodErr || !allProducts) {
      setMovements([]);
      setLoadingMovements(false);
      return;
    }

    const uniqueMap = new Map<string, RCStockMovement>();
    for (const row of allProducts) {
      if (!uniqueMap.has(row.product_id)) {
        uniqueMap.set(row.product_id, {
          product_id: row.product_id,
          code: (row.products as any)?.code ?? "",
          name: (row.products as any)?.name ?? "Unknown",
          category: (row.products as any)?.category ?? "",
          uom: (row.products as any)?.uom ?? "",
          opening: 0,
          received: 0,
          issued: 0,
          closing: 0,
        });
      }
    }

    const movementItems = Array.from(uniqueMap.values());

    // Compute opening balances
    for (const item of movementItems) {
      const { data: before } = await supabase
        .from("stock_ledger")
        .select("quantity, direction")
        .eq("product_id", item.product_id)
        .eq("store", "rc_store")
        .lt("created_at", monthStart);

      const opening = (before || []).reduce(
        (sum, r) => sum + r.quantity * r.direction,
        0
      );
      item.opening = opening;
    }

    // Compute current month movements
    for (const item of movementItems) {
      const { data: monthData } = await supabase
        .from("stock_ledger")
        .select("quantity, direction, txn_type")
        .eq("product_id", item.product_id)
        .eq("store", "rc_store")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      let received = 0,
        issued = 0;
      for (const r of (monthData || [])) {
        if (r.direction === 1) received += r.quantity;
        else if (r.direction === -1) issued += r.quantity;
      }

      item.received = received;
      item.issued = issued;
      item.closing = item.opening + received - issued;
    }

    setMovements(movementItems);
    setLoadingMovements(false);
  };

  // ── Fetch incoming transfers (to rc_store, pending) ─────
  const fetchIncoming = async () => {
    const { data } = await supabase
      .from("store_transfers")
      .select(`*, products(code, name)`)
      .eq("to_store", "rc_store")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (data) {
      const mapped: PendingTransfer[] = data.map((r: any) => ({
        id: r.id,
        from_store: r.from_store,
        product_id: r.product_id,
        product_name: r.products?.name ?? "",
        product_code: r.products?.code ?? "",
        quantity: r.quantity,
        uom: r.uom,
      }));
      setIncoming(mapped);
    }
  };

  useEffect(() => {
    fetchMovements();
    fetchIncoming();
  }, [selectedMonth]);

  // ── Filtering & Sorting ───────────────────────────────────
  const filteredMovements = useMemo(() => {
    let list = [...movements];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        i =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "code": valA = a.code; valB = b.code; break;
        case "name": valA = a.name; valB = b.name; break;
        case "category": valA = a.category; valB = b.category; break;
        case "uom": valA = a.uom; valB = b.uom; break;
        case "opening": valA = a.opening; valB = b.opening; break;
        case "received": valA = a.received; valB = b.received; break;
        case "issued": valA = a.issued; valB = b.issued; break;
        case "closing": valA = a.closing; valB = b.closing; break;
        default: return 0;
      }
      if (typeof valA === "string")
        return sortDir === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      else return sortDir === "asc" ? valA - valB : valB - valA;
    });
    return list;
  }, [movements, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field)
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-brand-600 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-brand-600 ml-1" />
    );
  };

  // ── Accept / Reject incoming transfer ─────────────────────
  const handleIncomingAction = async (
    transferId: string,
    action: "accepted" | "rejected"
  ) => {
    const transfer = incoming.find(t => t.id === transferId);
    if (!transfer) return;
    try {
      if (action === "accepted") {
        const ledgerRows = [
          {
            product_id: transfer.product_id,
            store: transfer.from_store as StoreType,
            txn_type: "issued",
            quantity: transfer.quantity,
            direction: -1,
            reference_type: "store_transfer",
            reference_id: transfer.id,
          },
          {
            product_id: transfer.product_id,
            store: "rc_store" as StoreType,
            txn_type: "received",
            quantity: transfer.quantity,
            direction: 1,
            reference_type: "store_transfer",
            reference_id: transfer.id,
          },
        ];
        const { error: ledgerErr } = await supabase
          .from("stock_ledger")
          .insert(ledgerRows);
        if (ledgerErr) throw ledgerErr;
      }

      await supabase
        .from("store_transfers")
        .update({
          status: action,
          [action === "accepted" ? "accepted_at" : "rejected_at"]:
            new Date().toISOString(),
        })
        .eq("id", transferId);

      fetchIncoming();
      fetchMovements();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ── Issue to Material Store ───────────────────────────────
  const handleIssueToMS = async () => {
    if (!issueItem) return;
    const qty = parseFloat(issueQty);
    if (isNaN(qty) || qty <= 0 || qty > issueItem.closing) {
      alert("Invalid quantity (max " + issueItem.closing + ")");
      return;
    }
    setIssuing(true);
    try {
      await supabase.from("store_transfers").insert({
        from_store: "rc_store",
        to_store: "material_store",
        product_id: issueItem.product_id,
        quantity: qty,
        uom: issueItem.uom,
        status: "pending",
        notes: `Issued from RC to Material Store`,
      });
      alert("Transfer sent to Material Store.");
      fetchMovements();
      setIssueItem(null);
      setIssueQty("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIssuing(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <>
      <Header
        title="RC Store – Returnable Components"
        subtitle="Monthly stock movement and transfers"
        actions={
          <button
            className="relative btn-secondary flex items-center gap-2"
            onClick={() => setShowIncoming(true)}
          >
            <Package className="h-4 w-4" />
            {incoming.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {incoming.length}
              </span>
            )}
            Incoming
          </button>
        }
      />
      <main className="flex-1 p-6 space-y-6 print:space-y-4">
        {/* Month & Print controls */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">
              Month:
            </label>
            <input
              type="month"
              className="input"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
          </div>
          <button
            onClick={handlePrint}
            className="btn-secondary flex items-center gap-1"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>

        {/* Monthly Movement Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" /> Stock Movement – {selectedMonth}
          </h2>

          <div className="relative max-w-sm mb-3 print:hidden">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              className="input pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="card overflow-hidden">
            {loadingMovements ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                Loading…
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Package className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">
                  No stock movements for this month.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {([
                      "code",
                      "name",
                      "category",
                      "uom",
                      "opening",
                      "received",
                      "issued",
                      "closing",
                    ] as SortField[]).map(field => (
                      <th
                        key={field}
                        className={`table-th cursor-pointer select-none hover:bg-gray-100 ${
                          field !== "code" && field !== "name" && field !== "category" && field !== "uom"
                            ? "text-right"
                            : ""
                        }`}
                        onClick={() => handleSort(field)}
                      >
                        <span className="inline-flex items-center">
                          {field === "opening"
                            ? "Opening"
                            : field === "received"
                            ? "Received"
                            : field === "issued"
                            ? "Issued"
                            : field === "closing"
                            ? "Closing"
                            : field.charAt(0).toUpperCase() + field.slice(1)}
                          {renderSortIcon(field)}
                        </span>
                      </th>
                    ))}
                    <th className="table-th print:hidden"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredMovements.map(item => (
                    <tr
                      key={item.product_id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="table-td font-mono text-xs font-medium text-brand-600">
                        {item.code}
                      </td>
                      <td className="table-td font-medium text-gray-900">
                        {item.name}
                      </td>
                      <td className="table-td text-gray-500">
                        {item.category}
                      </td>
                      <td className="table-td text-xs uppercase text-gray-500">
                        {item.uom}
                      </td>
                      <td className="table-td text-right">
                        {item.opening.toFixed(3)}
                      </td>
                      <td className="table-td text-right">
                        {item.received.toFixed(3)}
                      </td>
                      <td className="table-td text-right">
                        {item.issued.toFixed(3)}
                      </td>
                      <td className="table-td text-right font-medium">
                        {item.closing.toFixed(3)}
                      </td>
                      <td className="table-td print:hidden">
                        <button
                          className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                          onClick={() => {
                            setIssueItem(item);
                            setIssueQty("");
                          }}
                        >
                          <Send className="h-3 w-3" /> Issue to MS
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Incoming Transfers modal */}
        {showIncoming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Incoming Transfers
                </h2>
                <button
                  onClick={() => setShowIncoming(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {incoming.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No pending transfers.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-2 py-1 text-left">From</th>
                      <th className="px-2 py-1 text-left">Product</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                      <th className="px-2 py-1 text-left">UOM</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incoming.map(t => (
                      <tr key={t.id}>
                        <td className="px-2 py-1">{t.from_store}</td>
                        <td className="px-2 py-1">
                          {t.product_name}{" "}
                          <span className="text-xs text-gray-400">
                            ({t.product_code})
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right">
                          {t.quantity}
                        </td>
                        <td className="px-2 py-1">{t.uom}</td>
                        <td className="px-2 py-1 text-right space-x-1">
                          <button
                            onClick={() =>
                              handleIncomingAction(t.id, "accepted")
                            }
                            className="text-xs text-green-600 hover:text-green-700"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() =>
                              handleIncomingAction(t.id, "rejected")
                            }
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Issue to Material Store modal */}
        {issueItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h2 className="text-lg font-semibold">
                Issue to Material Store: {issueItem.name}
              </h2>
              <p className="text-sm text-gray-500">
                Available (closing): {issueItem.closing.toFixed(3)}{" "}
                {issueItem.uom}
              </p>
              <input
                type="number"
                step="0.001"
                min="0"
                max={issueItem.closing}
                className="input"
                placeholder="Quantity"
                value={issueQty}
                onChange={e => setIssueQty(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => setIssueItem(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={issuing}
                  onClick={handleIssueToMS}
                >
                  {issuing ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
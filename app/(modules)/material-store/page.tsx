"use client";
import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, Package,
  AlertTriangle, Send, Bell, X, Printer, Settings2,
  ChevronDown, ChevronRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StoreType } from "@/types";

// … (types unchanged)

export default function MaterialStorePage() {
  // … (all state and logic unchanged)

  return (
    <div className="p-6">
      <PageHeader
        title="Material Store"
        subtitle="Date‑range report – all quantities in KG"
        actions={
          <button className="relative btn-secondary flex items-center gap-2" onClick={() => setShowIncoming(true)}>
            <Bell className="h-4 w-4" />
            {incoming.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {incoming.length}
              </span>
            )}
            Incoming
          </button>
        }
      />

      {/* Date range, columns, print */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">From:</label>
          <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <label className="text-sm font-medium">To:</label>
          <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => setShowColumnMenu(!showColumnMenu)}><Settings2 className="h-3.5 w-3.5" /> Columns</button>
            {showColumnMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 text-xs">
                <div className="p-2 space-y-1">
                  {Object.entries(visibleColumns).map(([key, value]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input type="checkbox" checked={value} onChange={() => toggleColumn(key as keyof typeof visibleColumns)} className="rounded border-gray-300" />
                      <span className="capitalize text-gray-600">{key.replace(/_kg$/, " (KG)").replace(/_bags$/, " (Bags)").replace(/_/g, " ")}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={handlePrint} className="btn-secondary text-xs flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Print</button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search..." className="input pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <div className="py-16 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? <div className="py-16 text-center text-gray-400">No data.</div> :
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th w-8"></th>
                {visibleColumns.code && <th className="table-th cursor-pointer" onClick={() => handleSort("code")}>Code {renderSortIcon("code")}</th>}
                {visibleColumns.name && <th className="table-th cursor-pointer" onClick={() => handleSort("displayName")}>Name {renderSortIcon("displayName")}</th>}
                {visibleColumns.category && <th className="table-th cursor-pointer" onClick={() => handleSort("category")}>Category {renderSortIcon("category")}</th>}
                {visibleColumns.uom && <th className="table-th cursor-pointer" onClick={() => handleSort("uom")}>UOM {renderSortIcon("uom")}</th>}
                {visibleColumns.reorder_level && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("reorder_level")}>Reorder {renderSortIcon("reorder_level")}</th>}
                {visibleColumns.opening_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("opening_kg")}>Opening (KG) {renderSortIcon("opening_kg")}</th>}
                {visibleColumns.received_supplier_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("received_supplier_kg")}>Recv Supplier (KG) {renderSortIcon("received_supplier_kg")}</th>}
                {visibleColumns.received_rc_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("received_rc_kg")}>Recv RC (KG) {renderSortIcon("received_rc_kg")}</th>}
                {visibleColumns.issued_wip_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("issued_wip_kg")}>Issued WIP (KG) {renderSortIcon("issued_wip_kg")}</th>}
                {visibleColumns.closing_kg && <th className="table-th cursor-pointer text-right" onClick={() => handleSort("closing_kg")}>Closing (KG) {renderSortIcon("closing_kg")}</th>}
                {visibleColumns.closing_bags && <th className="table-th text-right">Closing (Bags)</th>}
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => {
                const isParent = item.isParent;
                const isChild = !!item.parent_product_id;
                const isExpanded = expandedParents.has(item.product_id);
                if (isChild && item.parent_product_id && !expandedParents.has(item.parent_product_id)) return null;
                const low = item.closing_kg <= item.reorder_level && item.reorder_level > 0;
                const hasBags = item.uom === "bags" && item.conversion_kg != null;
                const toBags = (kg: number) => (kg / item.conversion_kg!).toFixed(3);
                return (
                  <tr key={item.product_id} className={cn("hover:bg-gray-50", low && "bg-amber-50", isChild && "bg-gray-50/50")}>
                    <td className="table-td w-8 text-xs font-medium text-gray-700">
                      {isParent && <button onClick={() => toggleExpand(item.product_id)}>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}
                    </td>
                    {visibleColumns.code && <td className={cn("table-td text-xs font-medium font-mono text-brand-600", isChild && "pl-6")}>{item.code}</td>}
                    {visibleColumns.name && <td className={cn("table-td text-xs font-medium text-gray-700", isChild && "pl-6")}>{isChild && "└ "}{item.displayName}{low && <AlertTriangle className="h-3 w-3 text-amber-500 inline ml-1" />}</td>}
                    {visibleColumns.category && <td className="table-td text-xs font-medium text-gray-700">{item.category}</td>}
                    {visibleColumns.uom && <td className="table-td text-xs font-medium text-gray-700 uppercase">{item.uom}</td>}
                    {visibleColumns.reorder_level && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.reorder_level}</td>}
                    {visibleColumns.opening_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.opening_kg.toFixed(3)}</td>}
                    {visibleColumns.received_supplier_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.received_supplier_kg.toFixed(3)}</td>}
                    {visibleColumns.received_rc_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.received_rc_kg.toFixed(3)}</td>}
                    {visibleColumns.issued_wip_kg && <td className="table-td text-xs font-medium text-gray-700 text-right">{item.issued_wip_kg.toFixed(3)}</td>}
                    {visibleColumns.closing_kg && <td className="table-td text-xs font-medium text-gray-700 text-right font-semibold">{item.closing_kg.toFixed(3)}</td>}
                    {visibleColumns.closing_bags && <td className="table-td text-xs font-medium text-gray-700 text-right">{hasBags ? toBags(item.closing_kg) : "—"}</td>}
                    <td className="table-td text-xs font-medium text-right">{!isParent && <button className="text-brand-600 hover:text-brand-700" onClick={() => { setIssueItem(item); setIssueQtyKg(""); setIssueQtyBags(""); }}><Send className="h-3 w-3 inline" /> Issue to WIP</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>}
      </div>

      {/* modals unchanged … */}
    </div>
  );
}
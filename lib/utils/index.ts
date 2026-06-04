import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import type { StoreType, RequisitionStatus, DispatchStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = "dd MMM yyyy") {
  return format(new Date(date), fmt);
}

export function formatNumber(n: number, decimals = 2) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const STORE_LABELS: Record<StoreType, string> = {
  material_store:    "Material Store",
  production_storage:"Production Storage",
  wip:               "WIP",
  rc_store:          "RC Store",
  finished_goods:    "Finished Goods",
};

export const STORE_COLORS: Record<StoreType, string> = {
  material_store:    "bg-blue-50 text-blue-700 border-blue-200",
  production_storage:"bg-indigo-50 text-indigo-700 border-indigo-200",
  wip:               "bg-amber-50 text-amber-700 border-amber-200",
  rc_store:          "bg-gray-50 text-gray-700 border-gray-200",
  finished_goods:    "bg-green-50 text-green-700 border-green-200",
};

export const REQ_STATUS_COLORS: Record<RequisitionStatus, string> = {
  draft:     "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-700",
  approved:  "bg-green-100 text-green-700",
  issued:    "bg-teal-100 text-teal-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-400",
};

export const DISPATCH_STATUS_COLORS: Record<DispatchStatus, string> = {
  pending:    "bg-gray-100 text-gray-600",
  loaded:     "bg-amber-100 text-amber-700",
  dispatched: "bg-blue-100 text-blue-700",
  delivered:  "bg-green-100 text-green-700",
};

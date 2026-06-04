import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import {
  Truck, FileText, Wrench, Package,
  Send, ArrowRight, TrendingUp,
} from "lucide-react";
import Link from "next/link";

const STAT_CARDS = [
  { label: "Gate Passes Today",    value: "—", icon: Truck,    color: "text-blue-600",  bg: "bg-blue-50",  href: "/gate-pass" },
  { label: "Pending Requisitions", value: "—", icon: FileText, color: "text-indigo-600",bg: "bg-indigo-50",href: "/requisitions" },
  { label: "Active WIP Batches",   value: "—", icon: Wrench,   color: "text-amber-600", bg: "bg-amber-50", href: "/wip" },
  { label: "FG Ready to Dispatch", value: "—", icon: Package,  color: "text-green-600", bg: "bg-green-50", href: "/finished-goods" },
];

const FLOW_STAGES = [
  { label: "Material",         sub: "Raw input",    color: "bg-gray-100 text-gray-600",    href: "/gate-pass" },
  { label: "Material Store",   sub: "O+R–C",        color: "bg-blue-100 text-blue-700",    href: "/stock-balance" },
  { label: "Prod. Storage",    sub: "O+R–C",        color: "bg-indigo-100 text-indigo-700",href: "/requisitions" },
  { label: "WIP",              sub: "O+R–C",        color: "bg-amber-100 text-amber-700",  href: "/wip" },
  { label: "Finished Goods",   sub: "QC passed",    color: "bg-green-100 text-green-700",  href: "/finished-goods" },
  { label: "Dispatch",         sub: "Delivery out", color: "bg-teal-100 text-teal-700",    href: "/dispatch" },
];

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-60">
        <Header
          title="Dashboard"
          subtitle="Material flow overview"
          actions={
            <div className="flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-xs font-medium text-brand-600">Live</span>
            </div>
          }
        />

        <main className="flex-1 p-6 space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {STAT_CARDS.map(({ label, value, icon: Icon, color, bg, href }) => (
              <Link key={label} href={href}
                className="card p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between mb-3">
                  <div className={`rounded-lg p-2 ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </Link>
            ))}
          </div>

          {/* Flow pipeline */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Material Flow Pipeline</h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {FLOW_STAGES.map((stage, i) => (
                <div key={stage.label} className="flex items-center gap-2 flex-shrink-0">
                  <Link href={stage.href}
                    className={`rounded-xl px-4 py-3 text-center hover:opacity-80 transition-opacity cursor-pointer ${stage.color}`}
                    style={{ minWidth: 110 }}>
                    <p className="text-xs font-semibold">{stage.label}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">{stage.sub}</p>
                  </Link>
                  {i < FLOW_STAGES.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "New Gate Pass",    href: "/gate-pass/new",    icon: Truck },
                { label: "New Requisition",  href: "/requisitions/new", icon: FileText },
                { label: "New WIP Batch",    href: "/wip/new",          icon: Wrench },
                { label: "New Dispatch",     href: "/dispatch/new",     icon: Send },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

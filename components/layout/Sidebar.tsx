"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Truck, FileText, Wrench,
  RotateCcw, Package, Send, BarChart3, ShoppingBag,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@supabase/ssr";

const NAV = [
  { label: "Dashboard",        href: "/dashboard",                icon: LayoutDashboard },
  { label: "Gate Pass",        href: "/gate-pass",                icon: Truck },
  { label: "Requisitions",     href: "/requisitions",             icon: FileText },
  { label: "WIP Batches",      href: "/wip",                      icon: Wrench },
  { label: "RC Store",         href: "/rc-store",                 icon: RotateCcw },
  { label: "Finished Goods",   href: "/finished-goods",           icon: Package },
  { label: "Dispatch",         href: "/dispatch",                 icon: Send },
  { label: "Stock Balance",    href: "/stock-balance",            icon: BarChart3 },
  { label: "Products",         href: "/products",                 icon: ShoppingBag },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-gray-100 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-gray-100 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-400">
          <Package className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">MaterialFlow</p>
          <p className="text-[10px] text-gray-400">by OneAccounts</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Modules
        </p>
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "sidebar-item",
                active && "active"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3 w-3" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer with Sign Out */}
      <div className="border-t border-gray-100 p-4 space-y-2">
        <button
          onClick={handleSignOut}
          className="w-full text-left text-xs text-gray-500 hover:text-red-600 transition-colors flex items-center gap-2"
        >
          <span className="text-base">🚪</span> Sign Out
        </button>
        <p className="text-[10px] text-gray-400 text-center">
          O + R – C &nbsp;|&nbsp; Material Management v0.1
        </p>
      </div>
    </aside>
  );
}
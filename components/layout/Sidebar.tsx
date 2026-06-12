"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Truck, Warehouse, Package, Wrench,
  RotateCcw, BarChart3, ShoppingBag, Send,
  ChevronRight, Settings, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@supabase/ssr";
import { useState, useEffect } from "react";

// Each item lists which roles can see it. "*" means everyone.
const NAV = [
  { label: "Dashboard",        href: "/dashboard",                icon: LayoutDashboard, roles: ["*"] },
  { label: "Gate Pass",        href: "/gate-pass",                icon: Truck,           roles: ["super_admin","admin","store_keeper","gate_pass_operator"] },
  { label: "Outward Gate Pass",href: "/outward-gate-pass",        icon: Send,            roles: ["super_admin","admin","gate_pass_operator"] },
  { label: "Material Store",   href: "/material-store",           icon: Warehouse,       roles: ["super_admin","admin","store_keeper"] },
  { label: "Parts Store",      href: "/parts-store",              icon: Package,         roles: ["super_admin","admin","store_keeper"] },
  { label: "WIP Batches",      href: "/wip",                      icon: Wrench,          roles: ["super_admin","admin","wip_operator"] },
  { label: "RC Store",         href: "/rc-store",                 icon: RotateCcw,       roles: ["super_admin","admin","rc_store_keeper"] },
  { label: "Finished Goods",   href: "/finished-goods",           icon: Package,         roles: ["super_admin","admin","wip_operator"] },
  { label: "Stock Balance",    href: "/stock-balance",            icon: BarChart3,       roles: ["super_admin","admin","viewer","store_keeper","wip_operator","rc_store_keeper","gate_pass_operator"] },
  { label: "Products",         href: "/products",                 icon: ShoppingBag,     roles: ["super_admin","admin"] },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [companyName, setCompanyName] = useState("MaterialFlow");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("company_name, logo_url")
        .limit(1)
        .maybeSingle();
      if (data) {
        setCompanyName(data.company_name || "MaterialFlow");
        setLogoUrl(data.logo_url || null);
      }
    };

    const fetchRoles = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (data) setUserRoles(data.map(r => r.role));
    };

    fetchSettings();
    fetchRoles();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // Filter nav items based on user's roles
  const visibleNav = NAV.filter(item => {
    if (item.roles.includes("*")) return true;
    return item.roles.some(role => userRoles.includes(role));
  });

  const isAdmin = userRoles.includes("admin") || userRoles.includes("super_admin");

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-gray-100 bg-white">
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-2 border-b border-gray-100 px-5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => router.push("/dashboard/settings")}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-400">
            <Package className="h-4 w-4 text-white" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-gray-900">{companyName}</p>
          <p className="text-[10px] text-gray-400">by OneAccounts</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Modules
        </p>
        {visibleNav.map(({ label, href, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn("sidebar-item", active && "active")}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3 w-3" />}
            </Link>
          );
        })}

        <div className="border-t border-gray-100 my-2" />

        {/* Admin */}
        {isAdmin && (
          <Link
            href="/dashboard/admin"
            className={cn("sidebar-item", path === "/dashboard/admin" && "active")}
          >
            <Shield className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">Admin</span>
          </Link>
        )}

        {/* Settings */}
        <Link
          href="/dashboard/settings"
          className={cn("sidebar-item", path.startsWith("/dashboard/settings") && "active")}
        >
          <Settings className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Settings</span>
        </Link>
      </nav>

      {/* Footer */}
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
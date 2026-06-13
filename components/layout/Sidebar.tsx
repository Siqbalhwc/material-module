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

const NAV = [
  { label: "Dashboard",        href: "/dashboard",                icon: LayoutDashboard, roles: ["*"] },
  { label: "Gate Pass",        href: "/gate-pass",                icon: Truck,           roles: ["super_admin","admin","store_keeper","gate_pass_operator"] },
  { label: "Outward Gate Pass",href: "/outward-gate-pass",        icon: Send,            roles: ["super_admin","admin","gate_pass_operator"] },
  { label: "Material Store",   href: "/material-store",           icon: Warehouse,       roles: ["super_admin","admin","store_keeper"] },
  { label: "Parts Store",      href: "/parts-store",              icon: Package,         roles: ["super_admin","admin","store_keeper"] },
  { label: "WIP Batches",      href: "/wip",                      icon: Wrench,          roles: ["super_admin","admin","wip_operator"] },
  { label: "RC Store",         href: "/rc-store",                 icon: RotateCcw,       roles: ["super_admin","admin","rc_store_keeper"] },
  { label: "Finished Goods",   href: "/finished-goods",           icon: Package,         roles: ["super_admin","admin","wip_operator"] },
  { label: "Stock Balance",    href: "/stock-balance",            icon: BarChart3,       roles: ["super_admin","admin"] },
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

  const visibleNav = NAV.filter(item => {
    if (item.roles.includes("*")) return true;
    return item.roles.some(role => userRoles.includes(role));
  });

  const isAdmin = userRoles.includes("admin") || userRoles.includes("super_admin");

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-white/10" style={{
      background: "linear-gradient(180deg, #0B1E5B 0%, #0F2A7A 25%, #0D3B9E 50%, #0B2E80 75%, #091A54 100%)",
    }}>
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-2 border-b border-white/10 px-5 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => router.push("/dashboard/settings")}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
            <Package className="h-4 w-4 text-white" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-white">{companyName}</p>
          <p className="text-[10px] text-white/50">by OneAccounts</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
          Modules
        </p>
        {visibleNav.map(({ label, href, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3 w-3 opacity-60" />}
            </Link>
          );
        })}

        {/* Admin only links */}
        {isAdmin && (
          <>
            <div className="border-t border-white/10 my-2" />
            <Link
              href="/dashboard/admin"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                path === "/dashboard/admin"
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Shield className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Admin</span>
            </Link>
            <Link
              href="/dashboard/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                path.startsWith("/dashboard/settings")
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Settings</span>
            </Link>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4 space-y-2">
        <button
          onClick={handleSignOut}
          className="w-full text-left text-xs text-white/60 hover:text-white transition-colors flex items-center gap-2"
        >
          <span className="text-base">🚪</span> Sign Out
        </button>
        <p className="text-[10px] text-white/30 text-center">
          O + R – C &nbsp;|&nbsp; Material Management v0.1
        </p>
      </div>
    </aside>
  );
}
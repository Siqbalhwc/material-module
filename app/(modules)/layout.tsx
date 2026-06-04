import Sidebar from "@/components/layout/Sidebar";

export default function ModulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-60">
        {children}
      </div>
    </div>
  );
}

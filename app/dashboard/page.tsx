export default function DashboardPage() {
  const stages = [
    { label: "Material", desc: "Raw input", color: "bg-blue-100 text-blue-800", icon: "🧱" },
    { label: "Material Store", desc: "O+R–C", color: "bg-indigo-100 text-indigo-800", icon: "🏗️" },
    { label: "Prod. Storage", desc: "O+R–C", color: "bg-purple-100 text-purple-800", icon: "📦" },
    { label: "WIP", desc: "O+R–C", color: "bg-orange-100 text-orange-800", icon: "⚙️" },
    { label: "RC Store", desc: "O+R–C", color: "bg-pink-100 text-pink-800", icon: "♻️" },
    { label: "Finished Goods", desc: "QC passed", color: "bg-green-100 text-green-800", icon: "✅" },
    { label: "Dispatch", desc: "Delivery out", color: "bg-teal-100 text-teal-800", icon: "🚚" },
  ];

  const quickActions = [
    { label: "New Gate Pass", href: "/gate-pass/new", color: "bg-blue-600 hover:bg-blue-700" },
    { label: "New Requisition", href: "/requisitions/new", color: "bg-indigo-600 hover:bg-indigo-700" },
    { label: "New WIP Batch", href: "/wip/new", color: "bg-purple-600 hover:bg-purple-700" },
    { label: "New Dispatch", href: "/dispatch/new", color: "bg-teal-600 hover:bg-teal-700" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">
        📦 Material Dashboard
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Material flow overview – gate pass to dispatch
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Gate Passes Today", value: 0, color: "bg-blue-100 text-blue-800" },
          { label: "Pending Requisitions", value: 0, color: "bg-orange-100 text-orange-800" },
          { label: "Active WIP Batches", value: 0, color: "bg-purple-100 text-purple-800" },
          { label: "FG Ready to Dispatch", value: 0, color: "bg-green-100 text-green-800" },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl p-4 shadow-sm border ${card.color}`}>
            <div className="text-3xl font-bold">{card.value}</div>
            <div className="text-xs font-medium mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Material Flow Pipeline */}
      <div className="bg-white rounded-xl border p-6 mb-8">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          🔄 Material Flow Pipeline
        </h2>
        <div className="flex flex-wrap gap-3">
          {stages.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-2">
              <div className={`rounded-xl px-4 py-3 text-center shadow-sm border ${stage.color} min-w-[120px]`}>
                <div className="text-2xl mb-1">{stage.icon}</div>
                <div className="font-semibold text-sm">{stage.label}</div>
                <div className="text-xs opacity-75">{stage.desc}</div>
              </div>
              {i < stages.length - 1 && (
                <div className="text-gray-300 text-xl">→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-gray-800 mb-4">⚡ Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className={`text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition ${action.color}`}
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
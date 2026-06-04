export default function DashboardPage() {
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

      {/* Pipeline section */}
      <div className="bg-white rounded-xl border p-4 text-sm text-gray-600">
        <h2 className="font-semibold text-gray-800 mb-2">
          Material Flow Pipeline
        </h2>
        <div className="flex flex-wrap gap-2">
          <span className="bg-gray-100 px-2 py-1 rounded-full text-xs">
            Material → Store → Production → WIP → RC Store → FG → Dispatch
          </span>
        </div>
      </div>
    </div>
  );
}
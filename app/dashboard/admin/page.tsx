"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Plus, Settings } from "lucide-react";
import Link from "next/link";

const AVAILABLE_ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "store_keeper", label: "Store Keeper" },
  { value: "wip_operator", label: "WIP Operator" },
  { value: "viewer", label: "Viewer" },
];

export default function AdminPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isAuthorised, setIsAuthorised] = useState(false);

  // Check if current user is super_admin or admin
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        console.log("No user");
        return;
      }
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .then(({ data, error }) => {
          console.log("roles data:", data, "error:", error);
          const authorised =
            data?.some(
              r => r.role === "super_admin" || r.role === "admin"
            ) ?? false;
          console.log("isAuthorised:", authorised);
          setIsAuthorised(authorised);
        });
    });
  }, []);

  const fetchUsers = async () => {
  setLoading(true);
  try {
    // Get the current session's access token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("No active session");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error("API error:", res.status, await res.text());
      setError(`Failed to load users (status ${res.status})`);
      setUsers([]);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  } catch (err: any) {
    console.error("Fetch users failed:", err);
    setError(err.message || "Network error");
  }
  setLoading(false);
};

  useEffect(() => {
    if (isAuthorised) fetchUsers();
  }, [isAuthorised]);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleCreate = async () => {
  if (!email || !password) return;
  setSaving(true);
  setError("");
  setMessage("");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    setError("No active session");
    setSaving(false);
    return;
  }

  const res = await fetch("/api/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, fullName, roles: selectedRoles }),
  });
  const data = await res.json();
  if (data.success) {
    setMessage("User created!");
    setEmail(""); setPassword(""); setFullName(""); setSelectedRoles([]);
    setShowForm(false);
    fetchUsers();
  } else {
    setError(data.error);
  }
  setSaving(false);
};

  // Update roles for an existing user
  const handleUpdateRoles = async (userId: string, newRoles: string[]) => {
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, roles: newRoles }),
    });
    fetchUsers();
  };

  if (!isAuthorised) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600 font-medium">
        Access Denied – Admin or Super Admin only
      </div>
    );
  }

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500">
              Invite team members, assign roles, and manage company settings
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-primary inline-flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> Add User
            </button>
            <Link
              href="/dashboard/settings"
              className="btn-secondary inline-flex items-center gap-1"
            >
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Add User Form */}
        {showForm && (
          <div className="card p-6 max-w-xl space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">New User</h2>
            <div>
              <label className="label">Full Name</label>
              <input
                className="input"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Roles</label>
              <div className="flex flex-wrap gap-3 mt-2">
                {AVAILABLE_ROLES.map(role => (
                  <label
                    key={role.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.value)}
                      onChange={() => toggleRole(role.value)}
                      className="rounded border-gray-300"
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={saving}
                onClick={handleCreate}
              >
                {saving ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No users yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th text-left">Name</th>
                  <th className="table-th text-left">Email</th>
                  <th className="table-th text-left">Roles</th>
                  <th className="table-th text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="table-td font-medium">
                      {u.fullName || "—"}
                    </td>
                    <td className="table-td">{u.email}</td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles || []).map((r: string) => (
                          <span
                            key={r}
                            className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                          >
                            {r.replace("_", " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="table-td">
                      <RoleEditor
                        currentRoles={u.roles || []}
                        availableRoles={AVAILABLE_ROLES.map(r => r.value)}
                        onSave={newRoles =>
                          handleUpdateRoles(u.id, newRoles)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// Inline role editor component
function RoleEditor({
  currentRoles,
  availableRoles,
  onSave,
}: {
  currentRoles: string[];
  availableRoles: string[];
  onSave: (roles: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentRoles);

  const toggle = (role: string) =>
    setSelected(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );

  return (
    <div className="relative">
      <button
        className="text-xs text-gray-500 hover:text-brand-600 underline"
        onClick={() => setOpen(!open)}
      >
        Edit
      </button>
      {open && (
        <div className="absolute left-0 top-6 bg-white border border-gray-200 rounded-md shadow-lg p-3 z-20 w-48">
          <div className="space-y-1 mb-2">
            {availableRoles.map(role => (
              <label
                key={role}
                className="flex items-center gap-2 text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(role)}
                  onChange={() => toggle(role)}
                  className="rounded border-gray-300"
                />
                {role.replace("_", " ")}
              </label>
            ))}
          </div>
          <div className="flex justify-between">
            <button
              className="text-xs text-green-600 hover:text-green-700"
              onClick={() => {
                onSave(selected);
                setOpen(false);
              }}
            >
              Save
            </button>
            <button
              className="text-xs text-gray-400 hover:text-gray-500"
              onClick={() => {
                setSelected(currentRoles);
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
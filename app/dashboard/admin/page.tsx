"use client";
import { useState, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { createBrowserClient } from "@supabase/ssr";
import { Plus, Settings, X, Pencil } from "lucide-react";
import Link from "next/link";

const AVAILABLE_ROLES = [
  { value: "super_admin", label: "Super Admin", desc: "Full access to all modules and settings" },
  { value: "admin", label: "Admin", desc: "Manage users, view all modules" },
  { value: "store_keeper", label: "Store Keeper", desc: "Material Store, Parts Store, Inward Gate Pass" },
  { value: "gate_pass_operator", label: "Gate Pass Operator", desc: "Inward and Outward Gate Pass" },
  { value: "wip_operator", label: "WIP Operator", desc: "WIP, Production entries" },
  { value: "rc_store_keeper", label: "RC Store Keeper", desc: "RC Store management" },
  { value: "viewer", label: "Viewer", desc: "Read‑only access to reports" },
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  // Edit user modal
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setChecking(false); return; }
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .then(({ data }) => {
          const superAdmin = data?.some(r => r.role === "super_admin") ?? false;
          const admin = data?.some(r => r.role === "super_admin" || r.role === "admin") ?? false;
          setIsSuperAdmin(superAdmin);
          setIsAuthorised(admin);
          setChecking(false);
        });
    });
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("No active session"); setLoading(false); return; }

      const res = await fetch("/api/users", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) { setError(`Failed to load users (status ${res.status})`); setUsers([]); }
      else {
        let data = await res.json();
        if (Array.isArray(data)) {
          if (!isSuperAdmin) {
            data = data.filter((u: any) => !(u.roles || []).includes("super_admin"));
          }
          setUsers(data);
        }
      }
    } catch (err: any) { setError(err.message || "Network error"); }
    setLoading(false);
  };

  useEffect(() => { if (isAuthorised) fetchUsers(); }, [isAuthorised, isSuperAdmin]);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const handleCreate = async () => {
    if (!email || !password) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("No active session"); setSaving(false); return; }

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
    } else { setError(data.error); }
    setSaving(false);
  };

  const openEdit = (u: any) => {
    setEditUser(u);
    setEditName(u.fullName || "");
    setEditEmail(u.email || "");
    setEditPassword("");
    setEditRoles(u.roles || []);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("No active session"); setSaving(false); return; }

    // Update user metadata via API
    const body: any = { userId: editUser.id, fullName: editName, email: editEmail, roles: editRoles };
    if (editPassword) body.password = editPassword;

    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      setMessage("User updated!");
      setEditUser(null);
      fetchUsers();
    } else { setError(data.error || "Update failed"); }
    setSaving(false);
  };

  if (checking) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>;
  if (!isAuthorised) return <div className="flex items-center justify-center h-screen text-red-600 font-medium">Access Denied – Admin or Super Admin only</div>;

  return (
    <div className="p-6">
      <PageHeader
        title="User Management"
        subtitle="Invite team members, assign roles, and manage company settings"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add User
            </button>
            <Link href="/dashboard/settings" className="btn-secondary inline-flex items-center gap-1">
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
        }
      />

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4">{message}</div>}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Add User Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">New User</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="label">Roles</label>
              <div className="flex flex-wrap gap-3 mt-2">
                {AVAILABLE_ROLES.map(role => (
                  <label key={role.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedRoles.includes(role.value)} onChange={() => toggleRole(role.value)} className="rounded border-gray-300" />
                    <span>
                      <span className="font-medium">{role.label}</span>
                      <span className="text-gray-400 text-xs ml-1">– {role.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={handleCreate}>{saving ? "Creating…" : "Create User"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Edit User</h2>
              <button onClick={() => setEditUser(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">New Password (leave blank to keep current)</label>
              <input className="input" type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} />
            </div>
            <div>
              <label className="label">Roles</label>
              <div className="flex flex-wrap gap-3 mt-2">
                {AVAILABLE_ROLES.map(role => (
                  <label key={role.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={editRoles.includes(role.value)} onChange={() => setEditRoles(prev => prev.includes(role.value) ? prev.filter(r => r !== role.value) : [...prev, role.value])} className="rounded border-gray-300" />
                    <span>
                      <span className="font-medium">{role.label}</span>
                      <span className="text-gray-400 text-xs ml-1">– {role.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={handleUpdate}>{saving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-hidden">
        {loading ? <div className="py-16 text-center text-gray-400">Loading users…</div> :
          users.length === 0 ? <div className="py-16 text-center text-gray-400">No users yet</div> :
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap text-left">Name</th>
                <th className="table-th whitespace-nowrap text-left">Email</th>
                <th className="table-th whitespace-nowrap text-left">Roles</th>
                {isSuperAdmin && <th className="table-th whitespace-nowrap text-left">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="table-td text-xs font-medium text-gray-700">{u.fullName || "—"}</td>
                  <td className="table-td text-xs font-medium text-gray-700">{u.email}</td>
                  <td className="table-td text-xs font-medium text-gray-700">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles || []).map((r: string) => (
                        <span key={r} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{r.replace("_", " ")}</span>
                      ))}
                    </div>
                  </td>
                  {isSuperAdmin && (
                    <td className="table-td text-xs font-medium">
                      <button onClick={() => openEdit(u)} className="text-blue-600 hover:text-blue-700">
                        <Pencil className="h-3.5 w-3.5 inline" /> Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  );
}
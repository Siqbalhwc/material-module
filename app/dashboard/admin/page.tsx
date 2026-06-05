"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus } from "lucide-react"

const AVAILABLE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "gate_pass", label: "Gate Pass" },
  { value: "wip", label: "WIP" },
  { value: "rc_store", label: "RC Store" },
  { value: "finished_goods", label: "Finished Goods" },
  { value: "dispatch", label: "Dispatch" },
]

export default function AdminPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .then(({ data }) => {
          setIsAdmin(data?.some(r => r.role === "admin") ?? false)
        })
    })
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch("/api/users")
    const data = await res.json()
    setUsers(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) fetchUsers() }, [isAdmin])

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const handleAdd = async () => {
    if (!email || !password) return
    setSaving(true)
    setError("")
    setMessage("")

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName, roles: selectedRoles }),
    })
    const data = await res.json()
    if (data.success) {
      setMessage("User created!")
      setEmail(""); setPassword(""); setFullName(""); setSelectedRoles([])
      setShowForm(false)
      fetchUsers()
    } else {
      setError(data.error)
    }
    setSaving(false)
  }

  if (!isAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: "red" }}>Access Denied – Admin only</div>
  }

  return (
    <div style={{ padding: 24, background: "#f9fafb", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#111827" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>👥 User Management</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>Invite team members and assign roles</p>

      {message && <div style={{ background: "#ecfdf5", color: "#065f46", padding: 10, borderRadius: 8, marginBottom: 12 }}>{message}</div>}
      {error && <div style={{ background: "#fef2f2", color: "#991b1b", padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      <button
        onClick={() => setShowForm(!showForm)}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, background: "#4ade80", color: "white", border: "none", cursor: "pointer", marginBottom: 20 }}
      >
        <Plus size={16} /> Add User
      </button>

      {showForm && (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: 20, marginBottom: 20, maxWidth: 400 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Full Name</label>
            <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }} value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Email</label>
            <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Password</label>
            <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }} type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Roles</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {AVAILABLE_ROLES.map(role => (
                <label key={role.value} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedRoles.includes(role.value)} onChange={() => toggleRole(role.value)} />
                  {role.label}
                </label>
              ))}
            </div>
          </div>
          <button onClick={handleAdd} disabled={saving} style={{ padding: "10px 20px", borderRadius: 8, background: "#4ade80", color: "white", border: "none", cursor: "pointer" }}>
            {saving ? "Creating..." : "Create User"}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading users...</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
              <th style={{ padding: 12 }}>Name</th>
              <th style={{ padding: 12 }}>Email</th>
              <th style={{ padding: 12 }}>Roles</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: 12, fontWeight: 600 }}>{u.fullName || "—"}</td>
                <td style={{ padding: 12 }}>{u.email}</td>
                <td style={{ padding: 12 }}>{(u.roles || []).join(", ")}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>No users yet</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
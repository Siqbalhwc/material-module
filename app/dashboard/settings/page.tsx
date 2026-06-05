"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Upload, Save } from "lucide-react"
import { useRouter } from "next/navigation"

export default function CompanySettingsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyName, setCompanyName] = useState("MaterialFlow")
  const [logoUrl, setLogoUrl] = useState("")
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load existing settings
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle()

      if (data) {
        setCompanyName(data.company_name || "MaterialFlow")
        setLogoUrl(data.logo_url || "")
        if (data.logo_url) setLogoPreview(data.logo_url)
      }
      setLoading(false)
    }
    fetchSettings()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onload = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage("")

    let newLogoUrl = logoUrl

    // Upload new logo if provided
    if (logoFile) {
      const fileExt = logoFile.name.split(".").pop()
      const fileName = `logo-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, logoFile, { upsert: true, contentType: logoFile.type })

      if (uploadError) {
        setMessage("Failed to upload logo.")
        setSaving(false)
        return
      }

      const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(fileName)
      newLogoUrl = publicUrlData?.publicUrl || ""
    }

    // Upsert settings (always update the first row, id=1)
    const { error } = await supabase
      .from("company_settings")
      .upsert({ id: 1, company_name: companyName, logo_url: newLogoUrl, updated_at: new Date().toISOString() })

    if (error) {
      setMessage("Error saving settings: " + error.message)
      setSaving(false)
      return
    }

    setMessage("✅ Settings saved! Refreshing page…")
    setLogoUrl(newLogoUrl)
    setLogoFile(null)

    setTimeout(() => {
      window.location.reload()
    }, 1500)
    setSaving(false)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading…</div>
  }

  return (
    <div style={{ padding: 24, background: "#f9fafb", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#111827" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🏢 Company Settings</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>Update your brand name and logo</p>

        {message && (
          <div style={{
            background: message.startsWith("✅") ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${message.startsWith("✅") ? "#10b981" : "#ef4444"}`,
            color: message.startsWith("✅") ? "#065f46" : "#991b1b",
            padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13
          }}>
            {message}
          </div>
        )}

        <div style={{
          background: "white", borderRadius: 12, border: "1px solid #e5e7eb",
          padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          marginBottom: 16
        }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 4, display: "block" }}>Company Name</label>
            <input
              style={{
                width: "100%", height: 42, border: "1.5px solid #d1d5db",
                borderRadius: 9, padding: "0 14px", fontSize: 14,
                background: "#f9fafb", color: "#111827", outline: "none"
              }}
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: 4, display: "block" }}>Company Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 100, height: 100, borderRadius: 12,
                  border: "2px dashed #d1d5db",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", overflow: "hidden", background: "#f9fafb"
                }}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ textAlign: "center", color: "#9ca3af" }}>
                    <Upload size={20} />
                    <div style={{ fontSize: 10, marginTop: 4 }}>Upload</div>
                  </div>
                )}
              </div>
              <div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Click to upload a new logo</p>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>PNG, JPG or SVG. Best size: 200×200px</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} hidden />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "12px 24px", borderRadius: 9, fontSize: 14,
              fontWeight: 600, border: "none", cursor: "pointer",
              background: saving ? "#9ca3af" : "#4ade80", color: "white",
            }}
          >
            <Save size={16} /> {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  )
}
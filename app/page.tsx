"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // If already logged in, go straight to dashboard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.push("/dashboard")
    })
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      setError("Incorrect email or password. Please try again.")
      setLoading(false)
      return
    }

    router.push("/dashboard")
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 50%, #e0f7fa 100%)",
        fontFamily: "Arial",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Water wave background */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0.4,
          }}
        >
          <path
            fill="#ffffff"
            fillOpacity="0.3"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0.2,
            animation: "waveMove 8s infinite alternate ease-in-out",
          }}
        >
          <path
            fill="#ffffff"
            fillOpacity="0.2"
            d="M0,288L48,272C96,256,192,224,288,213.3C384,203,480,213,576,224C672,235,768,245,864,234.7C960,224,1056,192,1152,176C1248,160,1344,160,1392,160L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
        <style>{`
          @keyframes waveMove {
            0% { transform: translateX(0); }
            100% { transform: translateX(-20px); }
          }
        `}</style>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          padding: 32,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.6)",
          width: "100%",
          maxWidth: 400,
          position: "relative",
          zIndex: 1,
          boxShadow: "0 12px 24px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src="/logo.png"
            alt="OneAccounts"
            style={{ width: 60, height: 60, borderRadius: 12, objectFit: "contain", marginBottom: 8 }}
          />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1E293B", margin: 0 }}>
            OneAccounts
          </h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            Material Module
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "#FEF2F2",
              color: "#B91C1C",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #E2E8F0",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Password
          </label>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "8px 40px 8px 12px",
                border: "1px solid #E2E8F0",
                borderRadius: 6,
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94A3B8",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 10,
              background: loading ? "#94A3B8" : "#1D4ED8",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>
      </div>
    </div>
  )
}
"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff } from "lucide-react"

const PILLS = [
  "Journal Entries", "Sales & Purchase", "Balance Sheet",
  "Customers & Vendors", "PKR Native", "100% Cloud",
]
const STATS = [
  { value: "14+",  label: "Modules"   },
  { value: "100%", label: "Cloud"     },
  { value: "PKR",  label: "Currency"  },
  { value: "Live", label: "Real-time" },
]

export default function LoginPage() {
  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState("")
  const [isSignUp,     setIsSignUp]     = useState(false)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(isSignUp
        ? "Sign up failed — this email may already be registered."
        : "Incorrect email or password. Please try again.")
      setLoading(false)
      return
    }
    if (isSignUp) {
      setError("✅ Account created! Check your email to confirm, then sign in.")
      setIsSignUp(false)
      setLoading(false)
      return
    }

    window.location.href = "/dashboard"
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          height: 100%;
          font-family: 'Plus Jakarta Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .oa-shell {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          align-items: center;
          justify-content: center;
          padding: 24px 20px;
          position: relative;
          overflow: hidden;
          background: #0B1E5B;
        }

        .oa-water-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background:
            linear-gradient(180deg,
              #0B1E5B 0%,
              #0F2A7A 25%,
              #0D3B9E 50%,
              #0B2E80 75%,
              #091A54 100%);
        }

        .oa-water-bg::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 40% at 20% 60%, rgba(30,85,232,0.25) 0%, transparent 60%),
            radial-gradient(ellipse 60% 30% at 80% 40%, rgba(23,64,200,0.20) 0%, transparent 55%),
            radial-gradient(ellipse 100% 50% at 50% 80%, rgba(15,34,128,0.30) 0%, transparent 65%);
          animation: waterShimmer 8s ease-in-out infinite alternate;
        }

        .oa-water-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 60px,
              rgba(255,255,255,0.018) 60px,
              rgba(255,255,255,0.018) 61px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 80px,
              rgba(255,255,255,0.012) 80px,
              rgba(255,255,255,0.012) 81px
            );
          animation: waterRipple 12s linear infinite;
        }

        .oa-waves {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          z-index: 0;
          opacity: 0.18;
        }
        .oa-waves .wave1 { animation: waveMove 7s linear infinite; }
        .oa-waves .wave2 { animation: waveMove 10s linear infinite reverse; opacity: 0.6; }
        .oa-waves .wave3 { animation: waveMove 13s linear infinite; opacity: 0.4; }

        @keyframes waterShimmer {
          0%   { opacity: 0.6; transform: scale(1); }
          100% { opacity: 1;   transform: scale(1.04); }
        }
        @keyframes waterRipple {
          0%   { transform: translateY(0); }
          100% { transform: translateY(61px); }
        }
        @keyframes waveMove {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .oa-particle {
          position: fixed;
          border-radius: 50%;
          background: rgba(147, 197, 253, 0.12);
          animation: particleFloat linear infinite;
          z-index: 0;
          pointer-events: none;
        }
        @keyframes particleFloat {
          0%   { transform: translateY(100vh) scale(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-10vh) scale(1); opacity: 0; }
        }

        .oa-columns {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: stretch;
          gap: 5px;
          width: 100%;
          max-width: 1100px;
        }

        .oa-left {
          flex: 2;
          background: rgba(7, 19, 82, 0.82);
          backdrop-filter: blur(18px) saturate(1.4);
          -webkit-backdrop-filter: blur(18px) saturate(1.4);
          border: 1px solid rgba(255,255,255,0.13);
          border-radius: 20px;
          box-shadow:
            0 8px 32px rgba(0,0,0,0.45),
            0 2px 8px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 32px 44px 28px;
          position: relative;
          overflow: hidden;
        }

        .oa-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.04) 1.2px, transparent 1.2px);
          background-size: 28px 28px;
          pointer-events: none; z-index: 0;
          border-radius: 20px;
        }
        .oa-glow {
          position: absolute; top: -100px; right: -100px;
          width: 380px; height: 380px; border-radius: 50%;
          background: radial-gradient(circle, rgba(100,149,255,0.16) 0%, transparent 68%);
          pointer-events: none; z-index: 0;
        }
        .oa-glow2 {
          position: absolute; bottom: -80px; left: -50px;
          width: 280px; height: 280px; border-radius: 50%;
          background: radial-gradient(circle, rgba(55,80,200,0.14) 0%, transparent 68%);
          pointer-events: none; z-index: 0;
        }

        .oa-brand {
          display: flex; align-items: center; gap: 14px;
          position: relative; z-index: 2;
        }
        .oa-brand-logo {
          width: 48px; height: 48px;
          border-radius: 12px; object-fit: contain; flex-shrink: 0;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        .oa-brand-name {
          font-size: 22px; font-weight: 800; color: white; line-height: 1.2;
        }
        .oa-brand-sub {
          font-size: 11px; color: rgba(255,255,255,0.42); margin-top: 2px;
        }

        .oa-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.20);
          border-radius: 100px; padding: 4px 13px;
          margin-bottom: 12px; width: fit-content;
        }
        .oa-badge-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #60A5FA;
          box-shadow: 0 0 0 3px rgba(96,165,250,0.28);
          flex-shrink: 0;
          animation: badgePulse 2.4s ease-in-out infinite;
        }
        @keyframes badgePulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(96,165,250,0.28); }
          50%      { box-shadow: 0 0 0 6px rgba(96,165,250,0.10); }
        }
        .oa-badge-txt {
          font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.82);
        }

        .oa-hero {
          position: relative; z-index: 2;
          flex: 1; display: flex; flex-direction: column;
          justify-content: center; padding: 20px 0;
        }
        .oa-headline {
          font-size: 38px; font-weight: 800; color: white;
          line-height: 1.10; letter-spacing: -0.8px;
          margin-bottom: 10px;
        }
        .oa-headline-grad {
          background: linear-gradient(90deg, #93C5FD, #818CF8);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .oa-desc {
          font-size: 13px; color: rgba(255,255,255,0.56);
          line-height: 1.62; max-width: 400px; margin-bottom: 16px; font-weight: 400;
        }
        .oa-pills { display: flex; flex-wrap: wrap; gap: 8px; }
        .oa-pill {
          background: rgba(255,255,255,0.09);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 8px; padding: 5px 11px;
          font-size: 11px; color: rgba(255,255,255,0.82); font-weight: 500;
        }

        .oa-stats {
          position: relative; z-index: 2;
          border-top: 1px solid rgba(255,255,255,0.12);
          padding-top: 14px;
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }
        .oa-stat { padding-right: 16px; }
        .oa-stat + .oa-stat {
          padding-left: 16px;
          border-left: 1px solid rgba(255,255,255,0.10);
        }
        .oa-stat-val {
          font-size: 22px; font-weight: 800; color: white; line-height: 1;
        }
        .oa-stat-lbl {
          font-size: 9.5px; color: rgba(255,255,255,0.36);
          text-transform: uppercase; letter-spacing: 0.10em; margin-top: 4px;
        }
        .oa-footer-txt {
          font-size: 10px; color: rgba(255,255,255,0.18);
          position: relative; z-index: 2; margin-top: 10px;
        }

        .oa-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .oa-form-wrap {
          width: 100%;
        }

        .oa-card {
          background: rgba(255, 255, 255, 0.97);
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.5);
          box-shadow:
            0 8px 32px rgba(0,0,0,0.40),
            0 2px 8px rgba(0,0,0,0.25),
            inset 0 1px 0 rgba(255,255,255,0.9);
          overflow: hidden;
        }
        .oa-card-head {
          padding: 18px 28px 14px;
          border-bottom: 1px solid #F0F2F9;
          text-align: center;
        }
        .oa-card-body { padding: 16px 28px 18px; }
        .oa-card-foot {
          padding: 12px 28px 14px;
          border-top: 1px solid #F0F2F9;
          background: #F8FAFF;
          text-align: center;
        }

        .oa-card-logo {
          width: 48px; height: 48px; border-radius: 12px;
          object-fit: contain; margin: 0 auto 8px; display: block;
        }
        .oa-secure-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: linear-gradient(135deg, #EEF2FF, #E8EFFE);
          border: 1px solid #C7D2FE; border-radius: 100px;
          padding: 3px 10px; margin-bottom: 7px;
          font-size: 9.5px; color: #4338CA; font-weight: 700; letter-spacing: 0.05em;
        }
        .oa-title {
          font-size: 19px; font-weight: 800; color: #0F172A;
          letter-spacing: -0.4px; margin-bottom: 3px;
        }
        .oa-subtitle { font-size: 12px; color: #6B7280; }
        .oa-subtitle strong { color: #1E3A8A; font-weight: 700; }

        .oa-label {
          display: block; font-size: 10px; font-weight: 600;
          color: #6B7280; letter-spacing: 0.07em; text-transform: uppercase;
          margin-bottom: 4px;
        }
        .oa-input-wrap { position: relative; margin-bottom: 11px; }
        .oa-input {
          width: 100%; height: 39px;
          border: 1.5px solid #E5EAF2; border-radius: 9px;
          padding: 0 40px 0 13px;
          font-size: 13px; font-family: inherit;
          color: #111827; background: #FAFBFF;
          transition: border-color 0.18s, box-shadow 0.18s;
          outline: none;
        }
        .oa-input:focus {
          border-color: #1740C8;
          box-shadow: 0 0 0 3px rgba(23,64,200,0.10);
          background: white;
        }
        .oa-input::placeholder { color: #C1CBDA; font-size: 12.5px; }
        .oa-eye {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94A3B8; display: flex; align-items: center; padding: 4px;
        }
        .oa-eye:hover { color: #64748B; }

        .oa-forgot-row {
          display: flex; justify-content: flex-end;
          margin-top: -6px; margin-bottom: 12px;
        }
        .oa-forgot {
          font-size: 11px; color: #4F6EF7; font-weight: 500;
          text-decoration: none; background: none; border: none;
          cursor: pointer; font-family: inherit;
        }
        .oa-forgot:hover { text-decoration: underline; }

        .oa-btn {
          width: 100%; height: 41px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          border: none; border-radius: 9px;
          font-size: 13.5px; font-weight: 700; color: white;
          font-family: inherit; cursor: pointer;
          box-shadow: 0 4px 14px rgba(7,19,82,0.34);
          transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .oa-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.44);
        }
        .oa-btn:disabled { opacity: 0.68; cursor: not-allowed; }

        .oa-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: white;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .oa-ssl {
          font-size: 10px; color: #9CA3AF;
          padding: 5px 0 0; text-align: center;
        }

        .oa-divider {
          display: flex; align-items: center; gap: 10px;
          margin: 10px 0;
        }
        .oa-div-line { flex: 1; height: 1px; background: #E8EDF5; }
        .oa-div-txt  { font-size: 10.5px; color: #A0AEC0; font-weight: 500; }

        .oa-trial-btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 41px;
          background: linear-gradient(135deg, #10B981 0%, #047857 100%);
          border: none; border-radius: 9px;
          font-size: 12.5px; font-weight: 700; color: white;
          font-family: inherit; cursor: pointer; text-decoration: none;
          box-shadow: 0 4px 12px rgba(5,150,105,0.28);
          transition: all 0.2s;
        }
        .oa-trial-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(5,150,105,0.38);
        }
        .oa-trial-note {
          font-size: 10px; color: #9CA3AF;
          margin-top: 5px; text-align: center;
        }

        .oa-switch-row { text-align: center; margin-top: 9px; }
        .oa-switch {
          background: none; border: none;
          font-size: 11.5px; color: #4F6EF7; font-weight: 600;
          cursor: pointer; font-family: inherit; text-decoration: underline;
        }
        .oa-error {
          background: #FEF2F2; border: 1px solid #FECACA;
          border-radius: 8px; padding: 8px 12px;
          font-size: 12px; color: #B91C1C; margin-bottom: 11px;
        }
        .oa-success {
          background: #F0FDF4; border: 1px solid #BBF7D0;
          border-radius: 8px; padding: 8px 12px;
          font-size: 12px; color: #15803D; margin-bottom: 11px;
        }

        .oa-support-lbl { font-size: 10.5px; color: #9CA3AF; margin-bottom: 6px; }
        .oa-support-links {
          display: flex; align-items: center; justify-content: center;
          gap: 8px; flex-wrap: wrap;
        }
        .oa-support-link {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; color: #4F6EF7; font-weight: 600;
          text-decoration: none; padding: 5px 11px;
          border-radius: 8px; background: #F5F7FF;
          border: 1px solid #DBEAFE; transition: all 0.15s;
        }
        .oa-support-link:hover { background: #EEF2FF; }

        @media (max-width: 1023px) and (min-width: 768px) {
          .oa-columns { max-width: 900px; }
          .oa-left { padding: 28px 28px; }
          .oa-headline { font-size: 28px; }
          .oa-glow { width: 240px; height: 240px; }
        }

        @media (max-width: 767px) {
          .oa-shell { padding: 0; align-items: flex-start; }
          .oa-columns { flex-direction: column; gap: 0; max-width: 100%; border-radius: 0; }
          .oa-left {
            border-radius: 0;
            flex-direction: row; align-items: center;
            padding: 14px 18px; gap: 12px;
            flex: unset; width: 100%;
          }
          .oa-hero, .oa-stats, .oa-footer-txt,
          .oa-glow, .oa-glow2, .oa-dots { display: none; }
          .oa-brand { margin: 0; }
          .oa-brand-logo { width: 36px; height: 36px; }
          .oa-brand-name { font-size: 16px; }
          .oa-brand-sub  { font-size: 10px; }
          .oa-right {
            padding: 20px 14px;
            background: rgba(11,30,91,0.6);
          }
          .oa-card { border-radius: 14px; }
          .oa-card-head, .oa-card-body, .oa-card-foot {
            padding-left: 18px; padding-right: 18px;
          }
        }

        @media (min-width: 1400px) {
          .oa-columns { max-width: 1260px; }
          .oa-left { padding: 44px 56px; }
          .oa-headline { font-size: 46px; }
          .oa-desc { font-size: 14.5px; }
        }

        @media (min-width: 1920px) {
          .oa-columns { max-width: 1600px; }
          .oa-left { padding: 60px 72px; }
          .oa-headline { font-size: 56px; }
          .oa-brand-name { font-size: 26px; }
          .oa-brand-logo { width: 58px; height: 58px; }
          .oa-title { font-size: 24px; }
          .oa-btn, .oa-trial-btn { height: 50px; font-size: 15px; }
          .oa-input { height: 48px; font-size: 14px; }
          .oa-stat-val { font-size: 30px; }
        }
      `}</style>

      {/* ══ WATER BACKGROUND ══ */}
      <div className="oa-water-bg" />

      {/* Floating particles */}
      {[
        { left: "10%", size: 4, duration: "12s", delay: "0s" },
        { left: "25%", size: 6, duration: "16s", delay: "3s" },
        { left: "42%", size: 3, duration: "10s", delay: "6s" },
        { left: "60%", size: 5, duration: "14s", delay: "1s" },
        { left: "75%", size: 4, duration: "18s", delay: "4s" },
        { left: "88%", size: 6, duration: "11s", delay: "8s" },
      ].map((p, i) => (
        <div
          key={i}
          className="oa-particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Water wave SVG */}
      <svg className="oa-waves" viewBox="0 0 1440 160" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path className="wave1" d="M0,80 C240,20 480,140 720,80 C960,20 1200,140 1440,80 L1440,80 C1200,140 960,20 720,80 C480,140 240,20 0,80 Z M1440,80 C1680,20 1920,140 2160,80 C2400,20 2640,140 2880,80 L2880,80 C2640,140 2400,20 2160,80 C1920,140 1680,20 1440,80 Z" fill="rgba(100,160,255,0.4)" />
        <path className="wave2" d="M0,100 C360,40 720,160 1080,100 C1440,40 1800,160 2160,100 L2160,160 L0,160 Z M2160,100 C2520,40 2880,160 3240,100 L3240,160 L2160,160 Z" fill="rgba(70,130,220,0.3)" />
        <path className="wave3" d="M0,120 C480,80 960,160 1440,120 C1920,80 2400,160 2880,120 L2880,160 L0,160 Z" fill="rgba(50,100,200,0.25)" />
      </svg>

      {/* ══ MAIN LAYOUT ══ */}
      <div className="oa-shell">
        <div className="oa-columns">

          {/* ══ LEFT PANEL ══ */}
          <div className="oa-left">
            <div className="oa-dots" />
            <div className="oa-glow" />
            <div className="oa-glow2" />

            {/* Brand */}
            <div className="oa-brand">
              <img src="/logo.png" alt="OneAccounts" className="oa-brand-logo" />
              <div>
                <div className="oa-brand-name">OneAccounts</div>
                <div className="oa-brand-sub">by Siqbal · PKR Suite</div>
              </div>
            </div>

            {/* Hero */}
            <div className="oa-hero">
              <div className="oa-badge">
                <div className="oa-badge-dot" />
                <span className="oa-badge-txt">Cloud Accounting Platform</span>
              </div>
              <div className="oa-headline">
                Smart Accounting,<br />
                <span className="oa-headline-grad">Stronger Business.</span>
              </div>
              <div className="oa-desc">
                Complete double-entry accounting, invoicing, inventory &amp; financial
                reporting — purpose-built for Pakistani businesses.
              </div>
              <div className="oa-pills">
                {PILLS.map(p => <span key={p} className="oa-pill">{p}</span>)}
              </div>
            </div>

            {/* Stats + Footer */}
            <div>
              <div className="oa-stats">
                {STATS.map(s => (
                  <div key={s.label} className="oa-stat">
                    <div className="oa-stat-val">{s.value}</div>
                    <div className="oa-stat-lbl">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="oa-footer-txt">© 2025 OneAccounts by Siqbal. All rights reserved.</div>
            </div>
          </div>

          {/* ══ RIGHT PANEL ══ */}
          <div className="oa-right">
            <div className="oa-form-wrap">
              <div className="oa-card">

                {/* Card Head */}
                <div className="oa-card-head">
                  <img src="/logo.png" alt="OneAccounts" className="oa-card-logo" />
                  <div className="oa-secure-badge">🔒 SECURE LOGIN</div>
                  <div className="oa-title">OneAccounts · Material Module</div>
                  <div className="oa-subtitle">
                    Sign in to your <strong>Material Management</strong> workspace
                  </div>
                </div>

                {/* Card Body */}
                <div className="oa-card-body">

                  {error && (
                    <div className={error.startsWith("✅") ? "oa-success" : "oa-error"}>
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleAuth} noValidate>
                    <label className="oa-label" htmlFor="email">Email Address</label>
                    <div className="oa-input-wrap">
                      <input
                        id="email" type="email" className="oa-input"
                        placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)}
                        autoComplete="email" autoFocus required
                      />
                    </div>

                    <label className="oa-label" htmlFor="password">Password</label>
                    <div className="oa-input-wrap">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        className="oa-input"
                        placeholder="Enter your password"
                        value={password} onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password" required
                      />
                      <button
                        type="button" className="oa-eye"
                        onClick={() => setShowPassword(p => !p)} tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    <button type="submit" className="oa-btn" disabled={loading}>
                      {loading
                        ? <><div className="oa-spinner" /> Please wait…</>
                        : "Sign In →"
                      }
                    </button>

                    <div className="oa-ssl">🔒 256-bit SSL encrypted · Your data is safe</div>
                  </form>

                </div>

                {/* Card Foot */}
                <div className="oa-card-foot">
                  <div className="oa-support-lbl">Need help? We're here for you.</div>
                  <div className="oa-support-links">
                    <a href="tel:03117798157"            className="oa-support-link">📞 0311-7798157</a>
                    <a href="mailto:siqbalhwc@gmail.com" className="oa-support-link">✉ siqbalhwc@gmail.com</a>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
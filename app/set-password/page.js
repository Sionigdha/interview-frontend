"use client"
import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import API_URL from "../config"
function SetPasswordContent() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const email = useSearchParams().get("email")

  async function handleSubmit() {
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    try {
      setLoading(true)
      setError("")
      const res = await fetch("http://localhost:4000/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Signup failed")
        return
      }
      router.push("/login")
    } catch (err) {
      console.error(err)
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: "420px", background: "#161b22", border: "1px solid #21262d", borderRadius: "16px", padding: "36px" }}>
      <div style={{ width: "48px", height: "48px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", marginBottom: "20px" }}>
        🔒
      </div>
      <h1 style={{ color: "#ffffff", fontSize: "24px", fontWeight: "700", letterSpacing: "-0.5px", marginBottom: "8px" }}>Set your password</h1>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>Almost there — create a secure password</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: "12px 16px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
        <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && password.length >= 6 && handleSubmit()} style={{ width: "100%", padding: "12px 16px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
      </div>
      {password.length > 0 && password.length < 6 && (
        <p style={{ color: "#6b7280", fontSize: "12px", marginTop: "8px" }}>At least 6 characters required</p>
      )}
      {error && (
        <div style={{ marginTop: "14px", padding: "12px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "13px" }}>{error}</div>
      )}
      <button onClick={handleSubmit} disabled={loading || password.length < 6} style={{ width: "100%", marginTop: "20px", padding: "13px", background: loading || password.length < 6 ? "#1f2937" : "#22c55e", color: loading || password.length < 6 ? "#6b7280" : "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading || password.length < 6 ? "not-allowed" : "pointer" }}>
        {loading ? "Creating account..." : "Create Account"}
      </button>
    </div>
  )
}

export default function SetPassword() {
  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <Link href="/" style={{ color: "#22c55e", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.5px", textDecoration: "none", marginBottom: "40px" }}>
        InterviewPrep
      </Link>
      <Suspense fallback={<div style={{ color: "#6b7280" }}>Loading...</div>}>
        <SetPasswordContent />
      </Suspense>
    </div>
  )
}
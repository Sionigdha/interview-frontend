"use client"
import { useState } from "react"
import Link from "next/link"
import API_URL from "../config"

export default function Signup() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    try {
      setLoading(true)
      setError("")

      const response = await fetch(`${API_URL}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to send OTP")
        return
      }

      window.location.href = `/verify?email=${email}`

    } catch (err) {
      console.error(err)
      setError("Failed to send OTP")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>

      {/* logo */}
      <Link href="/" style={{ color: "#22c55e", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.5px", textDecoration: "none", marginBottom: "40px" }}>
        InterviewPrep
      </Link>

      <div style={{ width: "100%", maxWidth: "420px", background: "#161b22", border: "1px solid #21262d", borderRadius: "16px", padding: "36px" }}>

        {/* badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "100px", padding: "4px 12px", marginBottom: "20px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: "500" }}>Free forever</span>
        </div>

        <h1 style={{ color: "#ffffff", fontSize: "24px", fontWeight: "700", letterSpacing: "-0.5px", marginBottom: "8px" }}>Create account</h1>
        <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>Start practising for your interviews</p>

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSignup()}
          style={{ width: "100%", padding: "12px 16px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
        />

        {error && (
          <div style={{ marginTop: "14px", padding: "12px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "13px" }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSignup}
          disabled={loading || !email}
          style={{ width: "100%", marginTop: "20px", padding: "13px", background: loading || !email ? "#1f2937" : "#22c55e", color: loading || !email ? "#6b7280" : "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading || !email ? "not-allowed" : "pointer" }}
        >
          {loading ? "Sending OTP..." : "Continue with email"}
        </button>

        <p style={{ textAlign: "center", color: "#6b7280", fontSize: "13px", marginTop: "20px" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#22c55e", textDecoration: "none", fontWeight: "600" }}>Sign in</Link>
        </p>

      </div>
    </div>
  )
}

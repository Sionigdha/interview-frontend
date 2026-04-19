"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import API_URL from "../config"
export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // fix 3: clear any browser auto-filled values on mount
  useEffect(() => {
    setEmail("")
    setPassword("")
  }, [])

  async function handleLogin() {
    setLoading(true)
    setError("")

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()
    setLoading(false)

    if (data.error) {
      setError(data.error)
    } else {
      localStorage.setItem("token", data.token)
      localStorage.setItem("email", data.email)
      router.push("/dashboard")
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>

      <Link href="/" style={{ color: "#22c55e", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.5px", textDecoration: "none", marginBottom: "40px" }}>
        InterviewPrep
      </Link>

      <div style={{ width: "100%", maxWidth: "420px", background: "#161b22", border: "1px solid #21262d", borderRadius: "16px", padding: "36px" }}>

        <h1 style={{ color: "#ffffff", fontSize: "24px", fontWeight: "700", letterSpacing: "-0.5px", marginBottom: "8px" }}>Welcome back</h1>
        <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>Sign in to continue practising</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* autoComplete="off" and key trick prevents browser autofill */}
          <input
            key="email-field"
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="new-password"
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "12px 16px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
          />
          <input
            key="password-field"
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", padding: "12px 16px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {error && (
          <div style={{ marginTop: "14px", padding: "12px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "13px" }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          style={{ width: "100%", marginTop: "20px", padding: "13px", background: loading || !email || !password ? "#1f2937" : "#22c55e", color: loading || !email || !password ? "#6b7280" : "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading || !email || !password ? "not-allowed" : "pointer" }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p style={{ textAlign: "center", color: "#6b7280", fontSize: "13px", marginTop: "20px" }}>
          No account?{" "}
          <Link href="/signup" style={{ color: "#22c55e", textDecoration: "none", fontWeight: "600" }}>Sign up</Link>
        </p>

      </div>
    </div>
  )
}

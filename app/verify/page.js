"use client"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

export default function Verify() {
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get("email")

  async function handleVerify() {
    try {
      setLoading(true)
      setError("")

      const res = await fetch("http://localhost:4000/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Invalid OTP")
        return
      }

      router.push(`/set-password?email=${email}`)

    } catch (err) {
      console.error(err)
      setError("Something went wrong")
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

        {/* email icon */}
        <div style={{ width: "48px", height: "48px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", marginBottom: "20px" }}>
          ✉️
        </div>

        <h1 style={{ color: "#ffffff", fontSize: "24px", fontWeight: "700", letterSpacing: "-0.5px", marginBottom: "8px" }}>Check your email</h1>
        <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "6px" }}>We sent a 6-digit code to</p>
        <p style={{ color: "#e5e7eb", fontSize: "14px", fontWeight: "600", marginBottom: "28px" }}>{email}</p>

        <input
          type="text"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerify()}
          placeholder="000000"
          style={{ width: "100%", padding: "14px 16px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "24px", textAlign: "center", letterSpacing: "8px", outline: "none", boxSizing: "border-box" }}
        />

        {error && (
          <div style={{ marginTop: "14px", padding: "12px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "13px" }}>
            {error}
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          style={{ width: "100%", marginTop: "20px", padding: "13px", background: loading || code.length !== 6 ? "#1f2937" : "#22c55e", color: loading || code.length !== 6 ? "#6b7280" : "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading || code.length !== 6 ? "not-allowed" : "pointer" }}
        >
          {loading ? "Verifying..." : "Verify OTP"}
        </button>

        <p style={{ textAlign: "center", color: "#6b7280", fontSize: "13px", marginTop: "20px" }}>
          Wrong email?{" "}
          <Link href="/signup" style={{ color: "#22c55e", textDecoration: "none", fontWeight: "600" }}>Go back</Link>
        </p>

      </div>
    </div>
  )
}

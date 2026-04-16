"use client"
import { useEffect, useRef } from "react"
import Link from "next/link"

export default function Landing() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles = []
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.5,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.5 + 0.2
      })
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34, 197, 94, ${p.opacity})`
        ctx.fill()
        p.x += p.dx
        p.y += p.dy
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1
      })
      requestAnimationFrame(draw)
    }

    draw()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <div style={{ background: "#0d1117", minHeight: "100vh", position: "relative", overflow: "hidden" }}>

      {/* animated particle background */}
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />

      {/* navbar */}
      <nav style={{ position: "relative", zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 48px", borderBottom: "1px solid #1a2a1a" }}>
        <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.5px" }}>InterviewPrep</span>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link href="/login" style={{ color: "#9ca3af", textDecoration: "none", padding: "8px 20px", borderRadius: "8px", border: "1px solid #374151", fontSize: "14px", fontWeight: "500" }}>
            Sign in
          </Link>
          <Link href="/signup" style={{ color: "#0d1117", textDecoration: "none", padding: "8px 20px", borderRadius: "8px", background: "#22c55e", fontSize: "14px", fontWeight: "600" }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* hero section */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "85vh", textAlign: "center", padding: "0 24px" }}>

        {/* badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "100px", padding: "6px 16px", marginBottom: "32px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "500" }}>Interview Preparation Tool</span>
        </div>

        {/* main heading */}
        <h1 style={{ color: "#ffffff", fontSize: "clamp(40px, 7vw, 80px)", fontWeight: "800", lineHeight: "1.1", letterSpacing: "-2px", marginBottom: "24px", maxWidth: "900px" }}>
          Ace your next{" "}
          <span style={{ color: "#22c55e" }}>technical interview</span>
        </h1>

        {/* subheading */}
        <p style={{ color: "#9ca3af", fontSize: "clamp(16px, 2vw, 20px)", lineHeight: "1.6", marginBottom: "48px", maxWidth: "600px" }}>
          Paste your resume. Get personalised interview questions. Answer by voice or text. Receive feedback with a score instantly.
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/signup" style={{ color: "#0d1117", textDecoration: "none", padding: "16px 36px", borderRadius: "12px", background: "#22c55e", fontSize: "16px", fontWeight: "700", letterSpacing: "-0.3px" }}>
            Start practising free
          </Link>
          <Link href="/login" style={{ color: "#ffffff", textDecoration: "none", padding: "16px 36px", borderRadius: "12px", border: "1px solid #374151", fontSize: "16px", fontWeight: "600", background: "rgba(255,255,255,0.05)" }}>
            Sign in
          </Link>
        </div>

      </div>

      {/* features section */}
      <div style={{ position: "relative", zIndex: 10, padding: "80px 48px", borderTop: "1px solid #1a2a1a" }}>
        <p style={{ color: "#6b7280", fontSize: "13px", textAlign: "center", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "48px" }}>Everything you need to prepare</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px", maxWidth: "1000px", margin: "0 auto" }}>
          {[
            { icon: "◎", title: "Resume-based questions", desc: "We read your resume and generate questions tailored to your exact experience" },
            { icon: "◈", title: "Voice answers", desc: "Speak your answers naturally — no typing required. Full speech to text support" },
            { icon: "◉", title: "Instant evaluation", desc: "Get a score out of 10, detailed feedback, and one specific improvement tip" },
            { icon: "◇", title: "Role-specific prep", desc: "Choose your target role and get questions matched to that job's requirements" },
          ].map((f, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1f2f1f", borderRadius: "16px", padding: "28px" }}>
              <div style={{ color: "#22c55e", fontSize: "24px", marginBottom: "16px" }}>{f.icon}</div>
              <h3 style={{ color: "#ffffff", fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>{f.title}</h3>
              <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: "1.6" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* bottom CTA */}
      <div style={{ position: "relative", zIndex: 10, textAlign: "center", padding: "60px 24px 80px", borderTop: "1px solid #1a2a1a" }}>
        <h2 style={{ color: "#ffffff", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: "700", marginBottom: "16px", letterSpacing: "-1px" }}>Ready to get hired?</h2>
        <p style={{ color: "#6b7280", fontSize: "16px", marginBottom: "32px" }}>Join thousands of candidates preparing smarter</p>
        <Link href="/signup" style={{ color: "#0d1117", textDecoration: "none", padding: "16px 40px", borderRadius: "12px", background: "#22c55e", fontSize: "16px", fontWeight: "700" }}>
          Create free account
        </Link>
      </div>

    </div>
  )
}
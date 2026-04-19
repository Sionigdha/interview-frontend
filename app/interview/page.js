"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import CameraMonitor from "@/components/CameraMonitor"
import CheatDetector from "@/components/CheatDetector"
import XPReward from "@/components/XPReward"
import API_URL from "../config"
const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false })
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

// fix 2: quota retry wrapper for frontend
async function fetchWithQuotaRetry(url, options, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status === 429) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 30000)) // wait 30s
        continue
      }
    }
    return res
  }
}

export default function PracticePage() {
  const router = useRouter()

  const [setupDone, setSetupDone] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [screenReady, setScreenReady] = useState(false)
  const [screenError, setScreenError] = useState("")
  const screenStreamRef = useRef(null)

  const [text, setText] = useState("")
  const [role, setRole] = useState("")
  const [background, setBackground] = useState("")
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [quotaWaiting, setQuotaWaiting] = useState(false)
  const [answers, setAnswers] = useState({})
  const [evaluations, setEvaluations] = useState({})
  const [evaluatingIndex, setEvaluatingIndex] = useState(null)
  const [listeningIndex, setListeningIndex] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userEmail, setUserEmail] = useState("")

  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const fileInputRef = useRef(null)

  const [interviewActive, setInterviewActive] = useState(false)
  const violationsRef = useRef({ tabSwitch: 0, faceAway: 0, multipleFaces: 0, windowBlur: 0, terminated: false })
  const [xpRewardData, setXpRewardData] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) { router.push("/login"); return }
    setUserEmail(localStorage.getItem("email") || "")
  }, [])

  function getToken() { return localStorage.getItem("token") }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadLoading(true)
    setUploadError("")
    try {
      const formData = new FormData()
      formData.append("resume", file)
      const res = await fetch(`${API}/extract-resume`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${getToken()}` },
        body: formData
      })
      if (!res.ok) {
        const data = await res.json()
        setUploadError(data.error || "Failed to extract text")
        return
      }
      const data = await res.json()
      setText(data.text)
    } catch {
      if (file.type === "text/plain") {
        const reader = new FileReader()
        reader.onload = (e) => setText(e.target.result)
        reader.readAsText(file)
      } else {
        setUploadError("Upload failed. Please paste your resume manually.")
      }
    } finally {
      setUploadLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function requestCamera() {
    window.dispatchEvent(new CustomEvent("suppress-blur"))
    try {
      await navigator.mediaDevices.getUserMedia({ video: true })
      setCameraReady(true)
    } catch { alert("Camera access is required.") }
  }

  async function requestScreenShare() {
    setScreenError("")
    window.dispatchEvent(new CustomEvent("suppress-blur"))
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", cursor: "always" }, audio: false
      })
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        stream.getTracks().forEach(t => t.stop())
        setScreenReady(false)
        setScreenError(settings.displaySurface === "browser"
          ? "You shared a browser tab. Please share your Entire Screen."
          : "You shared a window. Please share your Entire Screen.")
        return
      }
      screenStreamRef.current = stream
      setScreenReady(true)
      setScreenError("")
      track.onended = () => {
        setScreenReady(false)
        window.dispatchEvent(new CustomEvent("camera-violation", { detail: { type: "screenShareStopped" } }))
      }
    } catch (err) {
      if (err.name !== "NotAllowedError") setScreenError("Screen sharing failed. Please try again.")
    }
  }

  function startInterview() { setSetupDone(true); setInterviewActive(false) }

  async function generateQuestions() {
    setLoading(true); setError(""); setQuotaWaiting(false)
    setQuestions([]); setAnswers({}); setEvaluations({}); setSaved(false)
    try {
      const response = await fetchWithQuotaRetry(
        `${API}/generate-questions`,
        { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` }, body: JSON.stringify({ text }) }
      )
      const data = await response.json()
      if (response.status === 429) {
        setQuotaWaiting(true)
        setError("AI is busy right now. Retrying in 30 seconds...")
        return
      }
      if (data.error) setError(data.error)
      else { setQuestions(data.questions); setInterviewActive(true) }
    } catch {
      setError("Failed to connect to server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function evaluateAnswer(question, index, category) {
    setEvaluatingIndex(index)
    try {
      const response = await fetchWithQuotaRetry(
        `${API}/evaluate-answer`,
        { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` }, body: JSON.stringify({ question, answer: answers[index] || "", category, background }) }
      )
      if (response.status === 429) {
        setError("AI is busy. Please wait 30 seconds and try evaluating again.")
        return
      }
      const data = await response.json()
      setEvaluations(prev => ({ ...prev, [index]: data }))
    } catch {
      setError("Evaluation failed. Please try again.")
    } finally {
      setEvaluatingIndex(null)
    }
  }

  function startListening(index) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("Use Chrome for speech recognition."); return }
    if (listeningIndex === index) { setListeningIndex(null); return }
    window.dispatchEvent(new CustomEvent("suppress-blur"))
    const r = new SR()
    r.lang = "en-US"; r.interimResults = false; r.continuous = true
    r.onresult = (e) => {
      const t = e.results[e.results.length - 1][0].transcript
      setAnswers(prev => ({ ...prev, [index]: (prev[index] || "") + " " + t }))
    }
    r.onerror = () => setListeningIndex(null)
    r.onend = () => setListeningIndex(null)
    r.start(); setListeningIndex(index)
  }

  function handleViolationCount({ type }) {
    const key = type === "windowBlur" ? "tabSwitch" : type
    if (violationsRef.current[key] !== undefined) violationsRef.current[key] += 1
  }

  function handleTerminate() {
    violationsRef.current.terminated = true
    saveSession(true)
  }

  function handleCameraViolation(type) {
    window.dispatchEvent(new CustomEvent("camera-violation", { detail: { type } }))
  }

  function buildScoresArray() {
    return questions.map((q, i) => {
      const ev = evaluations[i]
      if (!ev) return null
      const isCoding = q.category?.toLowerCase() === "coding"
      return {
        category: q.category, question: q.question,
        ...(isCoding
          ? { correctness: ev.correctness, codeQuality: ev.codeQuality, efficiency: ev.efficiency }
          : { technicalDepth: ev.technicalDepth, clarity: ev.clarity, confidenceTone: ev.confidenceTone }),
        feedback: ev.feedback, improvement: ev.improvement
      }
    }).filter(Boolean)
  }

  const allEvaluated = questions.length > 0 && questions.every((_, i) => evaluations[i])

  async function saveSession(isTerminated = false) {
    if (!role.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/save-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
        body: JSON.stringify({ role, background, scores: buildScoresArray(), violations: { ...violationsRef.current, terminated: isTerminated } })
      })
      const data = await res.json()
      if (!isTerminated && res.ok) {
        setSaved(true)
        const profileRes = await fetch(`${API}/profile`, { headers: { "Authorization": `Bearer ${getToken()}` } })
        const profile = await profileRes.json()
        setXpRewardData({ ...data, profile })
      }
    } catch { } finally { setSaving(false) }
  }

  function getAvgScore(ev, isCoding) {
    if (!ev) return null
    const vals = isCoding
      ? [ev.correctness, ev.codeQuality, ev.efficiency]
      : [ev.technicalDepth, ev.clarity, ev.confidenceTone]
    const f = vals.filter(v => v != null)
    return f.length ? (f.reduce((a, b) => a + b, 0) / f.length).toFixed(1) : null
  }

  function getDimColor(score) {
    if (score >= 8) return "#22c55e"
    if (score >= 5) return "#eab308"
    return "#ef4444"
  }

  const catColors = { skillset: "#6366f1", education: "#22c55e", work: "#f59e0b", hr: "#ec4899", coding: "#22d3ee" }

  // ── SETUP GATE ──────────────────────────────────────────────────────────────
  if (!setupDone) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: "500px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "20px" }}>InterviewPrep</span>
            <h1 style={{ color: "#fff", fontSize: "26px", fontWeight: "800", marginTop: "20px", marginBottom: "8px" }}>Before you begin</h1>
            <p style={{ color: "#6b7280", fontSize: "14px" }}>Proctored session. Camera and full screen share required.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
            <div style={{ background: "#161b22", border: `1px solid ${cameraReady ? "rgba(34,197,94,0.4)" : "#21262d"}`, borderRadius: "14px", padding: "18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", background: "rgba(34,197,94,0.1)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>📷</div>
                <div>
                  <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "14px", margin: 0 }}>Camera Access</p>
                  <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>Face monitoring and cheat detection</p>
                </div>
              </div>
              {cameraReady ? <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>✓ Ready</span>
                : <button onClick={requestCamera} style={{ padding: "8px 16px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Enable</button>}
            </div>

            <div style={{ background: "#161b22", border: `1px solid ${screenReady ? "rgba(34,197,94,0.4)" : screenError ? "rgba(239,68,68,0.4)" : "#21262d"}`, borderRadius: "14px", padding: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "40px", height: "40px", background: "rgba(99,102,241,0.1)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🖥️</div>
                  <div>
                    <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "14px", margin: 0 }}>Screen Share</p>
                    <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>Must share <strong style={{ color: "#e5e7eb" }}>Entire Screen</strong></p>
                  </div>
                </div>
                {screenReady ? <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>✓ Sharing</span>
                  : <button onClick={requestScreenShare} style={{ padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" }}>
                      {screenError ? "Try Again" : "Share Screen"}
                    </button>}
              </div>
              {screenError && (
                <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px" }}>
                  <p style={{ color: "#f87171", fontSize: "12px", margin: 0 }}>{screenError}</p>
                  <p style={{ color: "#6b7280", fontSize: "11px", margin: "2px 0 0" }}>In dialog — click "Entire Screen" tab.</p>
                </div>
              )}
            </div>
          </div>

          <button onClick={startInterview} disabled={!cameraReady || !screenReady}
            style={{ width: "100%", padding: "14px", background: !cameraReady || !screenReady ? "#1f2937" : "#22c55e", color: !cameraReady || !screenReady ? "#4b5563" : "#0d1117", border: "none", borderRadius: "12px", fontWeight: "700", fontSize: "16px", cursor: !cameraReady || !screenReady ? "not-allowed" : "pointer" }}>
            {!cameraReady || !screenReady ? "Enable both to continue" : "Start Interview →"}
          </button>
          <p style={{ textAlign: "center", color: "#4b5563", fontSize: "11px", marginTop: "12px" }}>
            5 violations or stopping screen share = immediate termination.
          </p>
        </div>
      </div>
    )
  }

  // ── MAIN — LANDSCAPE LAYOUT ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", display: "flex", flexDirection: "column" }}>
      <XPReward data={xpRewardData} onClose={() => { setXpRewardData(null); router.push("/dashboard") }} />
      <CheatDetector active={interviewActive} onTerminate={handleTerminate} onViolationCount={handleViolationCount} />

      <nav style={{ background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "18px" }}>InterviewPrep</span>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <CameraMonitor active={setupDone} onViolation={handleCameraViolation} />
          <span style={{ color: "#6b7280", fontSize: "13px" }}>{userEmail}</span>
          <button onClick={() => router.push("/voice-interview")} style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", padding: "7px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>🎤 Voice Mode</button>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", padding: "7px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>Dashboard</button>
          <button onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("email"); router.push("/login") }} style={{ background: "transparent", border: "1px solid #374151", color: "#9ca3af", padding: "7px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>Logout</button>
        </div>
      </nav>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT PANEL */}
        <div style={{ width: "340px", flexShrink: 0, borderRight: "1px solid #1f2937", padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "800", marginBottom: "2px" }}>Practice Interview</h2>
            <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>Fill in details and generate questions</p>
          </div>

          <div>
            <label style={{ color: "#9ca3af", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "5px" }}>Target Role</label>
            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Developer"
              style={{ width: "100%", padding: "10px 12px", background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", color: "#fff", fontSize: "13px", boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ color: "#9ca3af", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "5px" }}>Your Background</label>
            <input type="text" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="e.g. 3rd year BTech CSE"
              style={{ width: "100%", padding: "10px 12px", background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", color: "#fff", fontSize: "13px", boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ color: "#9ca3af", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "5px" }}>Resume</label>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadLoading}
              style={{ width: "100%", padding: "9px 12px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", borderRadius: "8px", fontSize: "12px", fontWeight: "600", cursor: "pointer", marginBottom: "6px" }}>
              {uploadLoading ? "⏳ Extracting..." : "📎 Upload PDF / DOCX / Image"}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg" onChange={handleFileUpload} style={{ display: "none" }} />
            {uploadError && <p style={{ color: "#f87171", fontSize: "11px", marginBottom: "4px" }}>{uploadError}</p>}
            <p style={{ color: "#4b5563", fontSize: "11px", marginBottom: "5px" }}>or paste below:</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume here..."
              style={{ width: "100%", height: "200px", padding: "10px 12px", background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", color: "#fff", fontSize: "12px", resize: "vertical", boxSizing: "border-box" }} />
          </div>

          <button onClick={generateQuestions} disabled={loading || !text || !role}
            style={{ width: "100%", padding: "12px", background: loading || !text || !role ? "#1f2937" : "#22c55e", color: loading || !text || !role ? "#6b7280" : "#0d1117", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "14px", cursor: loading || !text || !role ? "not-allowed" : "pointer" }}>
            {loading ? "Generating..." : "⚡ Generate Questions"}
          </button>

          {/* fix 2: quota waiting indicator */}
          {quotaWaiting && (
            <div style={{ padding: "10px 12px", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "8px" }}>
              <p style={{ color: "#eab308", fontSize: "12px", fontWeight: "600", margin: "0 0 2px" }}>⏳ AI Service Busy</p>
              <p style={{ color: "#6b7280", fontSize: "11px", margin: 0 }}>Retrying automatically in 30 seconds. Please wait.</p>
            </div>
          )}

          {error && !quotaWaiting && <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "12px" }}>{error}</div>}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {questions.length === 0 ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px dashed #1f2937", borderRadius: "12px" }}>
              <p style={{ fontSize: "40px", marginBottom: "12px" }}>🎯</p>
              <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "16px" }}>Ready to practice?</p>
              <p style={{ color: "#6b7280", fontSize: "13px", marginTop: "4px" }}>Fill in your details on the left and click Generate</p>
              <button onClick={() => router.push("/voice-interview")} style={{ marginTop: "20px", padding: "10px 24px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", borderRadius: "10px", fontWeight: "600", fontSize: "13px", cursor: "pointer" }}>
                🎤 Try Voice Interview Mode instead
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {questions.map((q, index) => {
                const cat = q.category?.toLowerCase()
                const catColor = catColors[cat] || "#6b7280"
                const isCoding = cat === "coding"
                const ev = evaluations[index]
                const avgScore = getAvgScore(ev, isCoding)

                return (
                  <div key={index} style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: "12px", padding: "20px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", borderRadius: "100px", background: `${catColor}20`, border: `1px solid ${catColor}50`, color: catColor, fontSize: "11px", fontWeight: "600", textTransform: "uppercase", marginBottom: "10px" }}>
                      {isCoding && <span>{"</>"} </span>}{q.category}
                    </div>
                    <p style={{ color: "#e5e7eb", fontWeight: "600", marginBottom: "14px", lineHeight: "1.5", fontSize: "14px" }}>
                      <span style={{ color: "#22c55e", marginRight: "8px" }}>{index + 1}.</span>{q.question}
                    </p>

                    {isCoding ? (
                      <div style={{ marginBottom: "10px" }}>
                        <CodeEditor value={answers[index] || ""} onChange={(val) => setAnswers(prev => ({ ...prev, [index]: val }))} />
                      </div>
                    ) : (
                      <textarea value={answers[index] || ""} onChange={(e) => setAnswers(prev => ({ ...prev, [index]: e.target.value }))} placeholder="Type your answer here..."
                        style={{ width: "100%", height: "90px", padding: "10px 12px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", color: "#d1d5db", fontSize: "13px", resize: "vertical", boxSizing: "border-box", marginBottom: "10px" }} />
                    )}

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button onClick={() => evaluateAnswer(q.question, index, cat)} disabled={evaluatingIndex === index || !answers[index]}
                        style={{ padding: "8px 14px", background: evaluatingIndex === index || !answers[index] ? "#1f2937" : "#16a34a", color: evaluatingIndex === index || !answers[index] ? "#6b7280" : "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: evaluatingIndex === index || !answers[index] ? "not-allowed" : "pointer" }}>
                        {evaluatingIndex === index ? "Evaluating..." : isCoding ? "Evaluate Code" : "Evaluate Answer"}
                      </button>
                      {!isCoding && (
                        <button onClick={() => startListening(index)}
                          style={{ padding: "8px 14px", background: listeningIndex === index ? "rgba(239,68,68,0.2)" : "#1f2937", border: `1px solid ${listeningIndex === index ? "#ef4444" : "#374151"}`, color: listeningIndex === index ? "#ef4444" : "#9ca3af", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                          {listeningIndex === index ? "⏹ Stop" : "🎤 Speak"}
                        </button>
                      )}
                    </div>

                    {ev && (
                      <div style={{ marginTop: "14px", padding: "14px", background: "#0d1117", borderRadius: "10px", border: "1px solid #21262d" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px", flexWrap: "wrap" }}>
                          <div style={{ textAlign: "center" }}>
                            <p style={{ color: "#6b7280", fontSize: "10px", textTransform: "uppercase", margin: "0 0 3px" }}>Overall</p>
                            <p style={{ fontSize: "26px", fontWeight: "800", color: getDimColor(parseFloat(avgScore)), margin: 0 }}>{avgScore}</p>
                            <p style={{ color: "#4b5563", fontSize: "10px", margin: 0 }}>/ 10</p>
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", minWidth: "160px" }}>
                            {(isCoding ? [
                              { label: "Correctness", value: ev.correctness, color: "#22d3ee" },
                              { label: "Code Quality", value: ev.codeQuality, color: "#6366f1" },
                              { label: "Efficiency", value: ev.efficiency, color: "#f59e0b" },
                            ] : [
                              { label: "Technical Depth", value: ev.technicalDepth, color: "#6366f1" },
                              { label: "Clarity", value: ev.clarity, color: "#22c55e" },
                              { label: "Confidence Tone", value: ev.confidenceTone, color: "#ec4899" },
                            ]).map(d => (
                              <div key={d.label}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                                  <span style={{ color: "#9ca3af", fontSize: "11px" }}>{d.label}</span>
                                  <span style={{ color: getDimColor(d.value), fontSize: "11px", fontWeight: "700" }}>{d.value}/10</span>
                                </div>
                                <div style={{ height: "4px", background: "#21262d", borderRadius: "100px", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${(d.value / 10) * 100}%`, background: d.color, borderRadius: "100px" }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <p style={{ color: "#d1d5db", fontSize: "13px", marginBottom: "6px", lineHeight: "1.6" }}>
                          <span style={{ color: "#9ca3af", fontWeight: "600" }}>Feedback: </span>{ev.feedback}
                        </p>
                        <p style={{ color: "#d1d5db", fontSize: "13px", lineHeight: "1.6" }}>
                          <span style={{ color: "#9ca3af", fontWeight: "600" }}>Improve: </span>{ev.improvement}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}

              {allEvaluated && !saved && (
                <div style={{ padding: "20px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "12px", textAlign: "center" }}>
                  <p style={{ color: "#22c55e", fontWeight: "600", marginBottom: "6px" }}>All questions evaluated! 🎉</p>
                  <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "14px" }}>Save to earn XP and track your scores.</p>
                  <button onClick={() => saveSession(false)} disabled={saving}
                    style={{ padding: "11px 28px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "14px", cursor: saving ? "not-allowed" : "pointer" }}>
                    {saving ? "Saving..." : "⚡ Save & Earn XP"}
                  </button>
                </div>
              )}

              {saved && (
                <div style={{ padding: "16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", textAlign: "center" }}>
                  <p style={{ color: "#22c55e", fontWeight: "700" }}>✓ Session saved!</p>
                  <button onClick={() => router.push("/dashboard")} style={{ marginTop: "8px", padding: "7px 18px", background: "transparent", border: "1px solid #22c55e", color: "#22c55e", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}>
                    View Dashboard →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

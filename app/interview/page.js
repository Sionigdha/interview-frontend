"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import CameraMonitor from "@/components/CameraMonitor"
import CheatDetector from "@/components/CheatDetector"
import XPReward from "@/components/XPReward"

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false })

export default function PracticePage() {
  const router = useRouter()

  const [setupDone, setSetupDone] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [screenReady, setScreenReady] = useState(false)
  const [screenError, setScreenError] = useState("")   // error if wrong share type
  const screenStreamRef = useRef(null)

  const [text, setText] = useState("")
  const [role, setRole] = useState("")
  const [background, setBackground] = useState("")
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [answers, setAnswers] = useState({})
  const [evaluations, setEvaluations] = useState({})
  const [evaluatingIndex, setEvaluatingIndex] = useState(null)
  const [listeningIndex, setListeningIndex] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userEmail, setUserEmail] = useState("")

  const [interviewActive, setInterviewActive] = useState(false)
  const [terminated, setTerminated] = useState(false)
  const violationsRef = useRef({ tabSwitch: 0, faceAway: 0, multipleFaces: 0, windowBlur: 0, terminated: false })
  const [xpRewardData, setXpRewardData] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) { router.push("/login"); return }
    setUserEmail(localStorage.getItem("email") || "")
  }, [])

  function getToken() { return localStorage.getItem("token") }

  async function requestCamera() {
    // suppress blur before browser permission popup
    window.dispatchEvent(new CustomEvent("suppress-blur"))
    try {
      await navigator.mediaDevices.getUserMedia({ video: true })
      setCameraReady(true)
    } catch {
      alert("Camera access is required to start the interview.")
    }
  }

  async function requestScreenShare() {
    setScreenError("")
    // suppress blur before screen share dialog
    window.dispatchEvent(new CustomEvent("suppress-blur"))

    try {
      // request with displaySurface constraint — Chrome will honour this
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",   // prefer monitor (entire screen)
          cursor: "always"
        },
        audio: false
      })

      // check what was actually shared
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()

      // displaySurface values: "monitor" = entire screen, "window" = app window, "browser" = tab
      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        // user picked a window or tab — stop stream and show error
        stream.getTracks().forEach(t => t.stop())
        setScreenReady(false)
        setScreenError(
          settings.displaySurface === "browser"
            ? "You shared a browser tab. Please share your Entire Screen instead."
            : "You shared a window. Please share your Entire Screen instead."
        )
        return
      }

      screenStreamRef.current = stream
      setScreenReady(true)
      setScreenError("")

      // if user stops sharing mid-interview
      track.onended = () => {
        setScreenReady(false)
        if (interviewActive) {
          window.dispatchEvent(new CustomEvent("camera-violation", { detail: { type: "screenShareStopped" } }))
        }
      }

    } catch (err) {
      if (err.name !== "NotAllowedError") {
        // NotAllowedError = user cancelled — no need to show error
        setScreenError("Screen sharing failed. Please try again.")
      }
    }
  }

  function startInterview() { setSetupDone(true); setInterviewActive(false) }

  async function generateQuestions() {
    setLoading(true); setError(""); setQuestions([]); setAnswers({}); setEvaluations({}); setSaved(false)
    const response = await fetch("http://localhost:4000/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
      body: JSON.stringify({ text })
    })
    const data = await response.json()
    setLoading(false)
    if (data.error) setError(data.error)
    else { setQuestions(data.questions); setInterviewActive(true) }
  }

 const evaluateAnswer = (question, index, category) => {
  setEvaluatingIndex(index)
  fetch("http://localhost:4000/evaluate-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
    body: JSON.stringify({ question, answer: answers[index] || "", category, background })
  })
  .then(response => response.json())
  .then(data => {
    setEvaluations(prev => ({ ...prev, [index]: data }))
    setEvaluatingIndex(null)
  })
  // no .catch() — errors silently swallowed
  // no error state update
  // no setEvaluatingIndex(null) on failure
}

  function startListening(index) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("Use Chrome for speech recognition."); return }
    if (listeningIndex === index) { setListeningIndex(null); return }

    // suppress blur before mic permission popup
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
    setTerminated(true)
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
        category: q.category,
        question: q.question,
        ...(isCoding
          ? { correctness: ev.correctness, codeQuality: ev.codeQuality, efficiency: ev.efficiency }
          : { technicalDepth: ev.technicalDepth, clarity: ev.clarity, confidenceTone: ev.confidenceTone }
        ),
        feedback: ev.feedback,
        improvement: ev.improvement
      }
    }).filter(Boolean)
  }

  const allEvaluated = questions.length > 0 && questions.every((_, i) => evaluations[i])

  async function saveSession(isTerminated = false) {
    if (!role.trim()) { alert("Please enter your target role first."); return }
    setSaving(true)
    const scores = buildScoresArray()
    const res = await fetch("http://localhost:4000/save-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
      body: JSON.stringify({ role, background, scores, violations: { ...violationsRef.current, terminated: isTerminated } })
    })
    const data = await res.json()
    setSaving(false)
    if (!isTerminated && res.ok) {
      setSaved(true)
      const profileRes = await fetch("http://localhost:4000/profile", {
        headers: { "Authorization": `Bearer ${getToken()}` }
      })
      const profile = await profileRes.json()
      setXpRewardData({ ...data, profile })
    }
  }

  function getAvgScore(ev, isCoding) {
    if (!ev) return null
    const vals = isCoding
      ? [ev.correctness, ev.codeQuality, ev.efficiency]
      : [ev.technicalDepth, ev.clarity, ev.confidenceTone]
    const filtered = vals.filter(v => v != null)
    return filtered.length ? (filtered.reduce((a, b) => a + b, 0) / filtered.length).toFixed(1) : null
  }

  function getDimColor(score) {
    if (score >= 8) return "#22c55e"
    if (score >= 5) return "#eab308"
    return "#ef4444"
  }

  const categoryColors = {
    skillset: "#6366f1", education: "#22c55e",
    work: "#f59e0b", hr: "#ec4899", coding: "#22d3ee"
  }

  // ── SETUP GATE ──────────────────────────────────────────────────────────────
  if (!setupDone) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: "500px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "20px" }}>InterviewPrep</span>
            <h1 style={{ color: "#fff", fontSize: "28px", fontWeight: "800", marginTop: "24px", marginBottom: "8px", letterSpacing: "-0.5px" }}>Before you begin</h1>
            <p style={{ color: "#6b7280", fontSize: "15px" }}>This is a proctored session. Both camera and full screen share are required.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>

            {/* camera */}
            <div style={{ background: "#161b22", border: `1px solid ${cameraReady ? "rgba(34,197,94,0.4)" : "#21262d"}`, borderRadius: "14px", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "44px", height: "44px", background: "rgba(34,197,94,0.1)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>📷</div>
                <div>
                  <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "14px", margin: 0 }}>Camera Access</p>
                  <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>Used for face monitoring and cheat detection</p>
                </div>
              </div>
              {cameraReady
                ? <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>✓ Ready</span>
                : <button onClick={requestCamera} style={{ padding: "8px 18px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Enable</button>
              }
            </div>

            {/* screen share */}
            <div style={{ background: "#161b22", border: `1px solid ${screenReady ? "rgba(34,197,94,0.4)" : screenError ? "rgba(239,68,68,0.4)" : "#21262d"}`, borderRadius: "14px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{ width: "44px", height: "44px", background: "rgba(99,102,241,0.1)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>🖥️</div>
                  <div>
                    <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "14px", margin: 0 }}>Screen Share</p>
                    <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>Must share your <strong style={{ color: "#e5e7eb" }}>Entire Screen</strong> — not a tab or window</p>
                  </div>
                </div>
                {screenReady
                  ? <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>✓ Sharing</span>
                  : <button onClick={requestScreenShare} style={{ padding: "8px 18px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" }}>
                      {screenError ? "Try Again" : "Share Screen"}
                    </button>
                }
              </div>

              {/* error message if wrong share type */}
              {screenError && (
                <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>🚫</span>
                  <div>
                    <p style={{ color: "#f87171", fontSize: "13px", fontWeight: "600", margin: 0 }}>{screenError}</p>
                    <p style={{ color: "#6b7280", fontSize: "12px", margin: "2px 0 0" }}>
                      In the share dialog, click the <strong style={{ color: "#e5e7eb" }}>"Entire Screen"</strong> tab and select your screen.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* instruction note */}
          <div style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px" }}>
            <p style={{ color: "#a5b4fc", fontSize: "12px", margin: 0, lineHeight: "1.6" }}>
              📋 <strong>How to share entire screen:</strong> When the share dialog opens, click the <strong>"Entire Screen"</strong> or <strong>"Your Entire Screen"</strong> tab (not "Chrome Tab" or "Window"), select your screen, and click Share.
            </p>
          </div>

          <button onClick={startInterview} disabled={!cameraReady || !screenReady}
            style={{ width: "100%", padding: "14px", background: !cameraReady || !screenReady ? "#1f2937" : "#22c55e", color: !cameraReady || !screenReady ? "#4b5563" : "#0d1117", border: "none", borderRadius: "12px", fontWeight: "700", fontSize: "16px", cursor: !cameraReady || !screenReady ? "not-allowed" : "pointer" }}>
            {!cameraReady || !screenReady ? "Enable both to continue" : "Start Interview →"}
          </button>

          <p style={{ textAlign: "center", color: "#4b5563", fontSize: "12px", marginTop: "16px" }}>
            Tab switches, looking away, multiple faces, and phone detection are all monitored. 3 violations = terminated.
          </p>
        </div>
      </div>
    )
  }

  // ── MAIN INTERVIEW ──────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff" }}>
      <XPReward data={xpRewardData} onClose={() => { setXpRewardData(null); router.push("/dashboard") }} />
      <CheatDetector active={interviewActive} onTerminate={handleTerminate} onViolationCount={handleViolationCount} />

      {/* navbar */}
      <nav style={{ background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "18px" }}>InterviewPrep</span>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <CameraMonitor active={setupDone} onViolation={handleCameraViolation} />
          <span style={{ color: "#6b7280", fontSize: "14px" }}>{userEmail}</span>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>Dashboard</button>
          <button onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("email"); router.push("/login") }} style={{ background: "transparent", border: "1px solid #374151", color: "#9ca3af", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>Logout</button>
        </div>
      </nav>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: "800", letterSpacing: "-1px", marginBottom: "8px" }}>Practice Interview</h1>
          <p style={{ color: "#6b7280", fontSize: "15px" }}>Paste your resume, fill in your details, get AI-generated questions.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div>
            <label style={{ color: "#9ca3af", fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Target Role</label>
            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Developer"
              style={{ width: "100%", padding: "12px 16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ color: "#9ca3af", fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Your Background</label>
            <input type="text" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="e.g. 3rd year BTech CSE student"
              style={{ width: "100%", padding: "12px 16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", boxSizing: "border-box" }} />
          </div>
        </div>

        {!background && (
          <p style={{ color: "#4b5563", fontSize: "12px", marginBottom: "12px" }}>
            💡 Fill in your background for fair scoring — e.g. "3rd year BTech CSE", "MBA student", "2 years experience"
          </p>
        )}

        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume here..."
          style={{ width: "100%", height: "180px", padding: "14px 16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", resize: "vertical", boxSizing: "border-box", marginBottom: "12px" }} />

        <button onClick={generateQuestions} disabled={loading || !text || !role}
          style={{ width: "100%", padding: "14px", background: loading || !text || !role ? "#1f2937" : "#22c55e", color: loading || !text || !role ? "#6b7280" : "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading || !text || !role ? "not-allowed" : "pointer", marginBottom: "32px" }}>
          {loading ? "Generating..." : "Generate Interview Questions"}
        </button>

        {!loading && questions.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "60px 0", border: "2px dashed #1f2937", borderRadius: "12px" }}>
            <p style={{ fontSize: "36px", marginBottom: "12px" }}>🎯</p>
            <p style={{ color: "#e5e7eb", fontWeight: "600" }}>Ready to practice?</p>
            <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "4px" }}>Fill in your details and paste your resume above</p>
          </div>
        )}

        {error && <div style={{ padding: "14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", color: "#f87171", marginBottom: "16px" }}>{error}</div>}

        {questions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {questions.map((q, index) => {
              const cat = q.category?.toLowerCase()
              const catColor = categoryColors[cat] || "#6b7280"
              const isCoding = cat === "coding"
              const ev = evaluations[index]
              const avgScore = getAvgScore(ev, isCoding)

              return (
                <div key={index} style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: "12px", padding: "24px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", borderRadius: "100px", background: `${catColor}20`, border: `1px solid ${catColor}50`, color: catColor, fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                    {isCoding && <span>{"</>"} </span>}{q.category}
                  </div>

                  <p style={{ color: "#e5e7eb", fontWeight: "600", marginBottom: "16px", lineHeight: "1.5" }}>
                    <span style={{ color: "#22c55e", marginRight: "8px" }}>{index + 1}.</span>{q.question}
                  </p>

                  {isCoding ? (
                    <div style={{ marginBottom: "12px" }}>
                      <CodeEditor value={answers[index] || ""} onChange={(val) => setAnswers(prev => ({ ...prev, [index]: val }))} />
                    </div>
                  ) : (
                    <textarea value={answers[index] || ""} onChange={(e) => setAnswers(prev => ({ ...prev, [index]: e.target.value }))} placeholder="Type your answer here..."
                      style={{ width: "100%", height: "100px", padding: "12px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "8px", color: "#d1d5db", fontSize: "14px", resize: "vertical", boxSizing: "border-box", marginBottom: "12px" }} />
                  )}

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button onClick={() => evaluateAnswer(q.question, index, cat)} disabled={evaluatingIndex === index || !answers[index]}
                      style={{ padding: "9px 18px", background: evaluatingIndex === index || !answers[index] ? "#1f2937" : "#16a34a", color: evaluatingIndex === index || !answers[index] ? "#6b7280" : "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: evaluatingIndex === index || !answers[index] ? "not-allowed" : "pointer" }}>
                      {evaluatingIndex === index ? "Evaluating..." : isCoding ? "Evaluate Code" : "Evaluate Answer"}
                    </button>
                    {!isCoding && (
                      <button onClick={() => startListening(index)}
                        style={{ padding: "9px 18px", background: listeningIndex === index ? "rgba(239,68,68,0.2)" : "#1f2937", border: `1px solid ${listeningIndex === index ? "#ef4444" : "#374151"}`, color: listeningIndex === index ? "#ef4444" : "#9ca3af", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                        {listeningIndex === index ? "⏹ Stop" : "🎤 Speak"}
                      </button>
                    )}
                  </div>

                  {ev && (
                    <div style={{ marginTop: "16px", padding: "18px", background: "#0d1117", borderRadius: "10px", border: "1px solid #21262d" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px" }}>Overall</p>
                          <p style={{ fontSize: "32px", fontWeight: "800", color: getDimColor(parseFloat(avgScore)), margin: 0 }}>{avgScore}</p>
                          <p style={{ color: "#4b5563", fontSize: "11px", margin: 0 }}>/ 10</p>
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", minWidth: "200px" }}>
                          {(isCoding ? [
                            { label: "Correctness",  value: ev.correctness,  color: "#22d3ee" },
                            { label: "Code Quality", value: ev.codeQuality,  color: "#6366f1" },
                            { label: "Efficiency",   value: ev.efficiency,   color: "#f59e0b" },
                          ] : [
                            { label: "Technical Depth", value: ev.technicalDepth,  color: "#6366f1" },
                            { label: "Clarity",         value: ev.clarity,         color: "#22c55e" },
                            { label: "Confidence Tone", value: ev.confidenceTone,  color: "#ec4899" },
                          ]).map(d => (
                            <div key={d.label}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                <span style={{ color: "#9ca3af", fontSize: "12px" }}>{d.label}</span>
                                <span style={{ color: getDimColor(d.value), fontSize: "12px", fontWeight: "700" }}>{d.value}/10</span>
                              </div>
                              <div style={{ height: "5px", background: "#21262d", borderRadius: "100px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${(d.value / 10) * 100}%`, background: d.color, borderRadius: "100px" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p style={{ color: "#d1d5db", fontSize: "14px", marginBottom: "8px", lineHeight: "1.6" }}>
                        <span style={{ color: "#9ca3af", fontWeight: "600" }}>Feedback: </span>{ev.feedback}
                      </p>
                      <p style={{ color: "#d1d5db", fontSize: "14px", lineHeight: "1.6" }}>
                        <span style={{ color: "#9ca3af", fontWeight: "600" }}>Improve: </span>{ev.improvement}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}

            {allEvaluated && !saved && (
              <div style={{ padding: "24px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "12px", textAlign: "center" }}>
                <p style={{ color: "#22c55e", fontWeight: "600", marginBottom: "8px" }}>All questions evaluated! 🎉</p>
                <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "16px" }}>Save to earn XP and track your dimension scores.</p>
                <button onClick={() => saveSession(false)} disabled={saving}
                  style={{ padding: "12px 32px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: saving ? "not-allowed" : "pointer" }}>
                  {saving ? "Saving..." : "⚡ Save & Earn XP"}
                </button>
              </div>
            )}

            {saved && (
              <div style={{ padding: "20px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", textAlign: "center" }}>
                <p style={{ color: "#22c55e", fontWeight: "700", fontSize: "16px" }}>✓ Session saved!</p>
                <button onClick={() => router.push("/dashboard")} style={{ marginTop: "10px", padding: "8px 20px", background: "transparent", border: "1px solid #22c55e", color: "#22c55e", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}>
                  View Dashboard →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

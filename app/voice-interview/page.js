"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import XPReward from "@/components/XPReward"
import CheatDetector from "@/components/CheatDetector"
import CameraMonitor from "@/components/CameraMonitor"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

// voice states
const STATE = {
  SETUP: "setup",
  READY: "ready",
  AI_SPEAKING: "ai_speaking",
  USER_SPEAKING: "user_speaking",
  PROCESSING: "processing",
  COMPLETE: "complete",
}

export default function VoiceInterview() {
  const router = useRouter()

  // setup
  const [setupDone, setSetupDone] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [screenReady, setScreenReady] = useState(false)
  const [screenError, setScreenError] = useState("")

  // interview config
  const [role, setRole] = useState("")
  const [background, setBackground] = useState("")
  const [resume, setResume] = useState("")
  const [started, setStarted] = useState(false)

  // conversation
  const [conversationHistory, setConversationHistory] = useState([])
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [interviewState, setInterviewState] = useState(STATE.READY)
  const [questionCount, setQuestionCount] = useState(0)
  const [aiText, setAiText] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [error, setError] = useState("")

  // proctoring
  const [interviewActive, setInterviewActive] = useState(false)
  const violationsRef = useRef({ tabSwitch: 0, faceAway: 0, multipleFaces: 0, terminated: false })

  // xp
  const [xpRewardData, setXpRewardData] = useState(null)
  const [saving, setSaving] = useState(false)

  // refs
  const recognitionRef = useRef(null)
  const synthRef = useRef(null)
  const chatEndRef = useRef(null)
  const screenStreamRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) { router.push("/login"); return }
    setUserEmail(localStorage.getItem("email") || "")
    synthRef.current = window.speechSynthesis
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversationHistory, aiText])

  function getToken() { return localStorage.getItem("token") }

  // ── SETUP ──────────────────────────────────────────────────────────────────
  async function requestCamera() {
    window.dispatchEvent(new CustomEvent("suppress-blur"))
    try {
      await navigator.mediaDevices.getUserMedia({ video: true })
      setCameraReady(true)
    } catch { alert("Camera access required.") }
  }

  async function requestScreenShare() {
    setScreenError("")
    window.dispatchEvent(new CustomEvent("suppress-blur"))
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor" }, audio: false })
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        stream.getTracks().forEach(t => t.stop())
        setScreenError("Please share your Entire Screen, not a tab or window.")
        return
      }
      screenStreamRef.current = stream
      setScreenReady(true)
      track.onended = () => {
        setScreenReady(false)
        window.dispatchEvent(new CustomEvent("camera-violation", { detail: { type: "screenShareStopped" } }))
      }
    } catch (err) {
      if (err.name !== "NotAllowedError") setScreenError("Screen sharing failed. Try again.")
    }
  }

  // ── AI SPEAK ───────────────────────────────────────────────────────────────
  function speakText(text, onEnd) {
    if (!synthRef.current) { onEnd?.(); return }
    synthRef.current.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95
    utt.pitch = 1.0
    utt.volume = 1.0
    // try to get a good voice
    const voices = synthRef.current.getVoices()
    const preferred = voices.find(v => v.name.includes("Google") && v.lang === "en-US")
      || voices.find(v => v.lang === "en-US")
      || voices[0]
    if (preferred) utt.voice = preferred
    utt.onend = () => onEnd?.()
    utt.onerror = () => onEnd?.()
    synthRef.current.speak(utt)
  }

  // ── USER LISTEN ────────────────────────────────────────────────────────────
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("Use Chrome for voice interviews."); return }

    window.dispatchEvent(new CustomEvent("suppress-blur"))
    const recognition = new SR()
    recognitionRef.current = recognition
    recognition.lang = "en-US"
    recognition.continuous = false
    recognition.interimResults = true

    setCurrentTranscript("")
    setInterviewState(STATE.USER_SPEAKING)

    recognition.onresult = (e) => {
      let interim = ""
      let final = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setCurrentTranscript(final || interim)
    }

    recognition.onend = () => {
      setInterviewState(STATE.PROCESSING)
      if (currentTranscript.trim()) {
        submitAnswer(currentTranscript.trim())
      }
    }

    recognition.onerror = () => {
      setInterviewState(STATE.READY)
    }

    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
  }

  // ── SEND TO AI ─────────────────────────────────────────────────────────────
  async function startInterview() {
    if (!role || !resume) { setError("Please fill in your role and resume."); return }
    setStarted(true)
    setInterviewActive(true)
    setInterviewState(STATE.PROCESSING)

    // first message — AI starts
    await sendToAI("", [])
  }

  async function submitAnswer(userMessage) {
    // add user message to history
    const newHistory = [...conversationHistory, { role: "candidate", content: userMessage }]
    setConversationHistory(newHistory)
    setCurrentTranscript("")
    setInterviewState(STATE.PROCESSING)
    await sendToAI(userMessage, newHistory)
  }

  async function sendToAI(message, history) {
    setError("")
    try {
      const res = await fetch(`${API}/voice-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
        body: JSON.stringify({
          message,
          conversationHistory: history,
          resume,
          role,
          background,
          questionCount
        })
      })

      if (res.status === 429) {
  setInterviewState(STATE.READY)
  setError("AI is busy right now. Wait 30 seconds then click the mic to continue.")
  return
}

      const data = await res.json()
      if (data.error) { setError(data.error); setInterviewState(STATE.READY); return }

      // update question count
      if (data.isQuestion) setQuestionCount(data.questionNumber)

      // add AI response to history
      const updatedHistory = [...history, { role: "interviewer", content: data.reply }]
      setConversationHistory(updatedHistory)
      setAiText(data.reply)

      if (data.isComplete) {
        setInterviewState(STATE.AI_SPEAKING)
        speakText(data.reply, () => {
          setInterviewState(STATE.COMPLETE)
          setInterviewActive(false)
          saveVoiceSession(updatedHistory)
        })
      } else {
        setInterviewState(STATE.AI_SPEAKING)
        speakText(data.reply, () => {
          setInterviewState(STATE.READY)
        })
      }
    } catch (err) {
      setError("Connection error. Please try again.")
      setInterviewState(STATE.READY)
    }
  }

  // ── SAVE SESSION ───────────────────────────────────────────────────────────
  async function saveVoiceSession(history) {
    setSaving(true)
    // for voice sessions — create a simple score based on number of answers given
    const answers = history.filter(h => h.role === "candidate")
    const scores = answers.map((_, i) => ({
      category: "skillset",
      question: `Voice question ${i + 1}`,
      technicalDepth: 7,
      clarity: 7,
      confidenceTone: 8,
      feedback: "Voice interview completed",
      improvement: "Review your answers and practice again"
    }))

    try {
      const res = await fetch(`${API}/save-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
        body: JSON.stringify({ role, background, scores, violations: violationsRef.current, isVoiceMode: true })
      })
      const data = await res.json()
      if (res.ok) {
        const profileRes = await fetch(`${API}/profile`, { headers: { "Authorization": `Bearer ${getToken()}` } })
        const profile = await profileRes.json()
        setXpRewardData({ ...data, profile })
      }
    } catch { } finally {
      setSaving(false)
    }
  }

  function handleViolationCount({ type }) {
    const key = type === "windowBlur" ? "tabSwitch" : type
    if (violationsRef.current[key] !== undefined) violationsRef.current[key] += 1
  }

  function handleTerminate() {
    violationsRef.current.terminated = true
    synthRef.current?.cancel()
    recognitionRef.current?.stop()
    saveVoiceSession(conversationHistory)
  }

  function handleCameraViolation(type) {
    window.dispatchEvent(new CustomEvent("camera-violation", { detail: { type } }))
  }

  const stateConfig = {
    [STATE.READY]: { label: "Your turn — click mic to speak", color: "#22c55e", pulse: false },
    [STATE.AI_SPEAKING]: { label: "AI interviewer is speaking...", color: "#6366f1", pulse: true },
    [STATE.USER_SPEAKING]: { label: "Listening... speak now", color: "#f59e0b", pulse: true },
    [STATE.PROCESSING]: { label: "Processing...", color: "#6b7280", pulse: true },
    [STATE.COMPLETE]: { label: "Interview complete!", color: "#22c55e", pulse: false },
  }

  const stateInfo = stateConfig[interviewState] || stateConfig[STATE.READY]

  // ── SETUP GATE ─────────────────────────────────────────────────────────────
  if (!setupDone) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "20px" }}>InterviewPrep</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "100px", padding: "4px 14px", margin: "12px auto", display: "flex", justifyContent: "center" }}>
              <span style={{ color: "#a5b4fc", fontSize: "13px", fontWeight: "600" }}>🎤 Voice Interview Mode</span>
            </div>
            <h1 style={{ color: "#fff", fontSize: "26px", fontWeight: "800", marginTop: "16px", marginBottom: "8px" }}>AI Voice Interview</h1>
            <p style={{ color: "#6b7280", fontSize: "14px" }}>Talk to an AI interviewer in real time. No typing needed.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "24px" }}>
            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Target role (e.g. Backend Developer)"
              style={{ width: "100%", padding: "12px 16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", boxSizing: "border-box" }} />
            <input type="text" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="Your background (e.g. 3rd year BTech CSE)"
              style={{ width: "100%", padding: "12px 16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", boxSizing: "border-box" }} />
            <textarea value={resume} onChange={(e) => setResume(e.target.value)} placeholder="Paste your resume here..."
              style={{ width: "100%", height: "140px", padding: "12px 16px", background: "#161b22", border: "1px solid #30363d", borderRadius: "10px", color: "#fff", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
            <div style={{ background: "#161b22", border: `1px solid ${cameraReady ? "rgba(34,197,94,0.4)" : "#21262d"}`, borderRadius: "12px", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "20px" }}>📷</span>
                <div>
                  <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "14px", margin: 0 }}>Camera Access</p>
                  <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>Required for monitoring</p>
                </div>
              </div>
              {cameraReady ? <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "13px" }}>✓ Ready</span>
                : <button onClick={requestCamera} style={{ padding: "7px 16px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Enable</button>}
            </div>

            <div style={{ background: "#161b22", border: `1px solid ${screenReady ? "rgba(34,197,94,0.4)" : screenError ? "rgba(239,68,68,0.4)" : "#21262d"}`, borderRadius: "12px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "20px" }}>🖥️</span>
                  <div>
                    <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "14px", margin: 0 }}>Screen Share</p>
                    <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>Entire screen required</p>
                  </div>
                </div>
                {screenReady ? <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "13px" }}>✓ Sharing</span>
                  : <button onClick={requestScreenShare} style={{ padding: "7px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Share</button>}
              </div>
              {screenError && <p style={{ color: "#f87171", fontSize: "12px", marginTop: "8px", margin: "8px 0 0" }}>{screenError}</p>}
            </div>
          </div>

          {error && <p style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}

          <button
            onClick={() => setSetupDone(true)}
            disabled={!cameraReady || !screenReady || !role || !resume}
            style={{ width: "100%", padding: "14px", background: (!cameraReady || !screenReady || !role || !resume) ? "#1f2937" : "linear-gradient(135deg, #6366f1, #8b5cf6)", color: (!cameraReady || !screenReady || !role || !resume) ? "#4b5563" : "#fff", border: "none", borderRadius: "12px", fontWeight: "700", fontSize: "16px", cursor: (!cameraReady || !screenReady || !role || !resume) ? "not-allowed" : "pointer" }}>
            {(!cameraReady || !screenReady) ? "Enable camera + screen first" : !role || !resume ? "Fill in role and resume" : "🎤 Start Voice Interview"}
          </button>
        </div>
      </div>
    )
  }

  // ── VOICE INTERVIEW UI ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", display: "flex", flexDirection: "column" }}>
      <XPReward data={xpRewardData} onClose={() => { setXpRewardData(null); router.push("/dashboard") }} />
      <CheatDetector active={interviewActive} onTerminate={handleTerminate} onViolationCount={handleViolationCount} />

      {/* navbar */}
      <nav style={{ background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#22c55e", fontWeight: "700", fontSize: "18px" }}>InterviewPrep</span>
          <span style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", fontSize: "11px", fontWeight: "600", padding: "2px 10px", borderRadius: "100px" }}>🎤 Voice Mode</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <CameraMonitor active={setupDone} onViolation={handleCameraViolation} />
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", padding: "7px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>Dashboard</button>
        </div>
      </nav>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT: AI avatar + controls */}
        <div style={{ width: "300px", flexShrink: 0, borderRight: "1px solid #1f2937", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", gap: "24px" }}>

          {/* AI avatar */}
          <div style={{ position: "relative" }}>
            <div style={{
              width: "120px", height: "120px", borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "48px",
              boxShadow: interviewState === STATE.AI_SPEAKING
                ? "0 0 0 8px rgba(99,102,241,0.2), 0 0 0 16px rgba(99,102,241,0.1)"
                : "none",
              transition: "box-shadow 0.3s ease",
              animation: stateInfo.pulse ? "avatarPulse 2s infinite" : "none"
            }}>
              🤖
            </div>
            {interviewState === STATE.AI_SPEAKING && (
              <div style={{ position: "absolute", bottom: "4px", right: "4px", width: "24px", height: "24px", borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "12px" }}>🔊</span>
              </div>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#e5e7eb", fontWeight: "700", fontSize: "16px", margin: "0 0 4px" }}>AI Interviewer</p>
            <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>for {role}</p>
          </div>

          {/* status indicator */}
          <div style={{ background: "#161b22", border: `1px solid ${stateInfo.color}30`, borderRadius: "12px", padding: "12px 20px", textAlign: "center", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: stateInfo.color, animation: stateInfo.pulse ? "dotPulse 1s infinite" : "none" }} />
              <span style={{ color: stateInfo.color, fontSize: "13px", fontWeight: "600" }}>{stateInfo.label}</span>
            </div>
          </div>

          {/* question counter */}
          {started && (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#6b7280", fontSize: "12px", margin: "0 0 4px" }}>Questions</p>
              <p style={{ color: "#e5e7eb", fontWeight: "800", fontSize: "28px", margin: 0 }}>{questionCount}/5</p>
            </div>
          )}

          {/* MIC BUTTON */}
          {!started ? (
            <button
              onClick={startInterview}
              style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: "700", fontSize: "15px", cursor: "pointer" }}>
              🎤 Start Interview
            </button>
          ) : interviewState === STATE.READY ? (
            <button
              onClick={startListening}
              style={{ width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #16a34a, #22c55e)", color: "#fff", border: "none", cursor: "pointer", fontSize: "28px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 24px rgba(34,197,94,0.4)" }}>
              🎤
            </button>
          ) : interviewState === STATE.USER_SPEAKING ? (
            <button
              onClick={stopListening}
              style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(239,68,68,0.2)", color: "#ef4444", border: "2px solid #ef4444", cursor: "pointer", fontSize: "28px", display: "flex", alignItems: "center", justifyContent: "center", animation: "dotPulse 1s infinite" }}>
              ⏹
            </button>
          ) : interviewState === STATE.COMPLETE ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#22c55e", fontWeight: "700", fontSize: "14px", marginBottom: "8px" }}>✓ Interview Complete!</p>
              {saving && <p style={{ color: "#6b7280", fontSize: "12px" }}>Saving session...</p>}
            </div>
          ) : (
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "24px", height: "24px", border: "3px solid #6b7280", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            </div>
          )}

          {error && <p style={{ color: "#f87171", fontSize: "12px", textAlign: "center" }}>{error}</p>}
        </div>

        {/* RIGHT: conversation */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {!started && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#6b7280", textAlign: "center" }}>
              <p style={{ fontSize: "48px", marginBottom: "16px" }}>🎤</p>
              <p style={{ fontSize: "18px", fontWeight: "600", color: "#e5e7eb", marginBottom: "8px" }}>Ready for your voice interview?</p>
              <p style={{ fontSize: "14px" }}>Click "Start Interview" to begin. The AI will ask you 5 questions based on your resume.</p>
              <p style={{ fontSize: "13px", marginTop: "8px", color: "#4b5563" }}>Speak naturally — the AI will respond out loud.</p>
            </div>
          )}

          {conversationHistory.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexDirection: msg.role === "candidate" ? "row-reverse" : "row" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: msg.role === "interviewer" ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>
                {msg.role === "interviewer" ? "🤖" : "👤"}
              </div>
              <div style={{ maxWidth: "70%", background: msg.role === "interviewer" ? "#161b22" : "rgba(34,197,94,0.08)", border: `1px solid ${msg.role === "interviewer" ? "#21262d" : "rgba(34,197,94,0.2)"}`, borderRadius: msg.role === "interviewer" ? "4px 12px 12px 12px" : "12px 4px 12px 12px", padding: "12px 16px" }}>
                <p style={{ color: msg.role === "interviewer" ? "#e5e7eb" : "#d1fae5", fontSize: "14px", lineHeight: "1.6", margin: 0 }}>{msg.content}</p>
              </div>
            </div>
          ))}

          {/* live transcript */}
          {interviewState === STATE.USER_SPEAKING && currentTranscript && (
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexDirection: "row-reverse" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>👤</div>
              <div style={{ maxWidth: "70%", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: "12px 4px 12px 12px", padding: "12px 16px" }}>
                <p style={{ color: "#6b7280", fontSize: "13px", fontStyle: "italic", margin: 0 }}>{currentTranscript}...</p>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      <style>{`
        @keyframes avatarPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

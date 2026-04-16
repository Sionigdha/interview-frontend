"use client"
import { useEffect, useRef, useState } from "react"

const MAX_WARNINGS = 3

// Grace period in ms after certain events where blur should be ignored
// This covers: mic permission popup, camera popup, browser dialogs
const BLUR_GRACE_MS = 3000

export default function CheatDetector({ onTerminate, onViolationCount, active }) {
  const [warnings, setWarnings] = useState([])
  const [terminated, setTerminated] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [lastWarning, setLastWarning] = useState("")
  const violationCountRef = useRef(0)
  const terminatedRef = useRef(false)
  const lastBlurIgnoreRef = useRef(0)   // timestamp of last event that should suppress blur
  const bannerTimerRef = useRef(null)

  // call this before any action that will trigger a browser dialog
  // (mic, camera, screen share permission popups)
  // exposed via custom event so other components can call it
  function suppressNextBlur() {
    lastBlurIgnoreRef.current = Date.now()
  }

  useEffect(() => {
    if (!active) return

    // listen for suppress-blur events from other components
    function handleSuppressBlur() { suppressNextBlur() }
    window.addEventListener("suppress-blur", handleSuppressBlur)

    // ── TAB SWITCH — most reliable method ──
    // visibilitychange fires when user switches tabs or minimizes
    function handleVisibilityChange() {
      if (document.hidden) {
        triggerViolation("tabSwitch", "⚠️ Tab switch detected — stay on this page")
      }
    }

    // ── WINDOW BLUR — catches alt+tab, clicking outside browser ──
    // BUT we ignore it if:
    // 1. It happened within BLUR_GRACE_MS of a whitelisted action (mic popup etc)
    // 2. document is still visible (DevTools opening, browser dialog)
    function handleBlur() {
      const now = Date.now()
      const timeSinceSuppress = now - lastBlurIgnoreRef.current

      // if within grace period — ignore (mic/camera popup)
      if (timeSinceSuppress < BLUR_GRACE_MS) return

      // if document is still visible, it's likely a browser dialog — ignore
      if (!document.hidden && document.visibilityState === "visible") {
        // small delay to check if it's a real navigation away
        setTimeout(() => {
          // if document is now hidden, it was a real tab switch (already caught by visibilitychange)
          // if still visible, it was a dialog/DevTools — ignore
          if (!document.hidden) return
        }, 300)
        return
      }

      triggerViolation("windowBlur", "⚠️ Window focus lost — stay on this page")
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("blur", handleBlur)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("blur", handleBlur)
      window.removeEventListener("suppress-blur", handleSuppressBlur)
    }
  }, [active])

  // camera violations from CameraMonitor
  useEffect(() => {
    function handleCameraViolation(e) {
      if (terminatedRef.current) return
      const type = e.detail?.type
      if (type === "faceAway") triggerViolation("faceAway", "⚠️ Face not visible — look at the screen")
      if (type === "multipleFaces") triggerViolation("multipleFaces", "⚠️ Multiple faces detected")
      if (type === "phoneDetected") triggerViolation("phoneDetected", "⚠️ Phone detected in frame")
      if (type === "excessiveMouth") triggerViolation("excessiveMouth", "⚠️ Suspicious mouth movement detected")
      if (type === "screenShareStopped") triggerViolation("screenShareStopped", "⚠️ Screen sharing stopped")
    }
    window.addEventListener("camera-violation", handleCameraViolation)
    return () => window.removeEventListener("camera-violation", handleCameraViolation)
  }, [active])

  function triggerViolation(type, message) {
    if (terminatedRef.current) return

    violationCountRef.current += 1
    const count = violationCountRef.current

    setWarnings(prev => [...prev, { type, message, time: new Date().toLocaleTimeString() }])
    setLastWarning(message)
    setShowBanner(true)
    onViolationCount({ type, count })

    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    bannerTimerRef.current = setTimeout(() => setShowBanner(false), 5000)

    if (count >= MAX_WARNINGS) {
      terminatedRef.current = true
      setTerminated(true)
      onTerminate()
    }
  }

  const warningCount = violationCountRef.current
  const remaining = Math.max(0, MAX_WARNINGS - warningCount)

  return (
    <>
      {/* warning banner */}
      {showBanner && !terminated && (
        <div style={{
          position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "#7c2d12", border: "1px solid #ef4444",
          borderRadius: "12px", padding: "14px 24px", display: "flex",
          alignItems: "center", gap: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "slideDown 0.3s ease", minWidth: "320px"
        }}>
          <span style={{ fontSize: "22px" }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#fca5a5", fontWeight: "700", fontSize: "14px", margin: 0 }}>{lastWarning}</p>
            <p style={{ color: "#f87171", fontSize: "12px", margin: "2px 0 0" }}>
              Warning {warningCount}/{MAX_WARNINGS} — {remaining} more before termination
            </p>
          </div>
          <button onClick={() => setShowBanner(false)} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "18px", padding: "0 4px" }}>×</button>
        </div>
      )}

      {/* terminated overlay */}
      {terminated && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(0,0,0,0.97)", display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px"
        }}>
          <div style={{ textAlign: "center", maxWidth: "500px" }}>
            <div style={{ fontSize: "64px", marginBottom: "24px" }}>🚫</div>
            <h1 style={{ color: "#ef4444", fontSize: "28px", fontWeight: "800", marginBottom: "12px", letterSpacing: "-0.5px" }}>
              Interview Terminated
            </h1>
            <p style={{ color: "#9ca3af", fontSize: "16px", marginBottom: "32px", lineHeight: "1.6" }}>
              You received {MAX_WARNINGS} violations for suspicious activity. This session has been flagged and saved.
            </p>
            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "12px", padding: "16px", marginBottom: "28px", textAlign: "left" }}>
              <p style={{ color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Violation Log</p>
              {warnings.map((w, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < warnings.length - 1 ? "1px solid #21262d" : "none" }}>
                  <span style={{ color: "#f87171", fontSize: "13px" }}>{w.message}</span>
                  <span style={{ color: "#4b5563", fontSize: "12px" }}>{w.time}</span>
                </div>
              ))}
            </div>
            <button onClick={() => window.location.href = "/dashboard"}
              style={{ padding: "12px 32px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: "pointer" }}>
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* live violation badge */}
      {active && !terminated && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px", zIndex: 1000,
          background: warningCount > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
          border: `1px solid ${warningCount > 0 ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
          borderRadius: "10px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px"
        }}>
          <span style={{ fontSize: "16px" }}>{warningCount > 0 ? "⚠️" : "🛡️"}</span>
          <div>
            <p style={{ color: warningCount > 0 ? "#f87171" : "#22c55e", fontSize: "12px", fontWeight: "700", margin: 0 }}>
              {warningCount === 0 ? "No violations" : `${warningCount}/${MAX_WARNINGS} warnings`}
            </p>
            <p style={{ color: "#6b7280", fontSize: "11px", margin: 0 }}>Proctored session</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  )
}

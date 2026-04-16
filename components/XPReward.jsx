"use client"
import { useEffect, useState } from "react"

// XPReward — animated popup shown after saving a session
// shows XP earned, breakdown, new badges, level up

export default function XPReward({ data, onClose }) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0) // 0=xp, 1=badges, 2=levelup

  useEffect(() => {
    if (!data) return
    setTimeout(() => setVisible(true), 100)
  }, [data])

  if (!data || !visible) return null

  const { xp, streak, badges } = data
  const hasNewBadges = badges?.awarded?.length > 0
  const isLevelUp = xp?.levelUp

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px", animation: "fadeIn 0.3s ease"
    }}>
      <div style={{
        width: "100%", maxWidth: "440px",
        background: "#161b22", border: "1px solid #21262d",
        borderRadius: "20px", padding: "32px",
        animation: "slideUp 0.4s ease"
      }}>

        {/* XP earned header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>⚡</div>
          <h2 style={{ color: "#fff", fontSize: "26px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "4px" }}>
            +{xp.earned} XP
          </h2>
          <p style={{ color: "#6b7280", fontSize: "14px" }}>
            Total: {xp.total} XP
          </p>

          {/* streak */}
          {streak?.isStreak && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "10px", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "100px", padding: "4px 14px" }}>
              <span>🔥</span>
              <span style={{ color: "#eab308", fontSize: "13px", fontWeight: "700" }}>{streak.current} day streak!</span>
            </div>
          )}
        </div>

        {/* XP breakdown */}
        <div style={{ background: "#0d1117", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
          <p style={{ color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>XP Breakdown</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {xp.breakdown.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#d1d5db", fontSize: "13px" }}>{item.reason}</span>
                <span style={{
                  fontSize: "13px", fontWeight: "700",
                  color: item.xp > 0 ? "#22c55e" : "#ef4444"
                }}>
                  {item.xp > 0 ? "+" : ""}{item.xp}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* level up */}
        {isLevelUp && (
          <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "12px", padding: "16px", marginBottom: "20px", textAlign: "center" }}>
            <p style={{ fontSize: "28px", marginBottom: "6px" }}>🎉</p>
            <p style={{ color: "#eab308", fontWeight: "800", fontSize: "16px" }}>Level Up!</p>
            <p style={{ color: "#d1d5db", fontSize: "14px", marginTop: "4px" }}>
              You are now <strong style={{ color: "#fff" }}>{xp.newLevel.label}</strong>
            </p>
          </div>
        )}

        {/* new badges */}
        {hasNewBadges && (
          <div style={{ marginBottom: "20px" }}>
            <p style={{ color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>New Badges Unlocked</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {badges.awarded.map((badge, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "10px", padding: "12px 14px" }}>
                  <span style={{ fontSize: "24px" }}>{badge.icon}</span>
                  <div>
                    <p style={{ color: "#22c55e", fontWeight: "700", fontSize: "14px", margin: 0 }}>{badge.label}</p>
                    <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>{badge.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* XP progress bar to next level */}
        {data.profile && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ color: "#9ca3af", fontSize: "12px" }}>{data.profile.levelInfo?.label}</span>
              <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                {data.profile.nextLevel ? `${data.profile.xpToNext} XP to ${data.profile.nextLevel.label}` : "Max level!"}
              </span>
            </div>
            <div style={{ height: "6px", background: "#21262d", borderRadius: "100px", overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#22c55e", borderRadius: "100px",
                width: data.profile.nextLevel
                  ? `${Math.min(100, ((xp.total - (data.profile.levelInfo?.minXP || 0)) / ((data.profile.nextLevel?.minXP || 1) - (data.profile.levelInfo?.minXP || 0))) * 100)}%`
                  : "100%",
                transition: "width 1s ease"
              }} />
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{ width: "100%", padding: "13px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: "pointer" }}
        >
          Continue →
        </button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}

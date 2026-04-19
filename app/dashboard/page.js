"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts"
import API_URL from "../config"
const LEVELS = [
  { level: 1, label: "Beginner",      minXP: 0 },
  { level: 2, label: "Apprentice",    minXP: 200 },
  { level: 3, label: "Intermediate",  minXP: 500 },
  { level: 4, label: "Advanced",      minXP: 1000 },
  { level: 5, label: "Expert",        minXP: 2000 },
  { level: 6, label: "Interview God", minXP: 5000 },
]

const ALL_BADGES = [
  { id: "first_blood",   label: "First Blood",  icon: "🎯", desc: "Complete your first session" },
  { id: "on_fire",       label: "On Fire",       icon: "🔥", desc: "7 day streak" },
  { id: "code_warrior",  label: "Code Warrior",  icon: "💻", desc: "Coding correctness 8+ in 3 sessions" },
  { id: "big_brain",     label: "Big Brain",     icon: "🧠", desc: "All dimension avgs 8+ in one session" },
  { id: "clean_record",  label: "Clean Record",  icon: "👁️", desc: "5 sessions with zero violations" },
  { id: "grinder",       label: "Grinder",       icon: "🚀", desc: "Complete 10 sessions" },
  { id: "interview_god", label: "Interview God", icon: "👑", desc: "Overall avg 8.5+ across 10 sessions" },
]

// Each category and its 3 dimensions
const CATEGORY_DIMS = {
  skillset:  {
    label: "Skillset", color: "#6366f1",
    dims: [
      { key: "technicalDepth",  label: "Technical Depth",  color: "#6366f1" },
      { key: "clarity",         label: "Clarity",          color: "#22c55e" },
      { key: "confidenceTone",  label: "Confidence Tone",  color: "#ec4899" },
    ]
  },
  education: {
    label: "Education", color: "#22c55e",
    dims: [
      { key: "technicalDepth",  label: "Technical Depth",  color: "#6366f1" },
      { key: "clarity",         label: "Clarity",          color: "#22c55e" },
      { key: "confidenceTone",  label: "Confidence Tone",  color: "#ec4899" },
    ]
  },
  work: {
    label: "Work", color: "#f59e0b",
    dims: [
      { key: "technicalDepth",  label: "Technical Depth",  color: "#6366f1" },
      { key: "clarity",         label: "Clarity",          color: "#22c55e" },
      { key: "confidenceTone",  label: "Confidence Tone",  color: "#ec4899" },
    ]
  },
  hr: {
    label: "HR", color: "#ec4899",
    dims: [
      { key: "technicalDepth",  label: "Technical Depth",  color: "#6366f1" },
      { key: "clarity",         label: "Clarity",          color: "#22c55e" },
      { key: "confidenceTone",  label: "Confidence Tone",  color: "#ec4899" },
    ]
  },
  coding: {
    label: "Coding", color: "#22d3ee",
    dims: [
      { key: "correctness",  label: "Correctness",  color: "#22d3ee" },
      { key: "codeQuality",  label: "Code Quality", color: "#6366f1" },
      { key: "efficiency",   label: "Efficiency",   color: "#f59e0b" },
    ]
  },
}

export default function Dashboard() {
  const router = useRouter()
  const [sessions, setSessions] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [userEmail, setUserEmail] = useState("")
  const [fetchError, setFetchError] = useState("")

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) { router.push("/login"); return }
    setUserEmail(localStorage.getItem("email") || "")
    fetchAll(token)
  }, [])

  async function fetchAll(token) {
    setLoading(true)
    setFetchError("")
    try {
      const [sessRes, profRes] = await Promise.all([
        fetch(`${API_URL}/sessions`, { headers: { "Authorization": `Bearer ${token}` } }),
        fetch(`${API_URL}/profile`,  { headers: { "Authorization": `Bearer ${token}` } }),
      ])

      if (!sessRes.ok || !profRes.ok) {
        setFetchError("Failed to load data. Is the backend running?")
        return
      }

      const sessData = await sessRes.json()
      const profData = await profRes.json()

      console.log("Sessions:", sessData)
      console.log("Profile:", profData)

      setSessions(sessData.sessions || [])
      setProfile(profData)
    } catch (err) {
      console.error("Fetch error:", err)
      setFetchError("Cannot connect to backend at localhost:4000. Make sure it is running.")
    } finally {
      setLoading(false)
    }
  }

  // safely get scores array from a session
  // handles both old format (object) and new format (array)
  function getScoresArray(session) {
    const s = session.scores
    if (!s) return []
    if (Array.isArray(s)) return s
    // old format was an object like { skillset: 7.5, hr: 6.0 }
    // convert to array format for display
    return Object.entries(s).map(([category, val]) => ({
      category,
      technicalDepth: val,
      clarity: val,
      confidenceTone: val,
    }))
  }

  // get overall avg for a session (works with both old and new format)
  function getSessionAvg(session) {
    const arr = getScoresArray(session)
    if (arr.length === 0) return null
    const allVals = arr.flatMap(q => {
      const isCoding = q.category === "coding"
      if (isCoding) return [q.correctness, q.codeQuality, q.efficiency].filter(v => v != null)
      return [q.technicalDepth, q.clarity, q.confidenceTone].filter(v => v != null)
    })
    if (allVals.length === 0) return null
    return parseFloat((allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(1))
  }

  // build chart data for ONE category — x axis = session number, 3 lines = 3 dimensions
  // returns array like: [{ session: "S1", technicalDepth: 7, clarity: 8, confidenceTone: 6 }, ...]
  function buildCategoryChartData(categoryKey) {
    const catDef = CATEGORY_DIMS[categoryKey]
    if (!catDef) return []

    // sessions are newest first — reverse for chronological chart
    const chronological = [...sessions].reverse()

    const points = []
    chronological.forEach((session, i) => {
      const arr = getScoresArray(session)
      // get all questions of this category
      const catQs = arr.filter(q => q.category?.toLowerCase() === categoryKey)
      if (catQs.length === 0) return  // session had no question of this category

      const point = { session: `S${i + 1}` }
      catDef.dims.forEach(dim => {
        const vals = catQs.map(q => q[dim.key]).filter(v => v != null && typeof v === "number")
        point[dim.key] = vals.length
          ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
          : null
      })
      points.push(point)
    })
    return points
  }

  const latest = sessions[0]
  const latestScores = latest ? getScoresArray(latest) : []
  const latestAvg = latest ? getSessionAvg(latest) : null

  function getScoreColor(score) {
    if (score == null) return "#4b5563"
    if (score >= 8) return "#22c55e"
    if (score >= 5) return "#eab308"
    return "#ef4444"
  }

  const currentLevel = profile ? LEVELS.find(l => l.level === profile.level) || LEVELS[0] : LEVELS[0]
  const nextLevel = profile ? LEVELS.find(l => l.level === (profile.level || 1) + 1) : null
  const xpIntoLevel = profile ? (profile.xp || 0) - currentLevel.minXP : 0
  const xpNeeded = nextLevel ? nextLevel.minXP - currentLevel.minXP : 1
  const xpPercent = nextLevel ? Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100)) : 100
  const earnedBadges = profile?.badges || []

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", padding: "10px 14px" }}>
          <p style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "6px" }}>{label}</p>
          {payload.map(p => p.value != null && (
            <p key={p.dataKey} style={{ color: p.color, fontSize: "13px", fontWeight: "600", margin: "2px 0" }}>
              {p.name}: {p.value}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const navItems = [
    { id: "overview", icon: "◉", label: "Overview" },
    { id: "graphs",   icon: "◈", label: "Graphs" },
    { id: "badges",   icon: "◎", label: "Badges" },
    { id: "history",  icon: "◇", label: "History" },
  ]

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", display: "flex", flexDirection: "column" }}>

      {/* navbar */}
      <nav style={{ background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#22c55e", fontWeight: "800", fontSize: "18px" }}>InterviewPrep</span>
          <span style={{ color: "#30363d" }}>|</span>
          <span style={{ color: "#6b7280", fontSize: "13px" }}>Dashboard</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontSize: "13px" }}>{userEmail}</span>
          <button onClick={() => router.push("/interview")} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", padding: "7px 16px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontWeight: "600" }}>+ Practice</button>
          <button onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("email"); router.push("/login") }} style={{ background: "transparent", border: "1px solid #374151", color: "#9ca3af", padding: "7px 16px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }}>Logout</button>
        </div>
      </nav>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* sidebar */}
        <aside style={{ width: "220px", flexShrink: 0, background: "#0d1117", borderRight: "1px solid #1f2937", display: "flex", flexDirection: "column", padding: "24px 0" }}>
          <div style={{ padding: "0 16px 24px", borderBottom: "1px solid #1f2937", marginBottom: "16px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", marginBottom: "10px" }}>👤</div>
            {profile && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: "800", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "6px", padding: "2px 8px" }}>LVL {profile.level || 1}</span>
                  <span style={{ color: "#e5e7eb", fontSize: "12px", fontWeight: "600" }}>{currentLevel.label}</span>
                </div>
                <div style={{ height: "4px", background: "#21262d", borderRadius: "100px", overflow: "hidden", marginBottom: "4px" }}>
                  <div style={{ height: "100%", width: `${xpPercent}%`, background: "linear-gradient(90deg, #16a34a, #22c55e)", borderRadius: "100px" }} />
                </div>
                <p style={{ color: "#4b5563", fontSize: "11px", margin: 0 }}>{profile.xp || 0} XP</p>
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "0 10px" }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", border: "none", cursor: "pointer", background: activeTab === item.id ? "rgba(34,197,94,0.1)" : "transparent", color: activeTab === item.id ? "#22c55e" : "#6b7280", fontSize: "14px", fontWeight: activeTab === item.id ? "600" : "400", textAlign: "left", width: "100%", borderLeft: activeTab === item.id ? "2px solid #22c55e" : "2px solid transparent" }}>
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>

          {profile && (
            <div style={{ marginTop: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ background: (profile.streak || 0) >= 1 ? "rgba(234,179,8,0.08)" : "#161b22", border: `1px solid ${(profile.streak || 0) >= 1 ? "rgba(234,179,8,0.2)" : "#21262d"}`, borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <p style={{ fontSize: "20px", margin: 0 }}>🔥</p>
                <p style={{ color: (profile.streak || 0) >= 1 ? "#eab308" : "#4b5563", fontWeight: "800", fontSize: "18px", margin: "2px 0" }}>{profile.streak || 0}</p>
                <p style={{ color: "#6b7280", fontSize: "11px", margin: 0 }}>day streak</p>
              </div>
              <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <p style={{ fontSize: "20px", margin: 0 }}>📋</p>
                <p style={{ color: "#e5e7eb", fontWeight: "800", fontSize: "18px", margin: "2px 0" }}>{sessions.length}</p>
                <p style={{ color: "#6b7280", fontSize: "11px", margin: 0 }}>sessions</p>
              </div>
            </div>
          )}
        </aside>

        {/* main */}
        <main style={{ flex: 1, overflowY: "auto", padding: "32px" }}>

          {/* backend error */}
          {fetchError && (
            <div style={{ padding: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", color: "#f87171", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{fetchError}</span>
              <button onClick={() => fetchAll(localStorage.getItem("token"))} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontSize: "13px" }}>Retry</button>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "80px", color: "#6b7280" }}>
              <p style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</p>
              <p>Loading your data...</p>
            </div>
          )}

          {!loading && !fetchError && (
            <>
              {/* ══ OVERVIEW ══ */}
              {activeTab === "overview" && (
                <div>
                  <h2 style={{ fontSize: "24px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "4px" }}>Overview</h2>
                  <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>Your latest performance at a glance</p>

                  {/* XP bar */}
                  {profile && (
                    <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: "14px", padding: "24px", marginBottom: "20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ color: "#22c55e", fontWeight: "800", fontSize: "12px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "6px", padding: "3px 10px" }}>LVL {profile.level || 1}</span>
                          <span style={{ color: "#e5e7eb", fontWeight: "700", fontSize: "16px" }}>{currentLevel.label}</span>
                        </div>
                        <span style={{ color: "#6b7280", fontSize: "12px" }}>
                          {nextLevel ? `${nextLevel.minXP - (profile.xp || 0)} XP to ${nextLevel.label}` : "👑 Max level!"}
                        </span>
                      </div>
                      <div style={{ height: "8px", background: "#21262d", borderRadius: "100px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${xpPercent}%`, background: "linear-gradient(90deg, #16a34a, #22c55e)", borderRadius: "100px", transition: "width 0.8s ease" }} />
                      </div>
                      <p style={{ color: "#4b5563", fontSize: "12px", marginTop: "6px" }}>{profile.xp || 0} XP total</p>
                    </div>
                  )}

                  {sessions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "80px 24px", border: "2px dashed #1f2937", borderRadius: "16px" }}>
                      <p style={{ fontSize: "40px", marginBottom: "16px" }}>📊</p>
                      <p style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "18px", marginBottom: "8px" }}>No sessions yet</p>
                      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>Complete a practice interview to see your stats here.</p>
                      <button onClick={() => router.push("/interview")} style={{ padding: "12px 28px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "10px", fontWeight: "700", cursor: "pointer" }}>Start Practicing</button>
                    </div>
                  ) : (
                    <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: "14px", padding: "24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                        <div>
                          <p style={{ color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Latest Session</p>
                          <p style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>{latest.role}</p>
                          {latest.background && <p style={{ color: "#6366f1", fontSize: "12px", margin: "2px 0 0" }}>{latest.background}</p>}
                          <p style={{ color: "#6b7280", fontSize: "13px", marginTop: "4px" }}>
                            {new Date(latest.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Avg Score</p>
                          <p style={{ fontSize: "40px", fontWeight: "800", color: getScoreColor(latestAvg), margin: 0 }}>{latestAvg ?? "—"}</p>
                          {latest.xpEarned > 0 && <p style={{ color: "#22c55e", fontSize: "13px", fontWeight: "600", margin: 0 }}>+{latest.xpEarned} XP</p>}
                        </div>
                      </div>

                      {/* per question breakdown */}
                      {latestScores.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {latestScores.map((q, i) => {
                            const isCoding = q.category === "coding"
                            const catDef = CATEGORY_DIMS[q.category?.toLowerCase()]
                            const dims = catDef?.dims || []
                            const catColor = catDef?.color || "#6b7280"
                            return (
                              <div key={i} style={{ background: "#0d1117", borderRadius: "10px", padding: "14px", border: `1px solid ${catColor}20` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                                  <span style={{ color: catColor, fontSize: "10px", fontWeight: "600", textTransform: "uppercase", background: `${catColor}15`, border: `1px solid ${catColor}30`, borderRadius: "4px", padding: "2px 8px" }}>{q.category}</span>
                                  <span style={{ color: "#6b7280", fontSize: "12px" }}>Q{i + 1}</span>
                                </div>
                                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                                  {dims.map(d => (
                                    <div key={d.key}>
                                      <p style={{ color: "#6b7280", fontSize: "10px", margin: "0 0 2px" }}>{d.label}</p>
                                      <p style={{ color: getScoreColor(q[d.key]), fontWeight: "800", fontSize: "20px", margin: 0 }}>{q[d.key] ?? "—"}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ══ GRAPHS ══ */}
              {activeTab === "graphs" && (
                <div>
                  <h2 style={{ fontSize: "24px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "4px" }}>Performance Graphs</h2>
                  <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>One graph per category — 3 dimension lines per graph</p>

                  {sessions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px", border: "2px dashed #1f2937", borderRadius: "14px" }}>
                      <p style={{ color: "#6b7280" }}>No sessions yet. Complete an interview first.</p>
                      <button onClick={() => router.push("/interview")} style={{ marginTop: "16px", padding: "10px 24px", background: "#22c55e", color: "#0d1117", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>Start Practicing</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
                      {Object.entries(CATEGORY_DIMS).map(([catKey, catDef]) => {
                        const chartData = buildCategoryChartData(catKey)
                        const hasData = chartData.length > 0

                        return (
                          <div key={catKey} style={{ background: "#161b22", border: `1px solid ${catDef.color}25`, borderRadius: "16px", padding: "24px" }}>
                            {/* graph header */}
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: catDef.color, flexShrink: 0 }} />
                              <p style={{ fontWeight: "700", fontSize: "16px", color: catDef.color, margin: 0 }}>{catDef.label}</p>
                            </div>

                            {/* dimension legend */}
                            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                              {catDef.dims.map(d => (
                                <div key={d.key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <div style={{ width: "20px", height: "2px", background: d.color, borderRadius: "2px" }} />
                                  <span style={{ color: "#6b7280", fontSize: "11px" }}>{d.label}</span>
                                </div>
                              ))}
                            </div>

                            {!hasData ? (
                              <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #21262d", borderRadius: "8px" }}>
                                <p style={{ color: "#4b5563", fontSize: "13px" }}>No {catDef.label} questions in any session yet</p>
                              </div>
                            ) : (
                              <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                  <XAxis
                                    dataKey="session"
                                    tick={{ fill: "#6b7280", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis
                                    domain={[0, 10]}
                                    ticks={[0, 2, 4, 6, 8, 10]}
                                    tick={{ fill: "#6b7280", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <Tooltip content={<CustomTooltip />} />
                                  {catDef.dims.map(d => (
                                    <Line
                                      key={d.key}
                                      type="monotone"
                                      dataKey={d.key}
                                      name={d.label}
                                      stroke={d.color}
                                      strokeWidth={2.5}
                                      dot={{ fill: d.color, r: 4, strokeWidth: 0 }}
                                      activeDot={{ r: 6 }}
                                      connectNulls
                                    />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══ BADGES ══ */}
              {activeTab === "badges" && (
                <div>
                  <h2 style={{ fontSize: "24px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "4px" }}>Badges</h2>
                  <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>{earnedBadges.length} / {ALL_BADGES.length} earned</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
                    {ALL_BADGES.map(badge => {
                      const earned = earnedBadges.includes(badge.id)
                      return (
                        <div key={badge.id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "20px", background: earned ? "rgba(34,197,94,0.05)" : "#161b22", border: `1px solid ${earned ? "rgba(34,197,94,0.25)" : "#21262d"}`, borderRadius: "12px", opacity: earned ? 1 : 0.4 }}>
                          <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: earned ? "rgba(34,197,94,0.1)" : "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", flexShrink: 0, filter: earned ? "none" : "grayscale(1)" }}>{badge.icon}</div>
                          <div>
                            <p style={{ color: earned ? "#e5e7eb" : "#6b7280", fontWeight: "700", fontSize: "15px", margin: "0 0 4px" }}>{badge.label}</p>
                            <p style={{ color: "#4b5563", fontSize: "12px", margin: 0 }}>{badge.desc}</p>
                            {earned && <p style={{ color: "#22c55e", fontSize: "11px", fontWeight: "600", margin: "4px 0 0" }}>✓ Unlocked</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ══ HISTORY ══ */}
              {activeTab === "history" && (
                <div>
                  <h2 style={{ fontSize: "24px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "4px" }}>Session History</h2>
                  <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>All your past interview sessions</p>

                  {sessions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px", border: "2px dashed #1f2937", borderRadius: "14px" }}>
                      <p style={{ color: "#6b7280" }}>No sessions yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {sessions.map((s, i) => {
                        const avg = getSessionAvg(s)
                        const hasViolations = s.violations?.terminated
                        const scoresArr = getScoresArray(s)
                        return (
                          <div key={s.id} style={{ padding: "18px 20px", background: "#161b22", borderRadius: "12px", border: `1px solid ${hasViolations ? "rgba(239,68,68,0.2)" : "#21262d"}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                <span style={{ color: "#30363d", fontSize: "13px", fontWeight: "700", minWidth: "32px" }}>#{sessions.length - i}</span>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <p style={{ fontWeight: "600", fontSize: "15px", margin: 0 }}>{s.role}</p>
                                    {hasViolations && <span style={{ fontSize: "10px", color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "4px", padding: "1px 7px" }}>FLAGGED</span>}
                                  </div>
                                  {s.background && <p style={{ color: "#6366f1", fontSize: "12px", margin: "2px 0 0" }}>{s.background}</p>}
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "2px" }}>
                                    <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>
                                      {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    </p>
                                    {s.xpEarned > 0 && <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: "600" }}>+{s.xpEarned} XP</span>}
                                  </div>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <p style={{ color: "#6b7280", fontSize: "10px", textTransform: "uppercase", margin: 0 }}>Avg</p>
                                <p style={{ fontWeight: "800", fontSize: "24px", color: getScoreColor(avg), margin: 0 }}>{avg ?? "—"}</p>
                              </div>
                            </div>

                            {/* per question dim scores */}
                            {scoresArr.length > 0 && (
                              <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                                {scoresArr.map((q, qi) => {
                                  const catDef = CATEGORY_DIMS[q.category?.toLowerCase()]
                                  const dims = catDef?.dims || []
                                  const catColor = catDef?.color || "#6b7280"
                                  return (
                                    <div key={qi} style={{ background: "#0d1117", borderRadius: "8px", padding: "8px 12px", border: `1px solid ${catColor}20` }}>
                                      <p style={{ color: catColor, fontSize: "9px", textTransform: "uppercase", fontWeight: "600", margin: "0 0 6px" }}>Q{qi + 1} · {q.category}</p>
                                      <div style={{ display: "flex", gap: "12px" }}>
                                        {dims.map(d => (
                                          <div key={d.key} style={{ textAlign: "center" }}>
                                            <p style={{ color: "#4b5563", fontSize: "9px", margin: 0 }}>{d.label.split(" ")[0]}</p>
                                            <p style={{ color: getScoreColor(q[d.key]), fontWeight: "700", fontSize: "15px", margin: 0 }}>{q[d.key] ?? "—"}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
"use client"
import { useState } from "react"
import Editor from "@monaco-editor/react"

const LANGUAGES = [
  { label: "JavaScript", value: "javascript" },
  { label: "Python", value: "python" },
  { label: "Java", value: "java" },
  { label: "C++", value: "cpp" },
  { label: "TypeScript", value: "typescript" },
]

const DEFAULT_CODE = {
  javascript: "// Write your solution here\nfunction solution() {\n  \n}\n",
  python: "# Write your solution here\ndef solution():\n    pass\n",
  java: "// Write your solution here\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n",
  cpp: "// Write your solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n",
  typescript: "// Write your solution here\nfunction solution(): void {\n  \n}\n",
}

export default function CodeEditor({ value, onChange }) {
  const [language, setLanguage] = useState("javascript")

  function handleLanguageChange(lang) {
    setLanguage(lang)
    // only reset if user hasn't written anything yet
    if (!value || value === DEFAULT_CODE[language]) {
      onChange(DEFAULT_CODE[lang])
    }
  }

  return (
    <div style={{ border: "1px solid #30363d", borderRadius: "10px", overflow: "hidden" }}>

      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#161b22", borderBottom: "1px solid #30363d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* traffic lights */}
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444" }} />
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#eab308" }} />
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ color: "#6b7280", fontSize: "12px", marginLeft: "8px" }}>Code Editor</span>
        </div>

        {/* language selector */}
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e5e7eb", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* monaco editor */}
      <Editor
        height="280px"
        language={language}
        value={value || DEFAULT_CODE[language]}
        onChange={(val) => onChange(val || "")}
        theme="vs-dark"
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "on",
          renderLineHighlight: "line",
          wordWrap: "on",
          tabSize: 2,
          padding: { top: 12, bottom: 12 },
        }}
      />

    </div>
  )
}

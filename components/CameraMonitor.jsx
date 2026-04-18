"use client"
import { useEffect, useRef, useState } from "react"

const FACE_DETECT_INTERVAL_MS = 3000
// fix: 4 consecutive misses = 12 seconds of absence before violation
const MISS_THRESHOLD = 4
const MULTI_THRESHOLD = 2
const MOUTH_THRESHOLD = 5
const MOUTH_OPEN_DIFF = 14

export default function CameraMonitor({ onViolation, active }) {
  const videoRef = useRef(null)
  const intervalRef = useRef(null)
  const streamRef = useRef(null)

  const missCountRef = useRef(0)
  const multiCountRef = useRef(0)
  const mouthCountRef = useRef(0)
  const prevMouthRef = useRef(null)

  const [faceStatus, setFaceStatus] = useState("loading")

  useEffect(() => {
    if (!active) return
    loadAndStart()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [active])

  async function loadAndStart() {
    try {
      window.dispatchEvent(new CustomEvent("suppress-blur"))
      const faceapi = await import("face-api.js")

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
      ])

      window.dispatchEvent(new CustomEvent("suppress-blur"))
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise(res => { videoRef.current.onloadedmetadata = res })
        videoRef.current.play()
      }

      setFaceStatus("ok")

      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return
        try {
          // fix: inputSize 512 = better downward angle detection (keyboard glance)
          // fix: scoreThreshold 0.4 = more tolerant, catches partially visible faces
          const detections = await faceapi
            .detectAllFaces(
              videoRef.current,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 512,
                scoreThreshold: 0.4
              })
            )
            .withFaceLandmarks(true)

          const count = detections.length

          if (count === 0) {
            missCountRef.current += 1
            multiCountRef.current = 0
            setFaceStatus("away")
            // fix: only after 4 consecutive misses (12 seconds) fire violation
            // a keyboard glance is 1-2 seconds — won't trigger
            if (missCountRef.current >= MISS_THRESHOLD) {
              onViolation("faceAway")
              missCountRef.current = 0
            }
          } else if (count > 1) {
            missCountRef.current = 0
            multiCountRef.current += 1
            setFaceStatus("multiple")
            if (multiCountRef.current >= MULTI_THRESHOLD) {
              onViolation("multipleFaces")
              multiCountRef.current = 0
            }
          } else {
            // face found — reset all counters immediately
            missCountRef.current = 0
            multiCountRef.current = 0
            setFaceStatus("ok")

            // mouth movement
            try {
              const mouth = detections[0].landmarks.getMouth()
              if (mouth && mouth.length >= 10) {
                const openness = Math.abs(mouth[9].y - mouth[3].y)
                if (prevMouthRef.current !== null) {
                  const diff = Math.abs(openness - prevMouthRef.current)
                  if (diff > MOUTH_OPEN_DIFF) {
                    mouthCountRef.current += 1
                    if (mouthCountRef.current >= MOUTH_THRESHOLD) {
                      onViolation("excessiveMouth")
                      mouthCountRef.current = 0
                    }
                  } else {
                    mouthCountRef.current = Math.max(0, mouthCountRef.current - 1)
                  }
                }
                prevMouthRef.current = openness
              }
            } catch { }
          }
        } catch (err) {
          console.warn("Face detection error:", err)
        }
      }, FACE_DETECT_INTERVAL_MS)

    } catch (err) {
      console.error("CameraMonitor error:", err)
      setFaceStatus("error")
    }
  }

  const color = faceStatus === "ok" ? "#22c55e"
    : faceStatus === "error" ? "#ef4444"
    : faceStatus === "away" && missCountRef.current >= MISS_THRESHOLD - 1 ? "#ef4444"
    : "#f59e0b"

  const missesLeft = MISS_THRESHOLD - missCountRef.current
  const text = faceStatus === "ok" ? "✓ Face detected"
    : faceStatus === "away" ? `Look at screen (${missesLeft * 3}s left)`
    : faceStatus === "multiple" ? "⚠ Multiple faces"
    : faceStatus === "error" ? "Camera error"
    : "Loading models..."

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        position: "relative", borderRadius: "8px", overflow: "hidden",
        border: `2px solid ${color}`, background: "#0d1117",
        transition: "border-color 0.4s ease"
      }}>
        <video ref={videoRef} autoPlay muted playsInline
          style={{ width: "140px", height: "105px", objectFit: "cover", display: "block", transform: "scaleX(-1)" }} />

        <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", alignItems: "center", gap: "4px", background: "rgba(0,0,0,0.7)", borderRadius: "100px", padding: "2px 7px" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: faceStatus === "ok" ? "#22c55e" : "#ef4444", animation: "camPulse 1.5s infinite" }} />
          <span style={{ color: "#fff", fontSize: "9px", fontWeight: "600" }}>LIVE</span>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: `${color}30`, padding: "3px 6px", textAlign: "center" }}>
          <span style={{ color, fontSize: "9px", fontWeight: "700" }}>{text}</span>
        </div>
      </div>
      <style>{`@keyframes camPulse { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
    </div>
  )
}

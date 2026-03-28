import React, { useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface UnikaLogoProps {
  /** Pixel size of the SVG bounding box (default: 32) */
  size?: number
  className?: string
  style?: React.CSSProperties
  /** Pause all animation (default: false) */
  paused?: boolean
}

// ── Palette — cool blue / indigo / violet / cyan family ──────────────────────

interface TriDef {
  r:        number   // circumradius in SVG units (viewBox 0 0 100 100)
  color:    string
  strokeW:  number
  fillOp:   number
  startRot: number   // initial rotation offset in degrees
  dur:      number   // full revolution duration in seconds
  dir:      1 | -1   // 1 = clockwise, -1 = counter-clockwise
  glowDur:  number   // glow pulse duration in seconds
}

const TRIANGLES: TriDef[] = [
  { r: 41,  color: '#60A5FA', strokeW: 1.1, fillOp: 0.10, startRot:   0, dur: 14, dir:  1, glowDur:  9 },
  { r: 33,  color: '#A78BFA', strokeW: 1.5, fillOp: 0.16, startRot:  22, dur:  9, dir: -1, glowDur:  7 },
  { r: 25,  color: '#22D3EE', strokeW: 1.9, fillOp: 0.20, startRot:  48, dur: 17, dir:  1, glowDur: 11 },
  { r: 37,  color: '#818CF8', strokeW: 1.0, fillOp: 0.09, startRot: -14, dur: 11, dir: -1, glowDur:  8 },
  { r: 18,  color: '#38BDF8', strokeW: 2.3, fillOp: 0.26, startRot:  68, dur:  7, dir:  1, glowDur:  5 },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const S60 = Math.sin(Math.PI / 3)  // ≈ 0.866

/** Equilateral triangle centred at SVG point (50, 50), pointing up. */
function triPoints(r: number): string {
  const top = `50,${50 - r}`
  const bl  = `${50 - r * S60},${50 + r * 0.5}`
  const br  = `${50 + r * S60},${50 + r * 0.5}`
  return `${top} ${bl} ${br}`
}

/** Monotonically increasing counter for unique CSS animation names. */
let _counter = 0

// ── Component ────────────────────────────────────────────────────────────────

export function UnikaLogo({ size = 32, className, style, paused = false }: UnikaLogoProps) {
  // Stable unique prefix per instance — avoids keyframe collisions
  const pfx = useRef(`ul${++_counter}`).current

  // Build per-triangle keyframes (rotation + scale combined, glow separate)
  const css = TRIANGLES.map((t, i) => {
    const full = t.dir === 1 ? 360 : -360
    const r0   = t.startRot
    const ps   = paused ? 'paused' : 'running'

    return `
@keyframes ${pfx}s${i} {
  0%   { transform: rotate(${r0          }deg) scale(1.00); }
  20%  { transform: rotate(${r0+full*0.2 }deg) scale(1.07); }
  50%  { transform: rotate(${r0+full*0.5 }deg) scale(0.95); }
  80%  { transform: rotate(${r0+full*0.8 }deg) scale(1.05); }
  100% { transform: rotate(${r0+full     }deg) scale(1.00); }
}
@keyframes ${pfx}g${i} {
  0%,100% { opacity: 0.82; filter: drop-shadow(0 0 1.5px ${t.color}55); }
  50%     { opacity: 1.00; filter: drop-shadow(0 0 5px   ${t.color}cc) drop-shadow(0 0 2px ${t.color}88); }
}
.${pfx}p${i} {
  transform-origin: 50px 50px;
  animation:
    ${pfx}s${i} ${t.dur}s    linear       infinite ${ps},
    ${pfx}g${i} ${t.glowDur}s ease-in-out infinite ${ps};
}`
  }).join('\n')

  return (
    <>
      <style>{css}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={className}
        style={{ overflow: 'visible', flexShrink: 0, display: 'block', ...style }}
        aria-label="Unika"
        role="img"
      >
        {TRIANGLES.map((t, i) => (
          <polygon
            key={i}
            className={`${pfx}p${i}`}
            points={triPoints(t.r)}
            fill={t.color}
            fillOpacity={t.fillOp}
            stroke={t.color}
            strokeWidth={t.strokeW}
            strokeOpacity={0.9}
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </>
  )
}

export default UnikaLogo

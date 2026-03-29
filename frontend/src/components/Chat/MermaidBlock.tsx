import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize2, Download, X } from 'lucide-react'

// ── Module-level singleton init ───────────────────────────────────────────────
// mermaid.initialize() must be called ONCE per app lifetime.
// Calling it inside a per-component useEffect (even once per instance)
// resets internal state in mermaid v10+ and causes "Syntax error in text".
let _mermaidReady: Promise<typeof import('mermaid').default> | null = null

function getMermaid() {
  if (!_mermaidReady) {
    _mermaidReady = import('mermaid').then(m => {
      const mermaid = m.default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          background:          '#1e1e22',
          primaryColor:        '#1e3a5a',
          primaryTextColor:    '#e4e4e7',
          primaryBorderColor:  'rgba(255,255,255,0.1)',
          lineColor:           '#71717a',
          secondaryColor:      '#28282e',
          tertiaryColor:       '#1e1e22',
          edgeLabelBackground: '#1e1e22',
          clusterBkg:          '#1e1e22',
          titleColor:          '#e4e4e7',
          fontFamily:          "'Inter', -apple-system, system-ui, sans-serif",
          fontSize:            '13px',
        },
      })
      return mermaid
    })
  }
  return _mermaidReady
}

// ── Unique render-id counter ──────────────────────────────────────────────────
let _mid = 0

// ── Types ─────────────────────────────────────────────────────────────────────
interface Transform { x: number; y: number; scale: number }

// ── Zoom/pan modal ────────────────────────────────────────────────────────────
function ZoomModal({ svgHtml, onClose }: { svgHtml: string; onClose: () => void }) {
  const [tf, setTf] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 0.88
    setTf(t => ({ ...t, scale: Math.min(Math.max(t.scale * factor, 0.1), 20) }))
  }, [])
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    last.current = { x: e.clientX, y: e.clientY }
  }, [])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    setTf(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: '#aaa',
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
        }}
      >
        <X size={12} /> Cerrar (ESC)
      </button>
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: '#444', pointerEvents: 'none' }}>
        Rueda para zoom · Arrastrar para desplazar
      </div>
      <div
        style={{ width: '100%', height: '100%', overflow: 'hidden', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${tf.x}px), calc(-50% + ${tf.y}px)) scale(${tf.scale})`,
            transformOrigin: 'center center',
            transition: dragging.current ? 'none' : 'transform 0.05s',
          }}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function MermaidBlock({ code }: { code: string }) {
  const ref      = useRef<HTMLDivElement>(null)
  const [error, setError]       = useState<string | null>(null)
  const [svgHtml, setSvgHtml]   = useState<string>('')
  const [expanded, setExpanded] = useState(false)
  const id = useRef(`mmd-${++_mid}`)

  useEffect(() => {
    if (!code?.trim()) return
    let cancelled = false

    getMermaid()
      .then(mermaid => mermaid.render(id.current, code.trim()))
      .then(({ svg }) => {
        if (cancelled) return
        setSvgHtml(svg)
        if (ref.current) ref.current.innerHTML = svg
        setError(null)
      })
      .catch(err => {
        if (!cancelled) setError(String(err))
      })

    return () => { cancelled = true }
  }, [code])

  const exportPng = useCallback(() => {
    const svgEl = ref.current?.querySelector('svg')
    if (!svgEl) return
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale  = 2
      canvas.width  = (svgEl.viewBox?.baseVal?.width  || svgEl.clientWidth  || 800) * scale
      canvas.height = (svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 600) * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.fillStyle = '#1e1e22'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'diagram.png'
        a.click()
      }, 'image/png')
    }
    img.src = url
  }, [])

  if (error) return (
    <div style={{
      fontSize: 11, color: '#f87171', padding: '8px 12px',
      border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6,
      margin: '8px 0', background: 'rgba(248,113,113,0.05)',
      fontFamily: 'var(--font-mono)',
    }}>
      ⚠ Mermaid: {error}
    </div>
  )

  return (
    <>
      {expanded && svgHtml && (
        <ZoomModal svgHtml={svgHtml} onClose={() => setExpanded(false)} />
      )}
      <div style={{
        margin: '10px 0', borderRadius: 8, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.07)',
        background: '#141418',
      }}
        className="group/mermaid"
      >
        {/* Toolbar — visible on hover */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 4,
          padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          opacity: 0, transition: 'opacity 0.15s',
        }}
          className="group-hover/mermaid:!opacity-100"
        >
          {[
            { label: 'PNG', icon: <Download size={9} />, action: exportPng },
            { label: 'Ampliar', icon: <Maximize2 size={9} />, action: () => setExpanded(true) },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.action}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '2px 7px', cursor: 'pointer',
                color: '#888', display: 'flex', alignItems: 'center',
                gap: 3, fontSize: 10,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ccc' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
            >
              {btn.icon} {btn.label}
            </button>
          ))}
        </div>
        <div ref={ref} style={{ padding: '16px', overflowX: 'auto', display: 'flex', justifyContent: 'center' }} />
      </div>
    </>
  )
}

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize2, Download, X } from 'lucide-react'

let _mid = 0

interface Transform { x: number; y: number; scale: number }

function ZoomModal({ svgHtml, onClose }: { svgHtml: string; onClose: () => void }) {
  const [tf, setTf] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

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
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.08)', border: '1px solid #3A3A3A',
          borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: '#888',
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
          zIndex: 10,
        }}
      >
        <X size={12} /> Cerrar (ESC)
      </button>
      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        fontSize: 9, color: '#444', pointerEvents: 'none',
      }}>
        Rueda para zoom · Arrastrar para desplazar
      </div>
      {/* Canvas */}
      <div
        ref={containerRef}
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

export function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svgHtml, setSvgHtml] = useState<string>('')
  const [expanded, setExpanded] = useState(false)
  const id = useRef(`mermaid-${++_mid}`)

  useEffect(() => {
    let cancelled = false
    import('mermaid').then(m => {
      const mermaid = m.default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          background: '#1e1f22',
          primaryColor: '#2C5D87',
          primaryTextColor: '#D2D2D2',
          primaryBorderColor: '#3A3A3A',
          lineColor: '#888888',
          secondaryColor: '#3A3A3A',
          tertiaryColor: '#282828',
          edgeLabelBackground: '#282828',
          clusterBkg: '#1e1f22',
          titleColor: '#D2D2D2',
          fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
        },
      })
      mermaid.render(id.current, code)
        .then(({ svg }) => {
          if (!cancelled) {
            setSvgHtml(svg)
            if (ref.current) ref.current.innerHTML = svg
          }
        })
        .catch(e => { if (!cancelled) setError(String(e)) })
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
      const scale = 2 // retina
      canvas.width  = (svgEl.viewBox?.baseVal?.width  || svgEl.clientWidth  || 800) * scale
      canvas.height = (svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 600) * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.fillStyle = '#1e1f22'
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
    <div className="text-red-400 text-xs p-2 border border-red-400/30 rounded my-2 font-mono">
      Mermaid error: {error}
    </div>
  )

  return (
    <>
      {expanded && svgHtml && (
        <ZoomModal svgHtml={svgHtml} onClose={() => setExpanded(false)} />
      )}
      <div className="my-3 rounded border border-[#3A3A3A] bg-[#1e1f22] overflow-hidden group/mermaid">
        {/* Toolbar */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 4,
          padding: '4px 6px', borderBottom: '1px solid #2a2a2a',
          opacity: 0, transition: 'opacity 0.15s',
        }}
          className="group-hover/mermaid:!opacity-100"
        >
          <button
            onClick={exportPng}
            style={{
              background: 'none', border: '1px solid #3A3A3A', borderRadius: 4,
              padding: '2px 6px', cursor: 'pointer', color: '#666',
              display: 'flex', alignItems: 'center', gap: 3, fontSize: 9,
            }}
            title="Exportar como PNG"
          >
            <Download size={9} /> PNG
          </button>
          <button
            onClick={() => setExpanded(true)}
            style={{
              background: 'none', border: '1px solid #3A3A3A', borderRadius: 4,
              padding: '2px 6px', cursor: 'pointer', color: '#666',
              display: 'flex', alignItems: 'center', gap: 3, fontSize: 9,
            }}
            title="Vista expandida"
          >
            <Maximize2 size={9} /> Ampliar
          </button>
        </div>
        <div ref={ref} className="p-4 overflow-x-auto flex justify-center" />
      </div>
    </>
  )
}

import React, { useMemo, useState, useRef, useEffect } from 'react'

interface Heading {
  level: 1 | 2 | 3
  text: string
  id: string
}

function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  const lines = markdown.split('\n')
  let inCodeBlock = false
  for (const line of lines) {
    if (line.startsWith('```')) { inCodeBlock = !inCodeBlock; continue }
    if (inCodeBlock) continue
    const m = /^(#{1,3})\s+(.+)$/.exec(line)
    if (m) {
      const text = m[2].trim()
      const id = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
      headings.push({ level: m[1].length as 1 | 2 | 3, text, id })
    }
  }
  return headings
}

export function DocOutline({
  content,
  previewRef,
}: {
  content: string
  previewRef: React.RefObject<HTMLDivElement>
}) {
  const headings = useMemo(() => extractHeadings(content), [content])
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(true)
  }
  const hide = () => {
    timerRef.current = setTimeout(() => setVisible(false), 200)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // Find heading by DOM index — reliable regardless of ID formatting
  const scrollTo = (index: number) => {
    const container = previewRef.current
    if (!container) return
    const headingEls = container.querySelectorAll('h1, h2, h3')
    const el = headingEls[index] as HTMLElement | undefined
    if (!el) return
    // Manually compute offset to scroll the container (not the page)
    const containerTop = container.getBoundingClientRect().top
    const elTop = el.getBoundingClientRect().top
    const offset = elTop - containerTop + container.scrollTop - 8
    container.scrollTo({ top: offset, behavior: 'smooth' })
  }

  if (headings.length === 0) return null

  return (
    <div
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 10, pointerEvents: 'none' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {/* Hover trigger strip */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 12,
        pointerEvents: 'all',
      }} />

      {/* Panel */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        width: visible ? 200 : 0,
        maxHeight: 'calc(100% - 16px)',
        background: '#1a1b1e',
        border: visible ? '1px solid #2a2a2a' : 'none',
        borderRadius: 6,
        overflow: 'hidden',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.18s',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'all' : 'none',
        boxShadow: visible ? '0 4px 20px rgba(0,0,0,0.4)' : 'none',
      }}>
        <div style={{
          padding: '6px 0 4px',
          borderBottom: '1px solid #222',
          fontSize: 8,
          color: '#444',
          letterSpacing: '0.1em',
          paddingLeft: 10,
        }}>
          ÍNDICE
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100% - 28px)', padding: '4px 0' }}>
          {headings.map((h, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: `3px 10px 3px ${8 + (h.level - 1) * 12}px`,
                fontSize: h.level === 1 ? 10 : h.level === 2 ? 9 : 8,
                fontWeight: h.level === 1 ? 600 : 400,
                color: h.level === 1 ? '#C4C4C4' : h.level === 2 ? '#888' : '#555',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transition: 'color 0.1s, background 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#D2D2D2'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = h.level === 1 ? '#C4C4C4' : h.level === 2 ? '#888' : '#555'
                ;(e.currentTarget as HTMLElement).style.background = 'none'
              }}
              title={h.text}
            >
              {h.level > 1 && <span style={{ color: '#333', marginRight: 4 }}>{'—'.repeat(h.level - 1)}</span>}
              {h.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

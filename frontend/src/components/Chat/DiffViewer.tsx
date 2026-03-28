import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface DiffViewerProps {
  diff: string
  filename?: string
}

export function DiffViewer({ diff, filename }: DiffViewerProps) {
  const [expanded, setExpanded] = useState(false)

  const lines = diff.split('\n')
  const addedCount = lines.filter((l) => l.startsWith('+')).length
  const removedCount = lines.filter((l) => l.startsWith('-')).length

  return (
    <div
      style={{
        marginTop: 4,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid #2a2a2a',
        fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
        fontSize: 10,
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 7px',
          background: '#1a1a1a',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {expanded ? <ChevronDown size={9} color="#666" /> : <ChevronRight size={9} color="#666" />}
        <span style={{ color: '#888', fontSize: 9 }}>
          {filename ?? 'diff'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {addedCount > 0 && (
            <span style={{ color: '#5a9a5a', fontSize: 9 }}>+{addedCount}</span>
          )}
          {removedCount > 0 && (
            <span style={{ color: '#9a5a5a', fontSize: 9 }}>−{removedCount}</span>
          )}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            overflowX: 'auto',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {lines.map((line, i) => {
            let bg = 'transparent'
            let color = '#888'
            if (line.startsWith('+') && !line.startsWith('+++')) {
              bg = 'rgba(60,100,60,0.35)'
              color = '#8dcf8d'
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              bg = 'rgba(100,50,50,0.35)'
              color = '#cf8d8d'
            } else if (line.startsWith('@@')) {
              bg = 'rgba(40,60,100,0.3)'
              color = '#7aabcf'
            } else if (line.startsWith('+++') || line.startsWith('---')) {
              color = '#666'
            }
            return (
              <div
                key={i}
                style={{
                  padding: '0 8px',
                  background: bg,
                  color,
                  whiteSpace: 'pre',
                  lineHeight: '16px',
                  minHeight: 16,
                }}
              >
                {line || ' '}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Extract the diff block from a FILE_EDIT result string, or return null. */
export function parseDiffResult(result?: string): { diff: string; filename?: string } | null {
  if (!result?.startsWith('OK\n```diff')) return null
  const start = result.indexOf('\n', result.indexOf('```diff')) + 1
  const end = result.lastIndexOf('```')
  if (start === -1 || end === -1 || end <= start) return null
  const diff = result.slice(start, end)
  // Try to extract filename from the --- line
  const fileLine = diff.split('\n').find((l) => l.startsWith('--- '))
  const filename = fileLine ? fileLine.replace('--- a/', '').trim() : undefined
  return { diff, filename }
}

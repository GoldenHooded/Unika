import React, { useEffect, useState, useCallback } from 'react'
import { X, RefreshCw, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'

// ── Token-estimate colours (matching the stacked bar segments) ───────────────
const COLOURS = {
  system_prompt: '#3d85c8',
  game_context:  '#40C8FF',
  tdd:           '#FFA040',
  gdd:           '#F4BC02',
  memory:        '#C4A8FF',
  session_log:   '#888888',
  history:       '#6BCB77',
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CtxFile {
  id: string
  label: string
  chars: number
  chars_total: number
  tokens: number
  truncated: boolean
}

interface HistoryItem {
  role: string
  preview: string
  chars: number
  tokens: number
  has_tools: boolean
}

interface ContextBreakdown {
  total_tokens: number
  context_window: number
  system_prompt: { label: string; chars: number; tokens: number }
  context_files: CtxFile[]
  history: { label: string; tokens: number; items: HistoryItem[] }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
function fmtPct(tokens: number, total: number): string {
  if (!total) return '0%'
  return `${Math.round((tokens / total) * 100)}%`
}

// ── Stacked context-window bar ────────────────────────────────────────────────
function ContextBar({ data }: { data: ContextBreakdown }) {
  const limit = data.context_window
  const usedPct = Math.min(100, (data.total_tokens / limit) * 100)

  const segments = [
    { key: 'system_prompt', tokens: data.system_prompt.tokens, label: 'System' },
    ...data.context_files.map(f => ({ key: f.id, tokens: f.tokens, label: f.label })),
    { key: 'history', tokens: data.history.tokens, label: 'Historial' },
  ].filter(s => s.tokens > 0)

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Bar */}
      <div style={{
        height: 16,
        borderRadius: 4,
        overflow: 'hidden',
        background: '#1C1C1C',
        border: '1px solid #3A3A3A',
        display: 'flex',
      }}>
        {segments.map(seg => {
          const pct = (seg.tokens / limit) * 100
          const color = COLOURS[seg.key as keyof typeof COLOURS] ?? '#555'
          return (
            <div
              key={seg.key}
              title={`${seg.label}: ${fmtTokens(seg.tokens)} tokens`}
              style={{
                width: `${pct}%`,
                background: color,
                transition: 'width 0.4s ease',
                flexShrink: 0,
              }}
            />
          )
        })}
        {/* Unused space */}
        <div style={{ flex: 1, background: 'transparent' }} />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: '#888' }}>
        <span>
          <span style={{ color: usedPct > 80 ? '#f87171' : usedPct > 60 ? '#F4BC02' : '#6BCB77', fontWeight: 600 }}>
            {fmtTokens(data.total_tokens)}
          </span>
          {' / '}
          {fmtTokens(limit)} tokens usados ({Math.round(usedPct)}%)
        </span>
        {usedPct > 80 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#f87171' }}>
            <TriangleAlert size={9} />
            Contexto casi lleno
          </span>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 }}>
        {segments.map(seg => {
          const color = COLOURS[seg.key as keyof typeof COLOURS] ?? '#555'
          return (
            <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ color: '#aaa' }}>{seg.label}</span>
              <span style={{ color: '#666' }}>{fmtTokens(seg.tokens)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Single section row ────────────────────────────────────────────────────────
function SectionRow({
  color, label, tokens, total, chars, truncated, children,
}: {
  color: string
  label: string
  tokens: number
  total: number
  chars?: number
  truncated?: boolean
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pct = total ? (tokens / total) * 100 : 0

  return (
    <div style={{ borderBottom: '1px solid #2A2A2A' }}>
      <div
        onClick={() => children && setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
          cursor: children ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (children) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {/* Colour swatch */}
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />

        {/* Label */}
        <span style={{ flex: 1, fontSize: 11, color: '#C4C4C4' }}>
          {label}
          {truncated && (
            <span style={{ marginLeft: 5, fontSize: 9, color: '#F4BC02', border: '1px solid rgba(244,188,2,0.3)', borderRadius: 2, padding: '0 3px' }}>
              TRUNCADO
            </span>
          )}
        </span>

        {/* Mini bar */}
        <div style={{ width: 60, height: 4, borderRadius: 2, background: '#2A2A2A', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
        </div>

        {/* Token count */}
        <span style={{ fontSize: 10, color: '#888', minWidth: 36, textAlign: 'right' }}>
          {fmtTokens(tokens)}
        </span>

        {/* Expand indicator */}
        {children && (
          <span style={{ color: '#555' }}>
            {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        )}
      </div>

      {/* Expanded content */}
      {open && children && (
        <div style={{ paddingBottom: 6 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── History message row ────────────────────────────────────────────────────────
function HistoryRow({ item, index }: { item: HistoryItem; index: number }) {
  const roleColors: Record<string, string> = {
    user:      '#3d85c8',
    assistant: '#6BCB77',
    tool:      '#FFA040',
    system:    '#C4A8FF',
  }
  const color = roleColors[item.role] ?? '#888'
  const label = item.role === 'tool' ? '⚙ tool result' : item.role

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      padding: '3px 0 3px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 9, color, minWidth: 56, paddingTop: 1, fontWeight: 600 }}>
        {label}
        {item.has_tools && <span style={{ marginLeft: 3, color: '#FFA040' }}>+tools</span>}
      </span>
      <span style={{
        flex: 1,
        fontSize: 10,
        color: '#777',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {item.preview || '(vacío)'}
      </span>
      <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>
        {fmtTokens(item.tokens)}
      </span>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function ContextPanel({ onClose }: { onClose: () => void }) {
  const { activeProjectId, activeConversationId } = useProjectStore()
  const [data, setData] = useState<ContextBreakdown | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!activeProjectId || !activeConversationId) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch(
        `http://127.0.0.1:8765/projects/${activeProjectId}/channels/${activeConversationId}/context-breakdown`
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar el contexto')
    } finally {
      setLoading(false)
    }
  }, [activeProjectId, activeConversationId])

  useEffect(() => { load() }, [load])

  const total = data?.total_tokens ?? 1

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      background: '#282828',
      borderLeft: '1px solid #3A3A3A',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        height: 32,
        background: '#3C3C3C',
        borderBottom: '1px solid #3A3A3A',
        flexShrink: 0,
        gap: 8,
      }}>
        <span style={{ flex: 1, fontSize: 11, color: '#C4C4C4', fontWeight: 600 }}>
          Contexto del Agente
        </span>
        <button
          onClick={load}
          title="Recargar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: loading ? '#3d85c8' : '#888', padding: 2 }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 2 }}
        >
          <X size={11} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', fontSize: 11 }}>
        {error && (
          <div style={{ color: '#f87171', fontSize: 11, padding: '6px 0' }}>{error}</div>
        )}

        {!data && !error && !loading && (
          <div style={{ color: '#555', fontSize: 11, padding: '6px 0' }}>Sin datos</div>
        )}

        {data && (
          <>
            {/* Stacked bar */}
            <ContextBar data={data} />

            {/* Sections */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>

              {/* System Prompt */}
              <SectionRow
                color={COLOURS.system_prompt}
                label={data.system_prompt.label}
                tokens={data.system_prompt.tokens}
                total={total}
                chars={data.system_prompt.chars}
              />

              {/* Context files */}
              {data.context_files.map(f => (
                <SectionRow
                  key={f.id}
                  color={COLOURS[f.id as keyof typeof COLOURS] ?? '#888'}
                  label={f.label}
                  tokens={f.tokens}
                  total={total}
                  chars={f.chars}
                  truncated={f.truncated}
                />
              ))}

              {/* History */}
              <SectionRow
                color={COLOURS.history}
                label={`${data.history.label} (${data.history.items.length} mensajes)`}
                tokens={data.history.tokens}
                total={total}
              >
                {data.history.items.length > 0 ? (
                  <>
                    {data.history.items.map((item, i) => (
                      <HistoryRow key={i} item={item} index={i} />
                    ))}
                  </>
                ) : (
                  <div style={{ padding: '4px 16px', fontSize: 10, color: '#555' }}>Sin mensajes en el historial</div>
                )}
              </SectionRow>

            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

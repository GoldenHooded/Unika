import React, { useRef, useState, useEffect } from 'react'
import { BookOpen } from 'lucide-react'
import { useSettingsStore, ContextFlags } from '../../stores/settingsStore'

interface ContextToggleButtonProps {
  onSend: (data: object) => void
}

const CONTEXT_ITEMS: Array<{ key: keyof ContextFlags; label: string; desc: string }> = [
  { key: 'game_context', label: 'Contexto',  desc: 'GAME_CONTEXT.md — estado del juego' },
  { key: 'tdd',         label: 'TDD',        desc: 'TDD.md — especificaciones técnicas' },
  { key: 'gdd',         label: 'GDD',        desc: 'GDD.md — diseño del juego' },
  { key: 'memory',      label: 'Memoria',    desc: 'MEMORY.md — memoria persistente' },
  { key: 'logs',        label: 'Logs',       desc: 'SESSION_LOG.md — registro de sesión' },
  { key: 'board',       label: 'Board',      desc: 'BOARD.json — estado del tablero Kanban' },
]

export function ContextToggleButton({ onSend }: ContextToggleButtonProps) {
  const contextFlags = useSettingsStore(s => s.contextFlags)
  const setContextFlags = useSettingsStore(s => s.setContextFlags)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popRef.current && !popRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (key: keyof ContextFlags) => {
    const newFlags = { ...contextFlags, [key]: !contextFlags[key] }
    setContextFlags({ [key]: !contextFlags[key] })
    onSend({ type: 'set_context_flags', flags: newFlags })
  }

  const activeCount = Object.values(contextFlags).filter(Boolean).length

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors"
        style={open || activeCount < 5
          ? { background: 'rgba(61,133,200,0.15)', color: '#3d85c8', borderColor: 'rgba(61,133,200,0.3)' }
          : { background: 'rgba(255,255,255,0.04)', color: '#555', borderColor: 'rgba(255,255,255,0.06)' }
        }
        title="Contexto del agente — activa/desactiva los documentos del sistema"
      >
        <BookOpen size={8} />
        {activeCount < 5 ? `${activeCount}/5` : 'Ctx'}
      </button>

      {open && (
        <div
          ref={popRef}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            right: 0,
            background: '#1e1f22',
            border: '1px solid #3A3A3A',
            borderRadius: 6,
            padding: '6px 0',
            minWidth: 210,
            zIndex: 200,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ padding: '4px 10px 6px', borderBottom: '1px solid #2a2a2a', marginBottom: 2 }}>
            <span style={{ fontSize: 9, color: '#555', fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", letterSpacing: '0.1em' }}>
              CONTEXTO DEL AGENTE
            </span>
          </div>
          {CONTEXT_ITEMS.map(({ key, label, desc }) => {
            const enabled = contextFlags[key]
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '5px 10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                {/* Toggle dot */}
                <div style={{
                  width: 28,
                  height: 14,
                  borderRadius: 7,
                  background: enabled ? 'rgba(61,133,200,0.3)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${enabled ? 'rgba(61,133,200,0.5)' : '#3A3A3A'}`,
                  flexShrink: 0,
                  position: 'relative',
                  transition: 'background 0.15s, border-color 0.15s',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 2,
                    left: enabled ? 14 : 2,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: enabled ? '#3d85c8' : '#555',
                    transition: 'left 0.15s, background 0.15s',
                  }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: enabled ? '#D2D2D2' : '#666', fontWeight: 500 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 8, color: '#444', marginTop: 1 }}>
                    {desc}
                  </div>
                </div>
              </button>
            )
          })}
          <div style={{ padding: '6px 10px 2px', borderTop: '1px solid #2a2a2a', marginTop: 2 }}>
            <span style={{ fontSize: 8, color: '#333' }}>
              Los documentos desactivados no se inyectan en el prompt del sistema.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { renderMarkdown, extractGuiElements } from '../../lib/markdown'
import { MermaidBlock } from '../Chat/MermaidBlock'
import { DocOutline } from './DocOutline'
import { useProjectStore } from '../../stores/projectStore'
import { useChatStore } from '../../stores/chatStore'
import { Code2, Eye, Save, SplitSquareHorizontal } from 'lucide-react'
import { KanbanBoard } from '../Kanban/KanbanBoard'

type DocName = 'GDD' | 'TDD' | 'GAME_CONTEXT' | 'MEMORY' | 'SESSION_LOG' | 'BOARD'

export function DocEditor({ onSend: _onSend }: { onSend?: (data: object) => void }) {
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const streaming = useChatStore(s => s.streaming)
  const prevStreamingRef = useRef(false)
  const [activeDoc, setActiveDoc] = useState<DocName>('GDD')
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const previewRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeProjectId) return
    fetch(`http://127.0.0.1:8765/projects/${activeProjectId}/docs/${activeDoc}`)
      .then(r => r.json())
      .then(data => setContent(data.content || ''))
      .catch(() => setContent(''))
  }, [activeProjectId, activeDoc])

  // Re-fetch after the agent finishes (catches FILE_WRITE + DOC_UPDATE cases)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && activeProjectId) {
      fetch(`http://127.0.0.1:8765/projects/${activeProjectId}/docs/${activeDoc}`)
        .then(r => r.json())
        .then(data => setContent(data.content ?? ''))
        .catch(() => {})
    }
    prevStreamingRef.current = streaming
  }, [streaming, activeProjectId, activeDoc])

  // Immediate update while the agent is still running (real-time)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { document, content: newContent } = e.detail ?? {}
      if (!document) return
      const docName = document.replace('.md', '').toUpperCase() as DocName
      if (docName === activeDoc) setContent(newContent ?? '')
    }
    window.addEventListener('doc_updated', handler as EventListener)
    return () => window.removeEventListener('doc_updated', handler as EventListener)
  }, [activeDoc])

  const save = useCallback(async () => {
    if (!activeProjectId) return
    setSaving(true)
    try {
      await fetch(`http://127.0.0.1:8765/projects/${activeProjectId}/docs/${activeDoc}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      setLastSaved(new Date())
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(false)
    }
  }, [activeProjectId, activeDoc, content])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  const docs: { name: DocName; label: string }[] = [
    { name: 'GDD',          label: 'GDD'      },
    { name: 'TDD',          label: 'TDD'      },
    { name: 'GAME_CONTEXT', label: 'Contexto' },
    { name: 'MEMORY',       label: 'Memoria'  },
    { name: 'SESSION_LOG',  label: 'Log'      },
    { name: 'BOARD' as any, label: 'Board'    },
  ]

  return (
    /* Unity Inspector-style panel */
    <div className="flex flex-col h-full" style={{ background: '#1e1e22', fontSize: 11 }}>

      {/* Toolbar — Unity tab bar style */}
      <div className="flex items-center border-b flex-shrink-0"
           style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#28282e', minHeight: 24 }}>

        {/* Doc tabs — Unity tab style: active tab shows bg panel color with top accent border */}
        <div className="flex flex-1 overflow-x-auto">
          {docs.map(d => (
            <button
              key={d.name}
              onClick={() => setActiveDoc(d.name)}
              className="flex items-center px-3 py-1 text-[11px] transition-colors flex-shrink-0 border-r"
              style={{
                borderColor: 'rgba(255,255,255,0.07)',
                background: activeDoc === d.name ? '#1e1e22' : 'transparent',
                color: activeDoc === d.name ? '#EEEEEE' : '#C4C4C4',
                borderTop: activeDoc === d.name ? '1px solid #3d85c8' : '1px solid transparent',
              }}
              onMouseEnter={e => {
                if (activeDoc !== d.name)
                  (e.currentTarget as HTMLElement).style.background = '#474747'
              }}
              onMouseLeave={e => {
                if (activeDoc !== d.name)
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {(activeDoc as string) !== 'BOARD' && (
          <>
            {/* View mode buttons — Unity toolbar icon buttons */}
            <div className="flex items-center gap-0.5 px-1.5 border-l" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              {[
                { m: 'edit' as const, Icon: Code2, title: 'Editar' },
                { m: 'split' as const, Icon: SplitSquareHorizontal, title: 'Split' },
                { m: 'preview' as const, Icon: Eye, title: 'Vista previa' },
              ].map(({ m, Icon, title }) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="p-1 rounded transition-colors"
                  style={{
                    color: mode === m ? '#EEEEEE' : '#888',
                    background: mode === m ? '#585858' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (mode !== m) (e.currentTarget as HTMLElement).style.background = '#474747'
                  }}
                  onMouseLeave={e => {
                    if (mode !== m) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                  title={title}
                >
                  <Icon size={11} />
                </button>
              ))}
            </div>

            {/* Save button */}
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 text-[11px] border-l transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.07)', color: '#888' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = '#474747'
                ;(e.currentTarget as HTMLElement).style.color = '#EEEEEE'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = '#888'
              }}
              title="Guardar (Ctrl+S)"
            >
              <Save size={11} />
              {lastSaved && (
                <span className="text-[10px]" style={{ color: '#888' }}>
                  {lastSaved.toLocaleTimeString()}
                </span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden flex">
        {(activeDoc as string) === 'BOARD' ? (
          <KanbanBoard />
        ) : (
          <>
            {(mode === 'edit' || mode === 'split') && (
              <textarea
                className={`${mode === 'split' ? 'w-1/2 border-r' : 'w-full'} h-full resize-none outline-none scrollbar-thin p-3 font-mono text-[11px]`}
                style={{
                  background: '#141418',
                  color: '#D2D2D2',
                  borderColor: 'rgba(255,255,255,0.07)',
                  lineHeight: '1.6',
                }}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Escribe aquí en Markdown..."
                spellCheck={false}
              />
            )}
            {(mode === 'preview' || mode === 'split') && (
              <div className={`${mode === 'split' ? 'w-1/2' : 'w-full'} h-full relative`}>
                <div
                  ref={previewRef}
                  className="h-full overflow-y-auto p-4 scrollbar-thin"
                  style={{ background: '#1e1e22' }}
                >
                  <div className="prose prose-invert prose-sm max-w-none">
                    {extractGuiElements(content).map((part, i) =>
                      part.type === 'mermaid'
                        ? <MermaidBlock key={i} code={part.content} />
                        : <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part.content) }} />
                    )}
                  </div>
                </div>
                <DocOutline content={content} previewRef={previewRef} />
              </div>
            )}
          </>
        )}
      </div>

      {!activeProjectId && (
        <div className="absolute inset-0 flex items-center justify-center"
             style={{ background: 'rgba(40,40,40,0.92)' }}>
          <p className="text-[11px]" style={{ color: '#888' }}>
            Selecciona un proyecto para editar documentos
          </p>
        </div>
      )}
    </div>
  )
}

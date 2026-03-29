import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Zap, Brain, ListPlus, Bug, ClipboardList } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { ActivityBar } from './ActivityBar'
import { useUnityStore } from '../../stores/unityStore'
import { useDebugStore } from '../../stores/debugStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { ContextToggleButton } from './ContextToggleButton'

function draftKey(projectId: string | null, convId: string) {
  return `unika_draft_${projectId ?? 'none'}_${convId}`
}

export function MessageInput({ onSend }: { onSend: (data: object) => void }) {
  const { activeProjectId, activeConversationId } = useProjectStore()
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(draftKey(activeProjectId, activeConversationId)) ?? '' }
    catch { return '' }
  })
  const streaming    = useChatStore(s => s.streaming)
  const agentStatus  = useChatStore(s => s.agentStatus)
  const activeModel = useUnityStore(s => s.activeModel)
  const setActiveModel = useUnityStore(s => s.setActiveModel)
  const debugEnabled = useDebugStore(s => s.enabled)
  const toggleDebug = useDebugStore(s => s.toggleEnabled)
  const planningMode = useSettingsStore(s => s.planningMode)
  const setPlanningMode = useSettingsStore(s => s.setPlanningMode)
  const contextFlags = useSettingsStore(s => s.contextFlags)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Listen for edit_message events from MessageList
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent).detail?.content ?? ''
      setText(content)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
        textareaRef.current.focus()
      }
    }
    window.addEventListener('edit_message', handler)
    return () => window.removeEventListener('edit_message', handler)
  }, [])

  // Restore draft when conversation changes
  useEffect(() => {
    const key = draftKey(activeProjectId, activeConversationId)
    const saved = localStorage.getItem(key) ?? ''
    setText(saved)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      if (saved) textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
    }
  }, [activeProjectId, activeConversationId])

  // Persist draft on every keystroke
  useEffect(() => {
    try { localStorage.setItem(draftKey(activeProjectId, activeConversationId), text) } catch {}
  }, [text, activeProjectId, activeConversationId])

  const send = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return

    if (trimmed.startsWith('/model ')) {
      const model = trimmed.replace('/model ', '').trim()
      onSend({ type: 'set_model', model })
      if (model === 'r1' || model === 'deepseek-reasoner') {
        setActiveModel('deepseek-reasoner')
      } else {
        setActiveModel('deepseek-chat')
      }
      setText('')
      try { localStorage.removeItem(draftKey(activeProjectId, activeConversationId)) } catch {}
      return
    }

    onSend({ type: 'user_message', text: trimmed, planning_mode: planningMode, context_flags: contextFlags })
    setText('')
    try { localStorage.removeItem(draftKey(activeProjectId, activeConversationId)) } catch {}
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [text, onSend, setActiveModel, activeProjectId, activeConversationId, planningMode, contextFlags])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }

  const stopAgent = () => {
    onSend({ type: 'stop' })
    // Optimistic: clear streaming immediately so UI responds at once
    useChatStore.getState().setStreaming(false)
    const msgs = useChatStore.getState().messages
    const last = msgs[msgs.length - 1]
    if (last?.streaming) useChatStore.getState().updateLastMessage({ streaming: false })
  }

  const isR1 = activeModel === 'deepseek-reasoner'

  return (
    /* Unity-style input area — bg #282828, input field #2A2A2A, border #3A3A3A */
    <div className="flex-shrink-0 px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#1e1e22' }}>

      {/* Model + hint row */}
      <div className="flex items-center gap-2 mb-1.5">
        <button
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors"
          style={isR1
            ? { background: 'rgba(147,51,234,0.15)', color: '#c084fc', borderColor: 'rgba(147,51,234,0.3)' }
            : { background: 'rgba(61,133,200,0.15)', color: '#3d85c8', borderColor: 'rgba(61,133,200,0.3)' }
          }
          onClick={() => {
            const newModel = isR1 ? 'deepseek-chat' : 'deepseek-reasoner'
            setActiveModel(newModel as any)
            onSend({ type: 'set_model', model: newModel })
          }}
          title="Cambiar modelo (V3 ↔ R1)"
        >
          {isR1 ? <Brain size={9} /> : <Zap size={9} />}
          {isR1 ? 'R1 · Razonamiento' : 'V3 · Chat'}
        </button>
        <button
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors"
          style={debugEnabled
            ? { background: 'rgba(212,168,67,0.15)', color: '#d4a843', borderColor: 'rgba(212,168,67,0.3)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#888', borderColor: 'rgba(255,255,255,0.08)' }
          }
          onClick={toggleDebug}
          title="Mostrar u ocultar debug"
        >
          <Bug size={9} />
          Debug
        </button>
        <button
          className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors select-none"
          style={planningMode
            ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#666', borderColor: 'rgba(255,255,255,0.06)' }
          }
          onClick={() => setPlanningMode(!planningMode)}
          title={planningMode ? 'Desactivar modo planificación' : 'Activar modo planificación: el agente genera un plan antes de ejecutar'}
        >
          <ClipboardList size={9} />
          Plan
        </button>
        <ContextToggleButton onSend={onSend} />
        <span className="text-[10px]" style={{ color: '#888' }}>
          Shift+Enter nueva línea
        </span>
      </div>

      {/* Live agent activity — typewriter status strip */}
      {streaming && <ActivityBar text={agentStatus} />}

      {/* Input row — Unity input field style */}
      <div
        className="flex items-end gap-2 rounded relative"
        style={{
          background: '#222228',
          border: dragOver ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(255,255,255,0.08)',
          transition: 'border-color 0.15s',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const files = Array.from(e.dataTransfer.files)
          const CODE_EXTS = new Set(['.cs', '.txt', '.shader', '.hlsl', '.glsl', '.cginc', '.md', '.json', '.xml'])
          files.forEach((file) => {
            const ext = '.' + (file.name.split('.').pop() ?? '')
            const reader = new FileReader()
            reader.onload = (ev) => {
              const content = ev.target?.result as string
              const lang = ext === '.cs' ? 'csharp' : ext === '.md' ? '' : ext.slice(1)
              const block = `\`\`\`${lang}\n// ${file.name}\n${content}\n\`\`\`\n`
              setText((prev) => (prev ? prev + '\n' + block : block))
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto'
                textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
              }
            }
            if (CODE_EXTS.has(ext.toLowerCase())) reader.readAsText(file)
          })
        }}
      >
        {dragOver && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 4,
              background: 'rgba(61,133,200,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <span style={{ fontSize: 10, color: '#3d85c8', fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace" }}>
              Soltar archivo aquí
            </span>
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent outline-none resize-none placeholder-[#888] text-[12px] px-3 py-2"
          style={{ color: '#D2D2D2', minHeight: 38, maxHeight: 180, lineHeight: '1.5' }}
          placeholder="Escribe un mensaje o comando..."
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className="flex-shrink-0 pb-1.5 pr-1.5 flex gap-1">
          {streaming && (
            <button
              onClick={stopAgent}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{ background: 'rgba(211,34,34,0.2)', color: '#f87171', border: '1px solid rgba(211,34,34,0.3)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(211,34,34,0.35)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(211,34,34,0.2)' }}
              title="Detener tarea actual"
            >
              <Square size={12} />
            </button>
          )}
          <button
            onClick={send}
            disabled={!text.trim()}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style={text.trim()
              ? streaming
                ? { background: 'rgba(61,133,200,0.2)', color: '#3d85c8', border: '1px solid rgba(61,133,200,0.4)' }
                : { background: '#585858', color: '#EEEEEE', border: '1px solid #303030' }
              : { background: '#2A2A2A', color: '#555', border: '1px solid #3A3A3A', cursor: 'not-allowed' }
            }
            onMouseEnter={e => {
              if (text.trim()) {
                (e.currentTarget as HTMLElement).style.background = streaming ? 'rgba(61,133,200,0.35)' : '#676767'
              }
            }}
            onMouseLeave={e => {
              if (text.trim()) {
                (e.currentTarget as HTMLElement).style.background = streaming ? 'rgba(61,133,200,0.2)' : '#585858'
              }
            }}
            title={streaming ? 'Añadir a la cola (el agente lo procesará al terminar)' : 'Enviar (Enter)'}
          >
            {streaming ? <ListPlus size={12} /> : <Send size={12} />}
          </button>
        </div>
      </div>
    </div>
  )
}

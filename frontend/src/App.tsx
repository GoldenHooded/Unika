import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MessageList } from './components/Chat/MessageList'
import { MessageInput } from './components/Chat/MessageInput'
import { DebugPanel } from './components/Chat/DebugPanel'
import { ReviewPanel } from './components/Chat/ReviewPanel'
import { TimelinePanel } from './components/Chat/TimelinePanel'
import { UsageMeter } from './components/UsageMeter'
import { UnityStatus } from './components/UnityStatus/UnityStatus'
import { DocEditor } from './components/DocEditor/DocEditor'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { ContextPanel } from './components/Chat/ContextPanel'
import { useProjectStore } from './stores/projectStore'
import { useReviewStore } from './stores/reviewStore'
import { useDebugStore } from './stores/debugStore'
import { playExitSound } from './utils/sounds'
import {
  FolderOpen, MessageSquarePlus,
  Maximize2, Minimize2, X, Clock, Layers,
} from 'lucide-react'
import { UnikaLogo } from './components/UnikaLogo'

const BOTTOM_MIN = 140
const BOTTOM_MAX = 600
const BOTTOM_DEFAULT = 280

const SCALE_MIN  = 0.6
const SCALE_MAX  = 1.8
const SCALE_STEP = 0.1
const SCALE_KEY  = 'unika_scale'

function clampScale(z: number) {
  return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, z)) * 100) / 100
}

// webFrame.setZoomFactor scales the entire Electron renderer surface —
// all fonts, buttons, paddings, icons — without clipping content.
// webFrame is only accessible from the preload context; we expose it via electronAPI.
function applyScale(scale: number) {
  window.electronAPI?.setZoomFactor(scale)
}

function useScale() {
  const [scale, setScale] = useState<number>(() => {
    const saved = localStorage.getItem(SCALE_KEY)
    return saved ? clampScale(parseFloat(saved)) : 1.0
  })

  // Apply persisted scale on mount
  useEffect(() => { applyScale(scale) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setScale(z => { const nz = clampScale(z + SCALE_STEP); localStorage.setItem(SCALE_KEY, String(nz)); applyScale(nz); return nz })
      } else if (e.key === '-') {
        e.preventDefault()
        setScale(z => { const nz = clampScale(z - SCALE_STEP); localStorage.setItem(SCALE_KEY, String(nz)); applyScale(nz); return nz })
      } else if (e.key === '0') {
        e.preventDefault()
        setScale(1.0); localStorage.setItem(SCALE_KEY, '1'); applyScale(1.0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

type Focus = null | 'docs'

export default function App() {
  useScale()
  const { send } = useWebSocket()
  const { activeProjectId, activeConversationId, projects } = useProjectStore()
  const reviewActive = useReviewStore(s => s.active)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const debugEnabled = useDebugStore(s => s.enabled)
  const [bottomH, setBottomH] = useState(BOTTOM_DEFAULT)
  const dragStart = useRef<{ y: number; h: number } | null>(null)
  const [docsHidden, setDocsHidden] = useState(false)
  const [focus, setFocus] = useState<Focus>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)

  // Play exit sound when Electron signals the app is closing
  useEffect(() => {
    const cleanup = window.electronAPI?.onPlayExitSound?.(() => {
      playExitSound(() => window.electronAPI?.exitReady?.())
    })
    return () => { cleanup?.() }
  }, [])

  const openProject = useCallback(async () => {
    const path = await window.electronAPI?.selectUnityProject?.()
    if (!path) return
    send({ type: 'open_project', unity_path: path })
  }, [send])

  const onDragStart = (e: React.MouseEvent) => {
    dragStart.current = { y: e.clientY, h: bottomH }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
  }
  const onDragMove = (e: MouseEvent) => {
    if (!dragStart.current) return
    const delta = dragStart.current.y - e.clientY
    setBottomH(Math.min(BOTTOM_MAX, Math.max(BOTTOM_MIN, dragStart.current.h + delta)))
  }
  const onDragEnd = () => {
    dragStart.current = null
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
  }

  const projectName = projects.find(p => p.id === activeProjectId)?.name ?? ''

  return (
    <div className="flex h-screen w-screen bg-[#1e1e22] text-[#D2D2D2] overflow-hidden" style={{ fontSize: 14 }}>
      <Sidebar onSend={send} onOpenProject={openProject} onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!activeProjectId ? (
          <NoProjectScreen
            onOpenProject={openProject}
            projects={projects}
            onSelectProject={(p) => send({ type: 'open_project', unity_path: p.unity_path })}
          />
        ) : focus === 'docs' ? (
          /* ── Fullscreen docs ── */
          <>
            <div className="flex items-center h-7 bg-[#161618] border-b border-white/[0.07] px-3 drag-region flex-shrink-0 gap-2">
              <UnikaLogo size={13} />
              <span className="text-[11px] text-[#888] truncate">{projectName}</span>
              <div className="ml-auto no-drag" style={{ marginRight: 138 }}><UnityStatus /></div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <PanelHeader
                label="Documentos"
                onMinimize={null}
                onMaximize={() => setFocus(null)}
                isMaximized={true}
              />
              <div className="flex-1 overflow-hidden">
                <DocEditor onSend={send} />
              </div>
            </div>
          </>
        ) : (
          /* ── Normal layout ── */
          <>
            {/* App toolbar */}
            <div className="flex items-center h-7 bg-[#161618] border-b border-white/[0.07] px-3 drag-region flex-shrink-0 gap-2">
              <UnikaLogo size={13} />
              <span className="text-[11px] text-[#888] truncate">{projectName}</span>
              <div className="ml-auto no-drag flex items-center gap-2" style={{ marginRight: 138 }}>
                <UsageMeter />
                <button
                  onClick={() => { setContextOpen(v => !v); setTimelineOpen(false) }}
                  className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors"
                  style={contextOpen
                    ? { background: 'rgba(61,133,200,0.15)', color: '#3d85c8', borderColor: 'rgba(61,133,200,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#555', borderColor: 'rgba(255,255,255,0.06)' }
                  }
                  title="Ver contexto del agente"
                >
                  <Layers size={8} />
                </button>
                <button
                  onClick={() => { setTimelineOpen((v) => !v); setContextOpen(false) }}
                  className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors"
                  style={timelineOpen
                    ? { background: 'rgba(61,133,200,0.15)', color: '#3d85c8', borderColor: 'rgba(61,133,200,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#555', borderColor: 'rgba(255,255,255,0.06)' }
                  }
                  title="Timeline de sesión"
                >
                  <Clock size={8} />
                </button>
                <UnityStatus />
              </div>
            </div>

            {/* Chat */}
            <ErrorBoundary>
              <div className="flex flex-col min-h-0 flex-1 overflow-hidden bg-[#1e1e22]">
                {!activeConversationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                    <MessageSquarePlus size={28} className="text-[#888]" />
                    <p className="text-[11px] text-[#888]">
                      Crea una conversación en la barra lateral para comenzar.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    {/* Main chat — centered with max-width on wide screens */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <MessageList onSend={send} />
                        {debugEnabled && <DebugPanel />}
                        <MessageInput onSend={send} />
                      </div>
                    </div>
                    {/* Right panel — Review (auto), Timeline or Context (manual) */}
                    <div style={{
                      width: (reviewActive || timelineOpen || contextOpen) ? '43%' : '0',
                      flexShrink: 0,
                      transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}>
                      {reviewActive ? (
                        <ReviewPanel />
                      ) : timelineOpen ? (
                        <TimelinePanel />
                      ) : contextOpen ? (
                        <ContextPanel onClose={() => setContextOpen(false)} />
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </ErrorBoundary>

            {/* Drag handle — only shown when docs panel is visible */}
            {!docsHidden && (
              <div
                className="h-[3px] bg-[#3A3A3A] hover:bg-[#3d85c8]/50 cursor-row-resize flex-shrink-0 transition-colors"
                onMouseDown={onDragStart}
              />
            )}

            {/* Bottom panel — docs, collapsible */}
            <ErrorBoundary>
              {!docsHidden ? (
                <div
                  className="flex border-t border-white/[0.07] flex-shrink-0 overflow-hidden bg-[#1e1e22]"
                  style={{ height: bottomH }}
                >
                  <div className="flex flex-col overflow-hidden flex-1">
                    <PanelHeader
                      label="Documentos"
                      onMinimize={() => setDocsHidden(true)}
                      onMaximize={() => setFocus('docs')}
                      isMaximized={false}
                    />
                    <div className="flex-1 overflow-hidden">
                      <DocEditor onSend={send} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-shrink-0 border-t border-white/[0.07]">
                  <button
                    className="w-full h-5 flex items-center justify-center gap-2 text-[#888] hover:text-[#C4C4C4] hover:bg-[#28282e] transition-colors"
                    title="Mostrar Documentos"
                    onClick={() => setDocsHidden(false)}
                  >
                    <span className="text-[9px] tracking-widest uppercase select-none">Documentos</span>
                  </button>
                </div>
              )}
            </ErrorBoundary>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Unity-style panel header (Inspector titlebar) ── */
function PanelHeader({
  label, onMinimize, onMaximize, isMaximized,
}: {
  label: string
  onMinimize: (() => void) | null
  onMaximize: () => void
  isMaximized: boolean
}) {
  return (
    <div className="flex items-center px-2 py-[3px] bg-[#28282e] border-b border-white/[0.07] flex-shrink-0 gap-1 select-none" style={{ minHeight: 22 }}>
      <span className="text-[11px] text-[#C4C4C4] font-medium flex-1 leading-none">{label}</span>
      <button
        className="p-0.5 text-[#888] hover:text-[#EEEEEE] hover:bg-[#585858] rounded transition-colors"
        title={isMaximized ? 'Restaurar' : 'Pantalla completa'}
        onClick={onMaximize}
      >
        {isMaximized ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
      </button>
      {onMinimize && (
        <button
          className="p-0.5 text-[#888] hover:text-[#EEEEEE] hover:bg-[#585858] rounded transition-colors"
          title="Minimizar"
          onClick={onMinimize}
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}

/* ── No project screen ── */
function NoProjectScreen({
  onOpenProject, projects, onSelectProject,
}: {
  onOpenProject: () => void
  projects: any[]
  onSelectProject: (p: any) => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 drag-region bg-[#1e1e22]">
      <div className="flex flex-col items-center gap-3 no-drag">
        <UnikaLogo size={56} />
        <h1 className="text-lg font-semibold text-[#D2D2D2] tracking-tight">Unika</h1>
        <p className="text-[11px] text-[#888] text-center max-w-xs">
          Selecciona un proyecto Unity para comenzar a trabajar con el agente.
        </p>
      </div>
      <button
        className="no-drag flex items-center gap-2 px-4 py-1.5 bg-[#585858] hover:bg-[#676767] active:bg-[#46607C] text-[#EEEEEE] text-[11px] font-medium border border-[#303030] rounded transition-colors"
        onClick={onOpenProject}
      >
        <FolderOpen size={14} />
        Abrir proyecto Unity
      </button>
      {projects.length > 0 && (
        <div className="no-drag flex flex-col items-center gap-1.5 w-64">
          <span className="text-[10px] text-[#888] uppercase tracking-widest mb-1">Recientes</span>
          {projects.map(p => (
            <button
              key={p.id}
              className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#28282e] border border-white/[0.07] rounded text-left transition-colors"
              onClick={() => onSelectProject(p)}
            >
              <FolderOpen size={13} className="text-[#888] flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] text-[#D2D2D2] font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-[#888] truncate">{p.unity_path}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import { Plus, FolderOpen, ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { UnikaLogo } from '../UnikaLogo'
import { useProjectStore } from '../../stores/projectStore'
import { useChatStore } from '../../stores/chatStore'

interface SidebarProps {
  onSend: (data: object) => void
  onOpenProject: () => void
  onOpenSettings: () => void
}

export function Sidebar({ onSend, onOpenProject, onOpenSettings }: SidebarProps) {
  const {
    projects,
    activeProjectId,
    activeConversationId,
    setActiveProject,
    setActiveConversation,
  } = useProjectStore()
  const clearMessages = useChatStore(s => s.clearMessages)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [newConvName, setNewConvName] = useState('')
  const [showNewConv, setShowNewConv] = useState<string | null>(null)

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const selectConversation = (projectId: string, convId: string) => {
    setActiveProject(projectId)
    setActiveConversation(convId)
    clearMessages()
    onSend({ type: 'select_project', project_id: projectId, channel_id: convId })
  }

  const addConversation = () => {
    if (!newConvName.trim()) return
    onSend({ type: 'create_channel', name: newConvName.trim() })
    setNewConvName('')
    setShowNewConv(null)
  }

  const otherProjects = projects.filter(p => p.id !== activeProjectId)

  return (
    /* Unity Hierarchy panel: bg #282828, header #3C3C3C, border #3A3A3A */
    <aside className="w-52 flex-shrink-0 flex flex-col h-full select-none border-r border-[#3A3A3A]"
           style={{ background: '#282828' }}>

      {/* Header — Unity toolbar style */}
      <div className="h-7 flex items-center px-3 gap-2 border-b border-[#3A3A3A] drag-region flex-shrink-0"
           style={{ background: '#3C3C3C' }}>
        <UnikaLogo size={14} />
        <span className="text-[11px] font-semibold text-[#EEEEEE] tracking-wide">Unika</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">

        {/* ── Active project ── */}
        {activeProject && (
          <div className="mb-1">
            {/* Project label — like Unity Hierarchy scene name */}
            <div className="flex items-center gap-1 px-2 py-[3px] border-b border-[#3A3A3A] mb-0.5"
                 style={{ background: '#3C3C3C' }}>
              <FolderOpen size={11} className="text-[#3d85c8] flex-shrink-0" />
              <span className="text-[11px] font-semibold text-[#EEEEEE] truncate flex-1"
                    title={activeProject.name}>
                {activeProject.name}
              </span>
            </div>

            {/* Unity path — small hint */}
            <div className="px-2 py-0.5">
              <span className="text-[10px] text-[#888] truncate block" title={activeProject.unity_path}>
                {activeProject.unity_path.split(/[\\/]/).slice(-2).join('/')}
              </span>
            </div>

            {/* Conversations — like GameObjects in hierarchy */}
            {(activeProject.conversations ?? []).map(conv => (
              <div
                key={conv.id}
                className={`flex items-center gap-1.5 pl-5 pr-2 py-[3px] cursor-pointer transition-colors ${
                  activeConversationId === conv.id
                    ? 'text-[#EEEEEE]'
                    : 'text-[#C4C4C4] hover:text-[#EEEEEE]'
                }`}
                style={activeConversationId === conv.id
                  ? { background: '#2C5D87' }
                  : undefined}
                onMouseEnter={e => {
                  if (activeConversationId !== conv.id)
                    (e.currentTarget as HTMLElement).style.background = '#3C3C3C'
                }}
                onMouseLeave={e => {
                  if (activeConversationId !== conv.id)
                    (e.currentTarget as HTMLElement).style.background = ''
                }}
                onClick={() => selectConversation(activeProject.id, conv.id)}
              >
                {/* Unity's hierarchy chevron indent */}
                <ChevronRight size={9} className="text-[#888] flex-shrink-0" />
                <span className="text-[11px] truncate">{conv.name}</span>
              </div>
            ))}

            {/* Add conversation */}
            {showNewConv === activeProject.id ? (
              <div className="px-2 py-1">
                <input
                  autoFocus
                  className="w-full text-[11px] px-2 py-1 rounded border outline-none placeholder-[#888]"
                  style={{ background: '#2A2A2A', borderColor: '#3d85c8', color: '#EEEEEE' }}
                  placeholder="Nombre de la conversación…"
                  value={newConvName}
                  onChange={e => setNewConvName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addConversation()
                    if (e.key === 'Escape') { setShowNewConv(null); setNewConvName('') }
                  }}
                />
                <p className="text-[10px] text-[#888] mt-0.5 px-1">Enter para crear · Esc para cancelar</p>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 pl-5 pr-2 py-[3px] cursor-pointer text-[#888] transition-colors hover:text-[#C4C4C4]"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3C3C3C' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                onClick={() => setShowNewConv(activeProject.id)}
              >
                <Plus size={9} className="flex-shrink-0" />
                <span className="text-[11px]">Nueva conversación</span>
              </div>
            )}
          </div>
        )}

        {/* ── Other recent projects ── */}
        {otherProjects.length > 0 && (
          <div className="mt-1 border-t border-[#3A3A3A] pt-1">
            <div className="px-2 pb-1">
              <span className="text-[10px] text-[#888] uppercase tracking-widest">Recientes</span>
            </div>
            {otherProjects.map(project => (
              <div key={project.id}>
                <div
                  className="flex items-center gap-1 px-2 py-[3px] cursor-pointer text-[#C4C4C4] transition-colors"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3C3C3C' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                  onClick={() => toggleCollapse(project.id)}
                >
                  {collapsed.has(project.id)
                    ? <ChevronRight size={10} className="text-[#888]" />
                    : <ChevronDown size={10} className="text-[#888]" />
                  }
                  <FolderOpen size={10} className="text-[#888] flex-shrink-0" />
                  <span className="text-[11px] truncate">{project.name}</span>
                </div>
                {!collapsed.has(project.id) && (
                  <div className="ml-2">
                    {(project.conversations ?? []).map(conv => (
                      <div
                        key={conv.id}
                        className="flex items-center gap-1.5 pl-5 pr-2 py-[3px] cursor-pointer text-[#888] transition-colors hover:text-[#C4C4C4]"
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3C3C3C' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                        onClick={() => selectConversation(project.id, conv.id)}
                      >
                        <ChevronRight size={9} className="flex-shrink-0 opacity-50" />
                        <span className="text-[11px] truncate">{conv.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom actions — Unity toolbar button style */}
      <div className="border-t border-[#3A3A3A] p-1.5 space-y-0.5 flex-shrink-0"
           style={{ background: '#3C3C3C' }}>
        <button
          className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium transition-colors"
          style={{ color: '#EEEEEE', background: '#585858', border: '1px solid #303030' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#676767' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#585858' }}
          onClick={onOpenProject}
        >
          <FolderOpen size={12} />
          <span>Abrir proyecto Unity</span>
        </button>
        <button
          className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-colors"
          style={{ color: '#C4C4C4' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#585858' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
          onClick={onOpenSettings}
        >
          <Settings size={12} />
          <span>Ajustes</span>
        </button>
      </div>
    </aside>
  )
}

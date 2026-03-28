import React, { useState } from 'react'
import { GuiElement } from '../../lib/markdown'
import { ChevronDown, ChevronRight, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export function GuiElementRenderer({ element }: { element: GuiElement }) {
  switch (element.element) {
    case 'inspector':     return <InspectorPanel data={element.data} />
    case 'file_tree':     return <FileTree data={element.data} />
    case 'code_diff':     return <CodeDiff data={element.data} />
    case 'console_log':   return <ConsoleLog data={element.data} />
    case 'progress':      return <ProgressBar data={element.data} />
    case 'plan_board':    return <PlanBoard data={element.data} />
    case 'asset_card':    return <AssetCard data={element.data} />
    case 'asset_list':    return <AssetCarousel data={element.data} />
    case 'collapsible':   return <CollapsibleSection data={element.data} />
    default:              return <pre className="text-xs text-gray-400">{JSON.stringify(element.data, null, 2)}</pre>
  }
}

// --- Inspector Panel (Unity-style) ---
function InspectorPanel({ data }: { data: any }) {
  return (
    <div className="border border-[#3d85c8]/30 rounded bg-[#1e1f22] my-2 text-xs">
      <div className="bg-[#3A3A3A] px-3 py-1.5 font-semibold text-gray-200 flex items-center gap-2">
        <span>🎮</span>
        <span>{data.name || 'Inspector'}</span>
        <span className="ml-auto text-gray-500 text-[10px]">
          {data.active === false ? '(Inactive)' : ''}
        </span>
      </div>
      {data.transform && (
        <TransformSection t={data.transform} />
      )}
      {data.components?.map((comp: any, i: number) => (
        <ComponentSection key={i} comp={comp} />
      ))}
    </div>
  )
}

function TransformSection({ t }: { t: any }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-[#3A3A3A]">
      <div className="px-3 py-1 flex items-center gap-1 cursor-pointer hover:bg-[#2a2b2e]" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-[#3d85c8] font-semibold">Transform</span>
      </div>
      {open && (
        <div className="px-4 pb-2 space-y-1">
          {['position', 'rotation', 'scale'].map(key => (
            t[key] && (
              <div key={key} className="flex gap-2 items-center">
                <span className="text-gray-500 w-16 capitalize">{key}</span>
                <span className="text-gray-300">
                  X:{t[key].x?.toFixed(2) ?? '0'} Y:{t[key].y?.toFixed(2) ?? '0'} Z:{t[key].z?.toFixed(2) ?? '0'}
                </span>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}

function ComponentSection({ comp }: { comp: any }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[#3A3A3A] last:border-0">
      <div className="px-3 py-1 flex items-center gap-1 cursor-pointer hover:bg-[#2a2b2e]" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-gray-200">{comp.type}</span>
      </div>
      {open && comp.fields && (
        <div className="px-4 pb-2 space-y-1">
          {Object.entries(comp.fields).map(([k, v]: [string, any]) => (
            <div key={k} className="flex gap-2">
              <span className="text-gray-500 w-28 truncate">{k}</span>
              <span className="text-gray-300 truncate">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- File Tree ---
function FileTree({ data }: { data: any }) {
  const files: string[] = data.files || []
  return (
    <div className="border border-[#3A3A3A] rounded bg-[#1e1f22] my-2 p-3 text-xs max-h-48 overflow-y-auto">
      <div className="font-semibold text-gray-300 mb-2">📁 {data.root || 'Files'}</div>
      {files.map((f, i) => (
        <div key={i} className="text-gray-400 pl-3 py-0.5">📄 {f}</div>
      ))}
    </div>
  )
}

// --- Code Diff ---
function CodeDiff({ data }: { data: any }) {
  const lines: string[] = (data.diff || '').split('\n')
  return (
    <div className="border border-[#3A3A3A] rounded bg-[#18191c] my-2 overflow-hidden text-xs">
      <div className="bg-[#3A3A3A] px-3 py-1 text-gray-400 font-mono">{data.file || 'diff'}</div>
      <pre className="px-3 py-2 overflow-x-auto max-h-60">
        {lines.map((line, i) => (
          <div key={i} className={
            line.startsWith('+') ? 'text-green-400' :
            line.startsWith('-') ? 'text-red-400' :
            line.startsWith('@@') ? 'text-blue-400' :
            'text-gray-400'
          }>{line}</div>
        ))}
      </pre>
    </div>
  )
}

// --- Console Log ---
function ConsoleLog({ data }: { data: any }) {
  const [filter, setFilter] = useState('all')
  const logs: any[] = data.logs || []
  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter)

  const icon = (type: string) => {
    if (type === 'error' || type === 'exception') return <AlertCircle size={11} className="text-red-400" />
    if (type === 'warning') return <AlertTriangle size={11} className="text-yellow-400" />
    return <Info size={11} className="text-blue-400" />
  }

  return (
    <div className="border border-[#3A3A3A] rounded bg-[#1e1f22] my-2 text-xs">
      <div className="bg-[#3A3A3A] px-3 py-1 flex items-center gap-3">
        <span className="text-gray-300 font-semibold">Console</span>
        {['all', 'error', 'warning', 'log'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${filter === f ? 'bg-[#3d85c8] text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.map((log, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-1 border-b border-[#18191c] hover:bg-[#2a2b2e]">
            {icon(log.type)}
            <span className="text-gray-500 flex-shrink-0">{log.timestamp}</span>
            <span className="text-gray-300 break-words">{log.message}</span>
          </div>
        ))}
        {filtered.length === 0 && <div className="px-3 py-2 text-gray-500">Sin logs</div>}
      </div>
    </div>
  )
}

// --- Progress Bar ---
function ProgressBar({ data }: { data: any }) {
  const pct = Math.min(100, Math.max(0, data.percent ?? 0))
  return (
    <div className="border border-[#3A3A3A] rounded bg-[#1e1f22] my-2 p-3 text-xs">
      <div className="flex justify-between mb-1.5">
        <span className="text-gray-300">{data.label || 'Progreso'}</span>
        <span className="text-gray-400">{pct}%</span>
      </div>
      <div className="h-2 bg-[#3A3A3A] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#3d85c8] rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {data.status && <div className="mt-1 text-gray-500">{data.status}</div>}
    </div>
  )
}

// --- Plan Board ---
function PlanBoard({ data }: { data: any }) {
  const tasks: any[] = data.tasks || []
  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-green-400 bg-green-400/10'
    if (s === 'in_progress') return 'text-[#3d85c8] bg-[#3d85c8]/10'
    return 'text-gray-400 bg-gray-400/10'
  }
  const statusLabel = (s: string) => {
    if (s === 'completed') return '✓ Completado'
    if (s === 'in_progress') return '⟳ En progreso'
    return '○ Pendiente'
  }
  return (
    <div className="border border-[#3A3A3A] rounded bg-[#1e1f22] my-2 text-xs">
      <div className="bg-[#3A3A3A] px-3 py-1.5 font-semibold text-gray-200">
        📋 {data.title || 'Plan de trabajo'}
      </div>
      <div className="divide-y divide-[#3A3A3A]">
        {tasks.map((task, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <span className="text-gray-500 w-4">{i + 1}.</span>
            <span className="flex-1 text-gray-300">{task.content}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] ${statusColor(task.status)}`}>
              {statusLabel(task.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Asset Carousel (asset_list) ---
function AssetCarousel({ data }: { data: any }) {
  const assets: any[] = data.assets || []
  const typeColor: Record<string, string> = {
    script: '#4C7EFF', prefab: '#B08EE8', material: '#FFA040', texture: '#40C8FF',
    scene: '#F4BC02', audio: '#D4A843', animation: '#6BCB77', shader: '#40C8FF',
  }
  const typeEmoji: Record<string, string> = {
    script: '🟦', prefab: '🟣', material: '🟧', texture: '🖼️',
    scene: '🎬', audio: '🎵', animation: '🎭', shader: '✨',
  }
  return (
    <div className="my-2">
      {data.title && (
        <div className="text-xs text-[#888] mb-1.5 font-medium">{data.title}</div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {assets.map((asset: any, i: number) => {
          const color = typeColor[asset.type] || '#888'
          return (
            <div
              key={i}
              className="flex-shrink-0 border border-[#3A3A3A] rounded-lg bg-[#1e1f22] p-3 cursor-pointer transition-colors hover:border-[#3d85c8]/60"
              style={{ minWidth: 140, maxWidth: 180 }}
              onClick={() => navigator.clipboard.writeText(asset.name || asset.path || '')}
              title="Click para copiar nombre"
            >
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 16 }}>{typeEmoji[asset.type] ?? '📄'}</span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wide"
                  style={{ background: `${color}22`, color }}
                >
                  {asset.type || 'file'}
                </span>
              </div>
              <div className="text-xs text-white font-medium truncate">{asset.name}</div>
              {asset.path && (
                <div className="text-[10px] text-[#888] truncate mt-0.5">{asset.path}</div>
              )}
              {asset.description && (
                <div className="text-[10px] text-[#C4C4C4] mt-1.5 leading-relaxed line-clamp-2">
                  {asset.description}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Collapsible section ---
function CollapsibleSection({ data }: { data: any }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#3A3A3A] rounded my-2 overflow-hidden text-xs">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-[#3A3A3A] hover:bg-[#444] text-left transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="text-[#EEEEEE] font-medium flex-1">{data.title || 'Detalles'}</span>
        {data.badge && (
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: '#3d85c8', color: 'white' }}>
            {data.badge}
          </span>
        )}
      </button>
      {open && (
        <div className="p-3 bg-[#1e1f22] text-[#C4C4C4] leading-relaxed whitespace-pre-wrap">
          {data.content}
        </div>
      )}
    </div>
  )
}

// --- Asset Card ---
function AssetCard({ data }: { data: any }) {
  const typeEmoji: Record<string, string> = {
    script: '🟦', prefab: '🟣', material: '🟧', texture: '🖼️',
    scene: '🎬', audio: '🎵', animation: '🎭', shader: '✨',
  }
  return (
    <div className="inline-flex items-center gap-2 border border-[#3A3A3A] rounded bg-[#1e1f22] px-3 py-2 my-1 text-xs">
      <span>{typeEmoji[data.type] ?? '📄'}</span>
      <span className="text-gray-300">{data.name}</span>
      <span className="text-gray-500 font-mono">{data.path}</span>
    </div>
  )
}

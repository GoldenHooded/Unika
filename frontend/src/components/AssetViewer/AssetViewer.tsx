import React, { useState, useEffect, useCallback } from 'react'
import { useUnityStore } from '../../stores/unityStore'
import { useProjectStore } from '../../stores/projectStore'
import {
  ChevronRight, ChevronDown, RefreshCw, Search,
  FileCode2, Package, PaintBucket, Music, Film, Image, Box, Cpu, File, Zap,
} from 'lucide-react'

/* Unity Project Window — asset type icons + colors */
const TYPE_ICON: Record<string, { Icon: any; color: string }> = {
  script:    { Icon: FileCode2,   color: '#4C7EFF' },
  prefab:    { Icon: Package,     color: '#B08EE8' },
  material:  { Icon: PaintBucket, color: '#FFA040' },
  texture:   { Icon: Image,       color: '#40C8FF' },
  sprite:    { Icon: Image,       color: '#40C8FF' },
  scene:     { Icon: Film,        color: '#F4BC02' },
  audio:     { Icon: Music,       color: '#D4A843' },
  animation: { Icon: Box,         color: '#6BCB77' },
  animator:  { Icon: Cpu,         color: '#6BCB77' },
  shader:    { Icon: Zap,         color: '#80DEEA' },
  asset:     { Icon: Box,         color: '#BCAAA4' },
  file:      { Icon: File,        color: '#888888' },
}

interface AssetNode {
  path: string
  name: string
  ext: string
  type: string
  guid?: string
  children?: AssetNode[]
}

function buildTree(assets: any[]): Record<string, any> {
  const tree: Record<string, any> = {}
  for (const a of assets) {
    // Normalise separators — backend may return Windows or Unix paths
    const parts = String(a.path ?? '').replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length === 0) continue
    let node = tree
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) {
        node[parts[i]] = { _isDir: true, _children: {} }
      } else if (!node[parts[i]]._children) {
        // Segment was previously stored as a leaf — promote it to a directory
        node[parts[i]] = { ...node[parts[i]], _isDir: true, _children: {} }
      }
      node = node[parts[i]]._children
    }
    const leaf = parts[parts.length - 1]
    if (!node[leaf] || !node[leaf]._isDir) {
      node[leaf] = { ...a, _isDir: false }
    }
  }
  return tree
}

export function AssetViewer({ onSend }: { onSend: (data: object) => void }) {
  const assets = useUnityStore(s => s.assets)
  const setAssets = useUnityStore(s => s.setAssets)
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['Assets']))

  const refresh = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const res = await fetch(`http://127.0.0.1:8765/projects/${activeProjectId}/assets`)
      const data = await res.json()
      if (Array.isArray(data.assets)) setAssets(data.assets)
    } catch {}
  }, [activeProjectId, setAssets])

  useEffect(() => {
    if (activeProjectId) refresh()
  }, [activeProjectId, refresh])

  const filtered = query
    ? assets.filter(a => a.name?.toLowerCase().includes(query.toLowerCase()))
    : assets

  const tree = buildTree(filtered)

  return (
    /* Unity Project Window: bg #282828 */
    <div className="flex flex-col h-full" style={{ background: '#282828', fontSize: 11 }}>

      {/* Toolbar — Unity-style search bar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b flex-shrink-0"
           style={{ borderColor: '#3A3A3A', background: '#3C3C3C' }}>
        <div className="flex-1 flex items-center gap-1 px-1.5 py-0.5 rounded"
             style={{ background: '#2A2A2A', border: '1px solid #3A3A3A' }}>
          <Search size={10} style={{ color: '#888' }} />
          <input
            className="bg-transparent outline-none flex-1 text-[11px] placeholder-[#888]"
            style={{ color: '#D2D2D2' }}
            placeholder="Buscar assets..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <button
          onClick={refresh}
          className="p-0.5 rounded transition-colors"
          style={{ color: '#888' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#D2D2D2' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
          title="Refrescar"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-0.5">
        {assets.length === 0 ? (
          <div className="px-4 py-6 text-center" style={{ color: '#888' }}>
            <p className="text-[11px]">Sin assets.</p>
            {activeProjectId && (
              <p className="mt-1 text-[10px]">Haz clic en ↺ para escanear.</p>
            )}
          </div>
        ) : (
          <TreeNode
            name="Assets"
            node={{ _isDir: true, _children: tree }}
            path="Assets"
            expanded={expanded}
            setExpanded={setExpanded}
            depth={0}
          />
        )}
      </div>
    </div>
  )
}

function TypeIcon({ type }: { type: string }) {
  const meta = TYPE_ICON[type] ?? TYPE_ICON.file
  const { Icon, color } = meta
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center rounded-sm"
      style={{ width: 14, height: 14, background: color + '1A', border: `1px solid ${color}44` }}
    >
      <Icon size={8} style={{ color }} />
    </span>
  )
}

function TreeNode({ name, node, path, expanded, setExpanded, depth }: any) {
  const isDir = node._isDir
  const isOpen = expanded.has(path)
  const indent = depth * 10

  if (isDir) {
    const children = Object.entries(node._children || {})
      .sort(([, a]: any, [, b]: any) => {
        // folders first
        if (a._isDir && !b._isDir) return -1
        if (!a._isDir && b._isDir) return 1
        return 0
      })

    return (
      <div>
        <div
          className="flex items-center gap-1 py-[2px] cursor-pointer transition-colors"
          style={{ paddingLeft: 6 + indent, color: '#C4C4C4' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3C3C3C' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
          onClick={() => {
            setExpanded((prev: Set<string>) => {
              const n = new Set(prev)
              n.has(path) ? n.delete(path) : n.add(path)
              return n
            })
          }}
        >
          <span className="flex-shrink-0" style={{ color: '#888' }}>
            {isOpen
              ? <ChevronDown size={9} />
              : <ChevronRight size={9} />
            }
          </span>
          {/* Folder icon in Unity yellow-brown */}
          <span className="text-[11px] leading-none" style={{ color: '#D4A843' }}>▶</span>
          <span className="text-[11px] truncate ml-0.5">{name}</span>
          <span className="ml-auto mr-2 text-[10px]" style={{ color: '#888' }}>
            {children.length}
          </span>
        </div>
        {isOpen && (
          <div>
            {children.map(([childName, childNode]: [string, any]) => (
              <TreeNode
                key={childName}
                name={childName}
                node={childNode}
                path={`${path}/${childName}`}
                expanded={expanded}
                setExpanded={setExpanded}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 py-[2px] cursor-pointer transition-colors"
      style={{ paddingLeft: 20 + indent, color: '#C4C4C4' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3C3C3C' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
      title={node.path}
    >
      <TypeIcon type={node.type} />
      <span className="text-[11px] truncate">{name}</span>
    </div>
  )
}

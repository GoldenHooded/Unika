import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useReviewStore } from '../../stores/reviewStore'
import { CommandItem } from '../../stores/chatStore'

// ── Node / Edge types ─────────────────────────────────────────────────────────
type NodeKind = 'root' | 'file' | 'read' | 'edit' | 'compile' | 'console' | 'ok' | 'fixed' | 'fail'
type NodeStatus = 'idle' | 'active' | 'done' | 'error'

interface GNode {
  id: string
  kind: NodeKind
  label: string
  sub?: string
  status: NodeStatus
  // relative position 0..1 within canvas
  rx: number
  ry: number
}

interface GEdge {
  id: string
  from: string
  to: string
  active: boolean
}

// ── Palette ───────────────────────────────────────────────────────────────────
const K: Record<NodeKind, { color: string; bg: string; icon: string }> = {
  root:    { color: '#3d85c8', bg: '#071428', icon: '◈' },
  file:    { color: '#4C7EFF', bg: '#060F28', icon: '▣' },
  read:    { color: '#6BCB77', bg: '#06180A', icon: '◉' },
  edit:    { color: '#FFA040', bg: '#1C0E00', icon: '◆' },
  compile: { color: '#40C8FF', bg: '#041520', icon: '⚙' },
  console: { color: '#B08EE8', bg: '#0D0820', icon: '▤' },
  ok:      { color: '#6BCB77', bg: '#081A0A', icon: '✓' },
  fixed:   { color: '#F4BC02', bg: '#1A1200', icon: '⚡' },
  fail:    { color: '#E05555', bg: '#1A0606', icon: '✗' },
}

// ── Graph builder ─────────────────────────────────────────────────────────────
const SUBAGENT_ROOT_LABELS: Record<string, string> = {
  coder:    'Coder',
  planner:  'Planner',
  search:   'Search',
  reasoner: 'Reasoner',
  reviewer: 'Reviewer',
}

function buildGraph(
  allCmds: CommandItem[],
  reviewStatus: string | null,
  streaming: boolean,
  subagentLabel: string | null,
): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = []
  const edges: GEdge[] = []

  const cmdStatus = (c: CommandItem): NodeStatus =>
    c.status === 'running' || c.status === 'building' ? 'active'
    : c.status === 'done' ? 'done'
    : c.status === 'error' ? 'error'
    : 'idle'

  // Root
  const rootLabel = subagentLabel ? (SUBAGENT_ROOT_LABELS[subagentLabel] ?? subagentLabel) : 'Code Review'
  nodes.push({
    id: 'root', kind: 'root', label: rootLabel,
    status: streaming ? 'active' : reviewStatus ? 'done' : 'idle',
    rx: 0.5, ry: 0.08,
  })

  // Group file commands
  const fileMap = new Map<string, { path: string; cmds: CommandItem[] }>()
  for (const c of allCmds) {
    if (!['FILE_READ', 'FILE_EDIT', 'FILE_WRITE'].includes(c.name)) continue
    const path = String(c.args?.path ?? '')
    const name = path.split(/[\\/]/).pop() ?? path
    if (!name) continue
    if (!fileMap.has(name)) fileMap.set(name, { path, cmds: [] })
    fileMap.get(name)!.cmds.push(c)
  }

  const files = Array.from(fileMap.entries())
  const MAX_FILES = 5
  const visibleFiles = files.slice(0, MAX_FILES)
  const hiddenCount  = files.length - visibleFiles.length
  if (hiddenCount > 0) {
    visibleFiles.push([`+${hiddenCount} más`, { path: '', cmds: [] }])
  }

  const totalFiles = visibleFiles.length
  visibleFiles.forEach(([name, { cmds }], fi) => {
    const fx = totalFiles === 1 ? 0.5 : 0.1 + (fi / (totalFiles - 1)) * 0.8
    const fileId = `file_${fi}`
    const hasEdit = cmds.some(c => c.name !== 'FILE_READ')
    const fileStatus: NodeStatus = cmds.some(c => c.status === 'running' || c.status === 'building') ? 'active'
      : cmds.length > 0 && cmds.every(c => c.status === 'done') ? 'done'
      : 'idle'

    nodes.push({ id: fileId, kind: 'file', label: name, status: fileStatus, rx: fx, ry: 0.28 })
    edges.push({ id: `e_root_${fileId}`, from: 'root', to: fileId, active: fileStatus !== 'idle' })

    // READ node
    const reads = cmds.filter(c => c.name === 'FILE_READ')
    if (reads.length > 0) {
      const lastRead = reads[reads.length - 1]
      const readId = `read_${fi}`
      nodes.push({
        id: readId, kind: 'read', label: 'READ',
        status: cmdStatus(lastRead),
        rx: hasEdit ? fx - 0.06 : fx,
        ry: 0.50,
      })
      edges.push({ id: `e_${fileId}_${readId}`, from: fileId, to: readId, active: cmdStatus(lastRead) !== 'idle' })
    }

    // EDIT nodes
    const edits = cmds.filter(c => c.name !== 'FILE_READ')
    edits.forEach((ec, ei) => {
      const editId = `edit_${fi}_${ei}`
      const preview = ec.args?.new_string?.toString().slice(0, 22) ?? ''
      nodes.push({
        id: editId, kind: 'edit', label: 'EDIT',
        sub: preview || undefined,
        status: cmdStatus(ec),
        rx: fx + 0.06,
        ry: 0.50 + ei * 0.10,
      })
      edges.push({ id: `e_${fileId}_${editId}`, from: fileId, to: editId, active: cmdStatus(ec) !== 'idle' })
    })
  })

  // System nodes (COMPILE / CONSOLE)
  const compiles = allCmds.filter(c => c.name === 'UNITY_COMPILE')
  const consoles = allCmds.filter(c => c.name === 'UNITY_READ_CONSOLE')

  if (compiles.length > 0) {
    const lc = compiles[compiles.length - 1]
    nodes.push({ id: 'compile', kind: 'compile', label: 'COMPILE', status: cmdStatus(lc), rx: 0.38, ry: 0.72 })
    edges.push({ id: 'e_root_compile', from: 'root', to: 'compile', active: cmdStatus(lc) !== 'idle' })
  }
  if (consoles.length > 0) {
    const lc = consoles[consoles.length - 1]
    nodes.push({ id: 'console', kind: 'console', label: 'CONSOLE', status: cmdStatus(lc), rx: 0.62, ry: 0.72 })
    const fromId = compiles.length > 0 ? 'compile' : 'root'
    edges.push({ id: 'e_compile_console', from: fromId, to: 'console', active: cmdStatus(lc) !== 'idle' })
  }

  // Verdict
  if (reviewStatus && reviewStatus !== 'running') {
    const vkind: NodeKind = reviewStatus === 'approved' ? 'ok' : reviewStatus === 'fixed' ? 'fixed' : 'fail'
    const vlabel = reviewStatus === 'approved' ? 'Aprobado' : reviewStatus === 'fixed' ? 'Corregido' : 'Error'
    nodes.push({ id: 'verdict', kind: vkind, label: vlabel, status: 'done', rx: 0.5, ry: 0.88 })
    const from = consoles.length > 0 ? 'console' : compiles.length > 0 ? 'compile' : 'root'
    edges.push({ id: 'e_verdict', from, to: 'verdict', active: true })
  }

  return { nodes, edges }
}

// ── Edge SVG component ────────────────────────────────────────────────────────
function EdgeLine({
  x1, y1, x2, y2, active, color,
}: { x1: number; y1: number; x2: number; y2: number; active: boolean; color: string }) {
  const pathRef = useRef<SVGPathElement>(null)
  const [pathLen, setPathLen] = useState(0)
  const [drawn, setDrawn] = useState(!active) // idle edges not drawn

  useEffect(() => {
    if (pathRef.current) setPathLen(pathRef.current.getTotalLength())
  }, [x1, y1, x2, y2])

  useEffect(() => {
    if (active && pathLen > 0) {
      setDrawn(false)
      // trigger draw animation next frame
      const t = requestAnimationFrame(() => setDrawn(true))
      return () => cancelAnimationFrame(t)
    }
  }, [active, pathLen])

  const midX = (x1 + x2) / 2
  const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`

  return (
    <g>
      {/* Faint background path */}
      <path d={d} fill="none" stroke="#1A1A1A" strokeWidth={1.5} />
      {/* Animated draw */}
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke={active ? color : '#222'}
        strokeWidth={active ? 1.5 : 1}
        strokeDasharray={pathLen || 1000}
        strokeDashoffset={drawn ? 0 : (pathLen || 1000)}
        style={{ transition: drawn ? `stroke-dashoffset ${0.4}s ease-out` : 'none', opacity: active ? 0.7 : 0.2 }}
      />
      {/* Traveling pulse on active edges */}
      {active && pathLen > 0 && (
        <circle r={2.5} fill={color} opacity={0.9}>
          <animateMotion dur="2s" repeatCount="indefinite" path={d} />
        </circle>
      )}
    </g>
  )
}

// ── Node component ────────────────────────────────────────────────────────────
function GraphNode({ node, x, y }: { node: GNode; x: number; y: number }) {
  const style = K[node.kind]
  const isActive  = node.status === 'active'
  const isDone    = node.status === 'done'
  const isError   = node.status === 'error'
  const isRoot    = node.kind === 'root'
  const isVerdict = ['ok', 'fixed', 'fail'].includes(node.kind)

  const W = isRoot ? 96 : isVerdict ? 80 : 70
  const H = isRoot ? 32 : 26

  return (
    <div
      style={{
        position: 'absolute',
        left: x - W / 2,
        top: y - H / 2,
        width: W,
        height: H,
        background: style.bg,
        border: `1px solid ${isActive ? style.color : isDone ? style.color + 'AA' : '#222'}`,
        borderRadius: isVerdict ? 14 : 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 6px',
        boxShadow: isActive ? `0 0 10px ${style.color}55, 0 0 20px ${style.color}22` : isDone ? `0 0 5px ${style.color}22` : 'none',
        animation: node.status !== 'idle' ? 'popIn 0.25s ease-out' : undefined,
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
        pointerEvents: 'none',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Active pulse ring */}
      {isActive && (
        <div style={{
          position: 'absolute', inset: -3, borderRadius: isVerdict ? 17 : 8,
          border: `1px solid ${style.color}`,
          animation: 'commandPulse 1.8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1 }}>
        <span style={{ fontSize: isRoot ? 12 : 10, color: style.color, lineHeight: 1 }}>
          {isActive ? <span style={{ animation: 'blink 1s step-end infinite' }}>{style.icon}</span> : style.icon}
        </span>
        <span style={{
          fontSize: isRoot ? 10 : 9,
          fontWeight: 600,
          color: isActive ? style.color : isDone ? style.color + 'DD' : '#555',
          fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: W - 24,
        }}>
          {node.label}
        </span>
      </div>
      {node.sub && (
        <div style={{
          fontSize: 8, color: '#555', fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
          maxWidth: W - 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {node.sub}
        </div>
      )}
      {/* Status dot */}
      <div style={{
        position: 'absolute', top: 3, right: 4, width: 4, height: 4, borderRadius: 2,
        background: isActive ? style.color : isDone ? '#6BCB77' : isError ? '#E05555' : '#333',
        boxShadow: isActive ? `0 0 4px ${style.color}` : 'none',
        animation: isActive ? 'blink 1s step-end infinite' : undefined,
      }} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ReviewPanel() {
  const messages      = useReviewStore(s => s.messages)
  const status        = useReviewStore(s => s.status)
  const streaming     = useReviewStore(s => s.streaming)
  const thinkingText  = useReviewStore(s => s.thinkingText)
  const subagentLabel = useReviewStore(s => s.subagentLabel)
  const containerRef  = useRef<HTMLDivElement>(null)
  const thinkingRef   = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 320, h: 400 })

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const e = entries[0]
      if (e) setDims({ w: e.contentRect.width, h: e.contentRect.height })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Auto-scroll thinking section to bottom as tokens arrive
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight
    }
  }, [thinkingText])

  const allCmds = useMemo(() => messages.flatMap(m => m.commands ?? []), [messages])

  const { nodes, edges } = useMemo(
    () => buildGraph(allCmds, status, streaming, subagentLabel),
    [allCmds, status, streaming, subagentLabel],
  )

  // Node lookup for edge endpoints
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  // Map node rx/ry to actual pixels
  const px = (n: GNode) => n.rx * dims.w
  const py = (n: GNode) => n.ry * dims.h

  // Live text from last streaming message
  const liveText = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last?.streaming) return ''
    return last.content.replace(/\n/g, ' ').slice(-120)
  }, [messages])

  // Status badge — label depends on active sub-agent
  const streamingLabel = subagentLabel === 'coder'    ? 'Programando…'
    : subagentLabel === 'planner'  ? 'Planificando…'
    : subagentLabel === 'search'   ? 'Buscando…'
    : subagentLabel === 'reasoner' ? 'Razonando…'
    : subagentLabel === 'reviewer' ? 'Revisando…'
    : 'Analizando…'
  const badge = status === 'approved' ? { label: 'Aprobado', color: '#6BCB77' }
    : status === 'fixed'    ? { label: 'Corregido', color: '#F4BC02' }
    : status === 'error'    ? { label: 'Error',     color: '#E05555' }
    : streaming             ? { label: streamingLabel, color: '#3d85c8' }
    : null

  return (
    <div
      className="flex flex-col"
      style={{
        width: '100%', height: '100%',
        background: '#0C0D0F',
        backgroundImage: 'radial-gradient(circle, #1a1a1a 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        animation: 'slideInRight 0.35s ease-out',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 flex-shrink-0"
           style={{ height: 36, background: '#0A0B0D', borderBottom: '1px solid #1A1A1A' }}>
        <span style={{ fontSize: 9, fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", color: '#3d85c8', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {subagentLabel
            ? `◈ Sub-agente: ${subagentLabel.charAt(0).toUpperCase() + subagentLabel.slice(1)}`
            : '◈ Agente de Revisión'
          }
        </span>
        {badge && (
          <span className="ml-auto flex items-center gap-1"
                style={{ fontSize: 10, fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", color: badge.color,
                         background: badge.color + '18', padding: '1px 8px', borderRadius: 3,
                         border: `1px solid ${badge.color}44` }}>
            {streaming && (
              <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin inline-block mr-1" />
            )}
            {badge.label}
          </span>
        )}
      </div>

      {/* Body: graph + thinking section share the remaining height */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        {/* Graph canvas — shrinks when thinking section is present */}
        <div
          ref={containerRef}
          className="relative overflow-hidden"
          style={{ flex: thinkingText ? '0 0 60%' : '1', minHeight: 0 }}
        >
          {/* SVG edges layer */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            preserveAspectRatio="none"
          >
            {edges.map(e => {
              const fromNode = nodeMap.get(e.from)
              const toNode   = nodeMap.get(e.to)
              if (!fromNode || !toNode) return null
              const edgeColor = K[fromNode.kind].color
              return (
                <EdgeLine
                  key={e.id}
                  x1={px(fromNode)} y1={py(fromNode)}
                  x2={px(toNode)}   y2={py(toNode)}
                  active={e.active}
                  color={edgeColor}
                />
              )
            })}
          </svg>

          {/* Node divs layer */}
          {nodes.map(n => (
            <GraphNode key={n.id} node={n} x={px(n)} y={py(n)} />
          ))}

          {/* Empty state */}
          {nodes.length <= 1 && !streaming && !status && !thinkingText && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <div style={{ fontSize: 22, opacity: 0.2, color: '#3d85c8' }}>◈</div>
              <span style={{ fontSize: 10, color: '#333', fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", letterSpacing: '0.1em' }}>
                esperando revisión…
              </span>
            </div>
          )}
        </div>

        {/* Thinking section — only shown when reasoning tokens are present */}
        {thinkingText && (
          <div style={{
            flex: '0 0 40%',
            display: 'flex',
            flexDirection: 'column',
            borderTop: '1px solid #1A1A1A',
            background: '#09090B',
            overflow: 'hidden',
            minHeight: 0,
          }}>
            {/* Section header */}
            <div style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderBottom: '1px solid #141414',
              background: '#0A0B0D',
            }}>
              <span style={{ fontSize: 9, fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", color: '#3d85c8', letterSpacing: '0.12em' }}>
                › pensamiento
              </span>
              {streaming && (
                <span
                  className="streaming-cursor inline-block align-middle"
                  style={{ width: 5, height: 9, background: '#3d85c8AA' }}
                />
              )}
            </div>
            {/* Scrollable thinking text */}
            <div
              ref={thinkingRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '6px 10px',
                fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
                fontSize: 9,
                color: '#4A4A5A',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {thinkingText}
            </div>
          </div>
        )}
      </div>

      {/* Live ticker (streaming review message) */}
      {liveText && (
        <div style={{
          flexShrink: 0, borderTop: '1px solid #141414',
          background: '#0A0B0D', padding: '4px 10px',
          fontSize: 9, fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", color: '#444',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          <span style={{ color: '#3d85c8', marginRight: 6 }}>›</span>
          {liveText}
          <span className="streaming-cursor inline-block w-1 h-3 ml-0.5 align-middle" style={{ background: '#3d85c8' }} />
        </div>
      )}
    </div>
  )
}

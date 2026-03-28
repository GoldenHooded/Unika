import React, { useMemo, useState } from 'react'
import { Bug, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useDebugStore, DebugEvent } from '../../stores/debugStore'
import { useProjectStore } from '../../stores/projectStore'

interface TurnGroup {
  id: string
  turn?: number
  model?: string
  status: 'running' | 'done' | 'failed' | 'interrupted'
  durationMs?: number
  reason?: string
  toolCount?: number
  toolNames: string[]
  error?: string
  errorKind?: string
  events: DebugEvent[]
}

function buildGroups(events: DebugEvent[]): TurnGroup[] {
  const byId = new Map<string, TurnGroup>()

  for (const event of events) {
    if (!event.message_id) continue
    const id = event.message_id
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        turn: event.turn,
        model: event.model,
        status: 'running',
        durationMs: event.duration_ms,
        reason: event.reason,
        toolCount: event.tool_count,
        toolNames: event.tool_names ?? [],
        error: event.error,
        errorKind: event.error_kind,
        events: [],
      })
    }
    const group = byId.get(id)!
    group.events.push(event)
    group.turn = group.turn ?? event.turn
    group.model = group.model ?? event.model
    group.durationMs = event.duration_ms ?? group.durationMs
    group.reason = event.reason ?? group.reason
    group.toolCount = event.tool_count ?? group.toolCount
    group.toolNames = event.tool_names?.length ? event.tool_names : group.toolNames
    group.error = event.error || group.error
    group.errorKind = event.error_kind || group.errorKind

    if (event.phase === 'turn_failed') group.status = 'failed'
    if (event.phase === 'turn_end') {
      group.status = event.status === 'interrupted' ? 'interrupted' : 'done'
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const ta = a.events[a.events.length - 1]?.timestamp_ms ?? 0
    const tb = b.events[b.events.length - 1]?.timestamp_ms ?? 0
    return tb - ta
  })
}

export function DebugPanel() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const events = useDebugStore(s => s.events)
  const clear = useDebugStore(s => s.clear)
  const activeConversationId = useProjectStore(s => s.activeConversationId)

  const filtered = useMemo(
    () => events.filter(e => !activeConversationId || e.channel === activeConversationId || e.channel === 'general'),
    [events, activeConversationId],
  )

  const socketEvents = useMemo(
    () => filtered.filter(e => e.phase === 'socket_state' || e.phase === 'unity_bridge').slice(-16).reverse(),
    [filtered],
  )

  const groups = useMemo(
    () => buildGroups(filtered),
    [filtered],
  )

  return (
    <div className="border-t border-[#3A3A3A] bg-[#1B1C1F] text-xs">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2B2C31]">
        <Bug size={12} className="text-[#d4a843]" />
        <span className="text-[#EEEEEE] font-medium">Debug</span>
        <span className="text-[#777]">{filtered.length} eventos</span>
        <button
          onClick={clear}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[#999] hover:text-white hover:bg-[#2B2C31] transition-colors"
          title="Limpiar debug"
        >
          <Trash2 size={11} />
          Limpiar
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
        {socketEvents.length > 0 && (
          <div className="rounded border border-[#2B2C31] bg-[#202227] px-3 py-2">
            <div className="text-[#C4C4C4] font-medium mb-1">Socket</div>
            <div className="space-y-1">
              {socketEvents.map((event, idx) => {
                const isUnity = event.phase === 'unity_bridge'
                const isOk = event.state === 'connected'
                const isFail = event.state === 'connect_failed' || event.state === 'lost' || event.state === 'error'
                return (
                  <div key={`${event.timestamp_ms}-${idx}`} className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#666] min-w-[34px]">{isUnity ? 'Unity' : 'WS'}</span>
                    <span className={isOk ? 'text-green-400' : isFail ? 'text-red-400' : 'text-yellow-400'}>
                      {event.state}{event.attempt ? ` #${event.attempt}` : ''}
                    </span>
                    {event.error && (
                      <span className="text-red-300 truncate max-w-[180px]" title={event.error}>
                        {event.error}
                      </span>
                    )}
                    <span className="text-[#666] ml-auto">{new Date(event.timestamp_ms).toLocaleTimeString()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {groups.map(group => {
          const isOpen = expanded[group.id] ?? false
          const statusColor =
            group.status === 'failed' ? 'text-red-400' :
            group.status === 'interrupted' ? 'text-yellow-400' :
            group.status === 'done' ? 'text-green-400' :
            'text-[#3d85c8]'

          return (
            <div key={group.id} className="rounded border border-[#2B2C31] bg-[#202227] overflow-hidden">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#252830] transition-colors"
                onClick={() => setExpanded(s => ({ ...s, [group.id]: !isOpen }))}
              >
                {isOpen ? <ChevronDown size={11} className="text-[#888]" /> : <ChevronRight size={11} className="text-[#888]" />}
                <span className="text-[#EEEEEE] font-medium">Turno {group.turn ?? '?'}</span>
                <span className={`uppercase text-[10px] ${statusColor}`}>{group.status}</span>
                {group.durationMs !== undefined && (
                  <span className="text-[#777] text-[10px]">{group.durationMs}ms</span>
                )}
                {group.toolCount ? (
                  <span className="text-[#888] text-[10px]">{group.toolCount} cmd</span>
                ) : null}
                <span className="ml-auto text-[#666] text-[10px]">{group.model ?? ''}</span>
              </button>

              <div className="px-3 pb-2 text-[11px] text-[#999]">
                <div className="truncate">{group.id}</div>
                {group.reason && <div>Motivo: {group.reason}</div>}
                {group.toolNames.length > 0 && <div>Lote: {group.toolNames.join(', ')}</div>}
                {group.error && (
                  <div className="text-red-400 break-words">
                    {group.errorKind ? `${group.errorKind}: ` : ''}{group.error}
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="border-t border-[#2B2C31] px-3 py-2 space-y-1 bg-[#181A1F]">
                  {group.events.map((event, idx) => (
                    <div key={`${event.phase}-${event.timestamp_ms}-${idx}`} className="text-[11px] text-[#C4C4C4] flex gap-2">
                      <span className="text-[#666] min-w-[72px]">
                        {new Date(event.timestamp_ms).toLocaleTimeString()}
                      </span>
                      <span className="text-[#3d85c8] min-w-[112px]">{event.phase}</span>
                      <span className="break-words text-[#AAA]">
                        {event.command_name ? `${event.command_name} ` : ''}
                        {event.tool_count ? `tools=${event.tool_count} ` : ''}
                        {event.duration_ms !== undefined ? `dur=${event.duration_ms}ms ` : ''}
                        {event.reason ? `reason=${event.reason} ` : ''}
                        {event.error_kind ? `kind=${event.error_kind} ` : ''}
                        {event.result_preview ? `result=${event.result_preview}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {groups.length === 0 && socketEvents.length === 0 && (
          <div className="text-[#777] px-1 py-3">Sin eventos de debug.</div>
        )}
      </div>
    </div>
  )
}
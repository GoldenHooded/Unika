import React from 'react'
import { useChatStore, ChatMessage } from '../../stores/chatStore'
import { Zap, Brain, Clock, ChevronRight } from 'lucide-react'

function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatTokens(usage?: { prompt: number; completion: number; total: number }): string | null {
  if (!usage) return null
  return `${usage.prompt.toLocaleString()}↑ ${usage.completion.toLocaleString()}↓`
}

const TOOL_COLORS: Record<string, string> = {
  FILE_WRITE:    '#5a9a5a',
  FILE_EDIT:     '#5a9a5a',
  FILE_READ:     '#6888aa',
  UNITY_COMPILE: '#c08844',
  CALL_CODER:    '#8844cc',
  CALL_REVIEWER: '#cc4488',
  CALL_PLANNER:  '#44aacc',
  CALL_REASONER: '#aa44cc',
  SEARCH:        '#44aaaa',
  ASK:           '#ccaa44',
}

function toolColor(name: string): string {
  return TOOL_COLORS[name] ?? '#666'
}

function AssistantRow({ msg }: { msg: ChatMessage }) {
  const tools = msg.commands ?? []
  const uniqueTools = [...new Set(tools.map((c) => c.name))]
  const isR1 = msg.content?.includes('[R1]') // heuristic fallback
  const tokens = formatTokens(msg.tokenUsage)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '6px 10px',
        borderBottom: '1px solid #141414',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: '#1a1f2e',
            border: '1px solid #2d3a52',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isR1
            ? <Brain size={8} color="#c084fc" />
            : <Zap size={8} color="#3d85c8" />}
        </div>

        <span style={{ fontSize: 9, color: '#666', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={7} color="#444" />
          {formatTime(msg.ts)}
        </span>

        {tokens && (
          <span style={{ marginLeft: 'auto', fontSize: 8, color: '#444', fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace" }}>
            {tokens}
          </span>
        )}
      </div>

      {/* Preview of message content */}
      {msg.content && (
        <p
          style={{
            margin: 0,
            fontSize: 9,
            color: '#666',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: 20,
          }}
        >
          {msg.content.replace(/```[\s\S]*?```/g, '[code]').slice(0, 120)}
        </p>
      )}

      {/* Tool chips */}
      {uniqueTools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, paddingLeft: 20 }}>
          {uniqueTools.map((name) => (
            <span
              key={name}
              style={{
                fontSize: 8,
                padding: '1px 5px',
                borderRadius: 3,
                background: `${toolColor(name)}22`,
                color: toolColor(name),
                border: `1px solid ${toolColor(name)}44`,
                fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
                letterSpacing: '0.03em',
              }}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function TimelinePanel() {
  const messages = useChatStore((s) => s.messages)
  const assistantMsgs = messages.filter(
    (m) => m.role === 'assistant' && (m.content || (m.commands && m.commands.length > 0))
  )

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0D0D0D',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderBottom: '1px solid #1A1A1A',
          background: '#0A0B0D',
        }}
      >
        <Clock size={10} color="#3d85c8" />
        <span style={{ fontSize: 9, fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", color: '#3d85c8', letterSpacing: '0.12em' }}>
          › timeline
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 8, color: '#444' }}>
          {assistantMsgs.length} turnos
        </span>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {assistantMsgs.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#444', fontSize: 9 }}>
            Sin actividad todavía
          </div>
        ) : (
          assistantMsgs.map((msg) => (
            <AssistantRow key={msg.id} msg={msg} />
          ))
        )}
      </div>
    </div>
  )
}

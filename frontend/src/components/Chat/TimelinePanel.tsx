import React from 'react'
import { useChatStore, ChatMessage } from '../../stores/chatStore'
import { Zap, Brain, Clock } from 'lucide-react'

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
  const isR1 = msg.content?.includes('[R1]')
  const tokens = formatTokens(msg.tokenUsage)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: '#1a1f2e',
            border: '1px solid #2d3a52',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isR1
            ? <Brain size={11} color="#c084fc" />
            : <Zap size={11} color="#3d85c8" />}
        </div>

        <span style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} color="#555" />
          {formatTime(msg.ts)}
        </span>

        {tokens && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555', fontFamily: 'var(--font-mono)' }}>
            {tokens}
          </span>
        )}
      </div>

      {/* Preview of message content */}
      {msg.content && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: '#aaa',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: 28,
            lineHeight: '1.4',
          }}
        >
          {msg.content.replace(/```[\s\S]*?```/g, '[code]').slice(0, 120)}
        </p>
      )}

      {/* Tool chips */}
      {uniqueTools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 28 }}>
          {uniqueTools.map((name) => (
            <span
              key={name}
              style={{
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 4,
                background: `${toolColor(name)}22`,
                color: toolColor(name),
                border: `1px solid ${toolColor(name)}44`,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
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
          gap: 8,
          padding: '7px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: '#0A0B0D',
        }}
      >
        <Clock size={13} color="#3d85c8" />
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#3d85c8', letterSpacing: '0.08em' }}>
          › timeline
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555' }}>
          {assistantMsgs.length} turnos
        </span>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {assistantMsgs.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#555', fontSize: 12 }}>
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

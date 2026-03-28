import React, { useEffect, useRef } from 'react'
import { useChatStore, ChatMessage } from '../../stores/chatStore'
import { renderMarkdown, extractGuiElements } from '../../lib/markdown'

// Inject a blur-in span for the latest chunk INSIDE the last HTML block element,
// so it appears inline at the correct text position (not on a new line).
function appendBlurSpan(html: string, chunk: string, key: number): string {
  if (!chunk) return html
  const escaped = chunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const span = `<span class="chunk-blur-in" data-k="${key}">${escaped}</span>`
  // Insert before the last closing block tag so the span is inline within the paragraph
  const lastClose = html.lastIndexOf('</')
  if (lastClose !== -1) return html.slice(0, lastClose) + span + html.slice(lastClose)
  return html + span
}
import { GuiElementRenderer } from './GuiElement'
import { MermaidBlock } from './MermaidBlock'
import { CommandBlock } from './CommandBlock'
import { AskPanel } from './AskPanel'
import { ErrorBoundary } from '../ErrorBoundary'
import { User, Clock, Pencil, X } from 'lucide-react'

function useBlurChunks(
  chunkKey: number | undefined,
  lastChunk: string | undefined,
  streaming: boolean | undefined,
): { id: number; text: string }[] {
  const [chunks, setChunks] = React.useState<{ id: number; text: string }[]>([])
  const prevKeyRef = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    if (!streaming || !lastChunk || chunkKey === undefined) return
    if (chunkKey === prevKeyRef.current) return
    prevKeyRef.current = chunkKey

    setChunks(prev => {
      const next = [...prev, { id: chunkKey, text: lastChunk }]
      return next.length > 5 ? next.slice(next.length - 5) : next
    })

    const id = chunkKey
    const t = setTimeout(() => {
      setChunks(prev => prev.filter(c => c.id !== id))
    }, 750)

    return () => clearTimeout(t)
  }, [chunkKey, lastChunk, streaming])

  React.useEffect(() => {
    if (streaming) return
    const t = setTimeout(() => {
      setChunks([])
      prevKeyRef.current = undefined
    }, 800)
    return () => clearTimeout(t)
  }, [streaming])

  return chunks
}

export function MessageList({ onSend }: { onSend: (data: object) => void }) {
  const messages   = useChatStore(s => s.messages)
  const askPending = useChatStore(s => s.askPending)
  const bottomRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-thin">
      {messages.map((msg) => (
        <ErrorBoundary key={msg.id}>
          <MessageRow msg={msg} onSend={onSend} />
        </ErrorBoundary>
      ))}

      {askPending && (
        <AskPanel pending={askPending} onSend={onSend} />
      )}

      <div ref={bottomRef} />
    </div>
  )
}

const MessageRow = React.memo(function MessageRow({
  msg,
  onSend,
}: {
  msg: ChatMessage
  onSend: (data: object) => void
}) {
  const isUser = msg.role === 'user'
  // Don't render empty assistant messages that finished without content or commands
  if (!isUser && !msg.content && !msg.streaming && (!msg.commands || msg.commands.length === 0)) {
    return null
  }
  const parts  = extractGuiElements(msg.content)
  const blurChunks = useBlurChunks(msg.chunkKey, msg.lastChunk, msg.streaming)
  const [popover, setPopover] = React.useState<{ x: number; y: number; type: string; name: string } | null>(null)
  const editMessageAndTruncate = useChatStore((s) => s.editMessageAndTruncate)

  React.useEffect(() => {
    if (!popover) return
    const close = () => setPopover(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [popover])

  const handleProseClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('code-copy-btn')) {
      const code = target.dataset.code || ''
      navigator.clipboard.writeText(code)
      target.textContent = '✓'
      setTimeout(() => { target.textContent = '⎘' }, 1500)
      e.stopPropagation()
      return
    }
    if (target.classList.contains('unity-ref')) {
      const rect = target.getBoundingClientRect()
      setPopover({ x: rect.left, y: rect.bottom + 4, type: target.dataset.type || '', name: target.textContent || '' })
      e.stopPropagation()
    }
  }

  return (
    <>
      {/* Message bubble */}
      <div className={`flex gap-3 group msg-appear relative ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="w-7 h-7 rounded flex-shrink-0 bg-[#1a1f2e] border border-[#2d3a52] flex items-center justify-center mt-1 overflow-hidden">
            <img
              src="/unika-logo.png"
              alt="Unika"
              width={20}
              height={20}
              style={{ imageRendering: 'auto', objectFit: 'contain' }}
              onError={e => {
                // Fallback: hide img and show the animated SVG via ref swap
                const el = e.currentTarget
                el.style.display = 'none'
                const parent = el.parentElement
                if (parent) parent.setAttribute('data-fallback', '1')
              }}
            />
          </div>
        )}

        <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`} onClick={handleProseClick}>
          {isUser ? (
            <div
              className="text-gray-100 rounded-lg px-3 py-2 text-sm font-sans relative group/bubble"
              style={{
                background: '#3A3A3A',
                opacity: msg.queued ? 0.7 : 1,
                border: msg.queued ? '1px solid #3A3A3A' : 'none',
              }}
            >
              {msg.content}
              {msg.queued ? (
                <span
                  className="ml-2 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: '#3A3A3A', color: '#888', verticalAlign: 'middle' }}
                >
                  <Clock size={8} />
                  En cola
                  {/* Cancel queued button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSend({ type: 'cancel_queued', text: msg.content })
                    }}
                    style={{
                      marginLeft: 3,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 1,
                      color: '#888',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    title="Cancelar mensaje en cola"
                  >
                    <X size={8} />
                  </button>
                </span>
              ) : (
                /* Edit button — appears on hover */
                <button
                  className="absolute top-1 right-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity"
                  onClick={() => {
                    // Get all messages before this one (to keep as context)
                    const allMsgs = useChatStore.getState().messages
                    const idx = allMsgs.findIndex((m) => m.id === msg.id)
                    const keep = allMsgs.slice(0, idx).map((m) => ({ role: m.role, content: m.content }))
                    // Truncate history and fill input
                    editMessageAndTruncate(msg.id, msg.content)
                    onSend({ type: 'truncate_history', messages: keep })
                    // Dispatch custom event to fill the input textarea
                    window.dispatchEvent(new CustomEvent('edit_message', { detail: { content: msg.content } }))
                  }}
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: 'none',
                    borderRadius: 3,
                    padding: '2px 4px',
                    cursor: 'pointer',
                    color: '#aaa',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Editar mensaje"
                >
                  <Pencil size={9} />
                </button>
              )}
            </div>
          ) : (
            <div className="text-gray-100 text-sm font-sans">
              {parts.map((part, i) => {
                if (part.type === 'mermaid') return <MermaidBlock key={i} code={part.content} />
                if (part.type === 'gui' && part.gui) return <GuiElementRenderer key={i} element={part.gui} />

                const isLastPart = i === parts.length - 1
                const isStreaming = !!msg.streaming && isLastPart

                const blurText = isStreaming ? blurChunks.map(c => c.text).join('') : ''
                const MARKDOWN_SPECIAL = /[*_#`\[\]!~>]/
                const canCut = blurText.length > 0 && !MARKDOWN_SPECIAL.test(blurText) && part.content.endsWith(blurText)
                const stableContent = canCut ? part.content.slice(0, -blurText.length) : part.content

                return (
                  <React.Fragment key={i}>
                    <div
                      className="prose prose-invert prose-sm max-w-none"
                      data-streaming={msg.streaming ? 'true' : undefined}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(stableContent) }}
                    />
                    {blurChunks.length > 0 && blurChunks.map(chunk => (
                      <span key={chunk.id} className="chunk-blur-in">{chunk.text}</span>
                    ))}
                  </React.Fragment>
                )
              })}
            </div>
          )}
        </div>

        {isUser && (
          <div className="w-7 h-7 rounded-full flex-shrink-0 bg-[#3A3A3A] flex items-center justify-center mt-1">
            <User size={14} className="text-gray-300" />
          </div>
        )}
        {/* Token usage badge on assistant messages */}
        {!isUser && msg.tokenUsage && (
          <div
            style={{
              position: 'absolute',
              bottom: -12,
              left: 40,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 8,
                color: '#3a3a3a',
                fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
                userSelect: 'none',
              }}
              title={`Tokens: ${msg.tokenUsage.prompt.toLocaleString()} prompt + ${msg.tokenUsage.completion.toLocaleString()} completion`}
            >
              {msg.tokenUsage.prompt.toLocaleString()}↑ {msg.tokenUsage.completion.toLocaleString()}↓
            </span>
          </div>
        )}

        {/* Unity ref badge popover */}
        {popover && (
          <div
            className="fixed z-50 rounded border border-[#3A3A3A] shadow-xl text-xs"
            style={{ left: popover.x, top: popover.y, background: '#1e1f22', minWidth: 160 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[#3A3A3A] flex items-center gap-2">
              <span className="text-[#888] capitalize">{popover.type}</span>
              <span className="text-white font-medium truncate max-w-[120px]">{popover.name}</span>
            </div>
            <div className="p-1 space-y-0.5">
              <button
                className="w-full text-left px-2 py-1.5 rounded text-[#C4C4C4] hover:bg-[#3A3A3A] hover:text-white transition-colors"
                onClick={() => { navigator.clipboard.writeText(popover.name); setPopover(null) }}
              >
                Copiar nombre
              </button>
              <button
                className="w-full text-left px-2 py-1.5 rounded text-[#C4C4C4] hover:bg-[#3A3A3A] hover:text-white transition-colors"
                onClick={() => { navigator.clipboard.writeText(`[[${popover.type}:${popover.name}]]`); setPopover(null) }}
              >
                Copiar referencia
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inline commands — rendered below the assistant message, aligned with message text */}
      {!isUser && msg.commands && msg.commands.length > 0 && (
        <div style={{ paddingLeft: 40, marginTop: 2 }}>
          {msg.commands.map((cmd) => (
            <CommandBlock key={cmd.id} cmd={cmd} />
          ))}
        </div>
      )}
    </>
  )
})

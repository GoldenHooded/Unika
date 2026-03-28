import React, { useState } from 'react'
import { useChatStore } from '../../stores/chatStore'

interface Question {
  question: string
  options?: Array<{ label: string; description?: string; commands?: any[] }>
  multi_select?: boolean
  allow_custom?: boolean
}

interface AskPending {
  id: string
  questions: Question[]
}

export function AskPanel({ pending, onSend }: { pending: AskPending; onSend: (data: object) => void }) {
  const [answers, setAnswers] = useState<string[]>(pending.questions.map(() => ''))
  const setAskPending = useChatStore(s => s.setAskPending)

  const submit = () => {
    onSend({ type: 'ask_response', id: pending.id, answers })
    setAskPending(null)
  }

  return (
    <div className="border border-[#3d85c8]/40 rounded-lg bg-[#1e1f22] p-4 my-2 space-y-4">
      <div className="text-xs text-[#3d85c8] font-semibold uppercase tracking-wide">
        Unika te pregunta
      </div>
      {pending.questions.map((q, qi) => (
        <div key={qi} className="space-y-2">
          <p className="text-sm text-gray-200">{q.question}</p>
          {q.options && q.options.length > 0 ? (
            <div className="space-y-1">
              {q.options.map((opt, oi) => {
                const label = typeof opt === 'string' ? opt : opt.label
                const desc = typeof opt === 'object' ? opt.description : ''
                const hasCommands = typeof opt === 'object' && Array.isArray(opt.commands) && opt.commands.length > 0
                const selected = answers[qi] === label
                return (
                  <div
                    key={oi}
                    className={`px-3 py-2 rounded cursor-pointer border text-xs transition-colors ${
                      selected
                        ? 'border-[#3d85c8] bg-[#3d85c8]/15 text-white'
                        : 'border-[#3A3A3A] text-gray-400 hover:border-[#3d85c8]/50 hover:text-gray-200'
                    }`}
                    onClick={() => {
                      const a = [...answers]
                      a[qi] = label
                      setAnswers(a)
                    }}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      {label}
                      {hasCommands && (
                        <span
                          className="text-[9px] px-1 rounded"
                          style={{ background: 'rgba(61,133,200,0.2)', color: '#3d85c8' }}
                          title={`Ejecutará ${opt.commands?.length ?? 0} comando(s) al seleccionar`}
                        >
                          ⚡ auto
                        </span>
                      )}
                    </div>
                    {desc && <div className="text-gray-500 mt-0.5">{desc}</div>}
                  </div>
                )
              })}
            </div>
          ) : null}
          {(q.allow_custom || !q.options?.length) && (
            <input
              className="w-full bg-[#2A2A2A] text-white text-xs px-3 py-2 rounded border border-[#3A3A3A] focus:border-[#3d85c8] outline-none"
              placeholder="Tu respuesta..."
              value={answers[qi]}
              onChange={e => {
                const a = [...answers]
                a[qi] = e.target.value
                setAnswers(a)
              }}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          )}
        </div>
      ))}
      <button
        onClick={submit}
        className="px-4 py-1.5 bg-[#3d85c8] hover:bg-[#2d75b8] text-white text-xs rounded transition-colors"
      >
        Responder
      </button>
    </div>
  )
}

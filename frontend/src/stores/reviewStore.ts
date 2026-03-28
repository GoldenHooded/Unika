import { create } from 'zustand'
import { ChatMessage, CommandItem } from './chatStore'

interface ReviewStore {
  active: boolean
  messages: ChatMessage[]
  streaming: boolean
  status: 'running' | 'approved' | 'fixed' | 'error' | null
  summary: string
  currentMessageId: string | null
  subagentLabel: string | null

  setActive: (v: boolean) => void
  addMessage: (msg: ChatMessage) => void
  appendToken: (token: string) => void
  updateLastMessage: (updates: Partial<ChatMessage>) => void
  addCommandToMessage: (messageId: string, cmd: CommandItem) => void
  updateCommandInMessage: (messageId: string, commandId: string, updates: Partial<CommandItem>) => void
  setStreaming: (v: boolean) => void
  setCurrentMessageId: (id: string | null) => void
  setSubagentLabel: (label: string | null) => void
  thinkingText: string
  appendThinkingToken: (token: string) => void

  setDone: (status: 'approved' | 'fixed' | 'error', summary: string) => void
  reset: () => void
}

export const useReviewStore = create<ReviewStore>((set) => ({
  active: false,
  messages: [],
  streaming: false,
  status: null,
  summary: '',
  currentMessageId: null,
  subagentLabel: null,
  thinkingText: '',

  setActive: (v) => set({ active: v }),

  addMessage: (msg) =>
    set(s => ({ messages: [...s.messages, { ...msg, ts: msg.ts ?? Date.now() }] })),

  appendToken: (token) =>
    set(s => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.streaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + token }
      }
      return { messages: msgs }
    }),

  updateLastMessage: (updates) =>
    set(s => {
      if (!s.messages.length) return s
      const msgs = [...s.messages]
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...updates }
      return { messages: msgs }
    }),

  addCommandToMessage: (messageId, cmd) =>
    set(s => ({
      messages: s.messages.map(m =>
        m.id === messageId
          ? { ...m, commands: [...(m.commands ?? []), cmd] }
          : m
      )
    })),

  updateCommandInMessage: (messageId, commandId, updates) =>
    set(s => ({
      messages: s.messages.map(m =>
        m.id === messageId
          ? { ...m, commands: (m.commands ?? []).map(c => c.id === commandId ? { ...c, ...updates } : c) }
          : m
      )
    })),

  setStreaming: (v) => set({ streaming: v }),

  setCurrentMessageId: (id) => set({ currentMessageId: id }),

  setSubagentLabel: (label) => set({ subagentLabel: label }),

  appendThinkingToken: (token) => set(s => ({ thinkingText: s.thinkingText + token })),

  setDone: (status, summary) => set({ status, summary, streaming: false }),

  reset: () => set({
    messages: [],
    streaming: false,
    status: null,
    summary: '',
    currentMessageId: null,
    subagentLabel: null,
    thinkingText: '',
  }),
}))
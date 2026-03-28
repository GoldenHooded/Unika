import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
  queued?: boolean
  ts?: number
  commands?: CommandItem[]   // inline commands executed during this message turn
  lastChunk?: string         // most recently received token (for blur-in animation)
  chunkKey?: number          // increments per token to re-trigger the animation
  tokenUsage?: { prompt: number; completion: number; total: number }
}

export interface CommandItem {
  id: string
  name: string
  args: Record<string, any>
  result?: string
  status: 'building' | 'running' | 'done' | 'error'
  duration_ms?: number
  args_raw?: string   // partial JSON string while the LLM is still writing the call
}

export interface AskPending {
  id: string
  questions: any[]
}

interface ChatStore {
  messages: ChatMessage[]
  streaming: boolean
  askPending: AskPending | null
  agentStatus: string          // live one-liner shown while a command is running

  addMessage: (msg: ChatMessage) => void
  appendToken: (token: string) => void
  updateLastMessage: (updates: Partial<ChatMessage>) => void
  setStreaming: (v: boolean) => void
  setMessages: (msgs: any[]) => void
  clearMessages: () => void
  removeMessage: (id: string) => void
  editMessageAndTruncate: (id: string, newContent: string) => void
  setMessageUsage: (id: string, usage: { prompt: number; completion: number; total: number }) => void

  // Per-message command management (commands rendered inline in conversation)
  addCommandToMessage: (messageId: string, cmd: CommandItem) => void
  updateCommandInMessage: (messageId: string, cmdId: string, updates: Partial<CommandItem>) => void

  setAskPending: (ask: AskPending | null) => void
  setAgentStatus: (text: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  streaming: false,
  askPending: null,
  agentStatus: '',

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, ts: msg.ts ?? Date.now() }] })),

  appendToken: (token) =>
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.streaming) {
        msgs[msgs.length - 1] = {
          ...last,
          content: last.content + token,
          lastChunk: token,
          chunkKey: (last.chunkKey ?? 0) + 1,
        }
      }
      return { messages: msgs }
    }),

  updateLastMessage: (updates) =>
    set((s) => {
      if (!s.messages.length) return s
      const msgs = [...s.messages]
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...updates }
      return { messages: msgs }
    }),

  setStreaming: (v) => set({ streaming: v }),

  setMessages: (msgs) =>
    set({
      messages: msgs.map((m: any, i: number) => ({
        id: m.id ?? String(i),
        role: m.role,
        content: m.content,
        ts: m.ts,
      })),
    }),

  clearMessages: () => set({ messages: [] }),

  removeMessage: (id) =>
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

  editMessageAndTruncate: (id, newContent) =>
    set((s) => {
      const idx = s.messages.findIndex((m) => m.id === id)
      if (idx === -1) return s
      const updated = { ...s.messages[idx], content: newContent }
      // Keep messages before the edited one, then the edited message only
      return { messages: [...s.messages.slice(0, idx), updated] }
    }),

  setMessageUsage: (id, usage) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, tokenUsage: usage } : m
      ),
    })),

  addCommandToMessage: (messageId, cmd) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, commands: [...(m.commands ?? []).slice(-50), cmd] }
          : m
      ),
    })),

  updateCommandInMessage: (messageId, cmdId, updates) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              commands: (m.commands ?? []).map((c) =>
                c.id === cmdId ? { ...c, ...updates } : c
              ),
            }
          : m
      ),
    })),

  setAskPending: (ask) => set({ askPending: ask }),
  setAgentStatus: (text) => set({ agentStatus: text }),
}))

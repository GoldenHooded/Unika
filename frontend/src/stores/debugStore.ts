import { create } from 'zustand'

const MAX_DEBUG_EVENTS = 400

export interface DebugEvent {
  timestamp_ms: number
  phase: string
  channel?: string
  message_id?: string
  turn?: number
  model?: string
  status?: string
  reason?: string
  error?: string
  error_kind?: string
  duration_ms?: number
  tool_count?: number
  tool_names?: string[]
  command_name?: string
  tool_call_id?: string
  state?: string
  result_preview?: string
  [key: string]: any
}

interface DebugStore {
  enabled: boolean
  events: DebugEvent[]
  toggleEnabled: () => void
  setEnabled: (v: boolean) => void
  addEvent: (event: DebugEvent) => void
  clear: () => void
}

export const useDebugStore = create<DebugStore>((set) => ({
  enabled: false,
  events: [],

  toggleEnabled: () => set(s => ({ enabled: !s.enabled })),

  setEnabled: (v) => set({ enabled: v }),

  addEvent: (event) =>
    set(s => ({
      events: [...s.events, event].slice(-MAX_DEBUG_EVENTS),
    })),

  clear: () => set({ events: [] }),
}))

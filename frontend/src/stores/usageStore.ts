import { create } from 'zustand'

// DeepSeek pricing (USD per million tokens, as of 2025)
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat':     { input: 0.27,  output: 1.10 },
  'deepseek-reasoner': { input: 0.55,  output: 2.19 },
}

function calcCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model] ?? PRICING['deepseek-chat']
  return (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output
}

export interface ChannelUsage {
  channel: string
  model: string
  promptTokens: number
  completionTokens: number
  cost: number          // USD
  calls: number
}

// Color per agent channel
export const CHANNEL_COLOR: Record<string, string> = {
  main:               '#3d85c8',
  subagent_coder:     '#8844cc',
  subagent_reviewer:  '#cc4488',
  subagent_planner:   '#44aacc',
  subagent_search:    '#44aaaa',
  subagent_reasoner:  '#aa44cc',
}

export function channelColor(channel: string): string {
  return CHANNEL_COLOR[channel] ?? '#666'
}

export function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    main:               'Principal',
    subagent_coder:     'Coder',
    subagent_reviewer:  'Reviewer',
    subagent_planner:   'Planner',
    subagent_search:    'Search',
    subagent_reasoner:  'Reasoner',
  }
  return map[channel] ?? channel
}

const STORAGE_KEY = 'unika_usage'

interface PersistedUsage {
  byChannel: Record<string, ChannelUsage>
  totalCost: number
}

function load(): PersistedUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { byChannel: {}, totalCost: 0 }
    const p = JSON.parse(raw) as Partial<PersistedUsage>
    return { byChannel: p.byChannel ?? {}, totalCost: p.totalCost ?? 0 }
  } catch {
    return { byChannel: {}, totalCost: 0 }
  }
}

function save(state: PersistedUsage) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

interface UsageState {
  byChannel: Record<string, ChannelUsage>
  totalCost: number
  addUsage: (channel: string, model: string, prompt: number, completion: number) => void
  reset: () => void
}

const _initial = load()

export const useUsageStore = create<UsageState>((set) => ({
  byChannel: _initial.byChannel,
  totalCost: _initial.totalCost,

  addUsage: (channel, model, prompt, completion) => {
    const cost = calcCost(model, prompt, completion)
    set(s => {
      const prev = s.byChannel[channel] ?? { channel, model, promptTokens: 0, completionTokens: 0, cost: 0, calls: 0 }
      const updated: ChannelUsage = {
        channel, model,
        promptTokens:     prev.promptTokens     + prompt,
        completionTokens: prev.completionTokens + completion,
        cost:             prev.cost             + cost,
        calls:            prev.calls            + 1,
      }
      const next = { byChannel: { ...s.byChannel, [channel]: updated }, totalCost: s.totalCost + cost }
      save(next)
      return next
    })
  },

  reset: () => {
    const empty: PersistedUsage = { byChannel: {}, totalCost: 0 }
    save(empty)
    set(empty)
  },
}))

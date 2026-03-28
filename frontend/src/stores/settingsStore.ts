import { create } from 'zustand'

export type SoundKey = 'ask' | 'done' | 'reviewOpen' | 'reviewClose' | 'exit'

export interface SoundConfig {
  enabled: boolean
  volume: number // 0–1
}

export interface ContextFlags {
  game_context: boolean
  tdd: boolean
  gdd: boolean
  memory: boolean
  logs: boolean
  board: boolean
}

export interface SettingsState {
  sounds: Record<SoundKey, SoundConfig>
  setSoundEnabled: (key: SoundKey, enabled: boolean) => void
  setSoundVolume:  (key: SoundKey, volume: number)  => void
  planningMode: boolean
  setPlanningMode: (v: boolean) => void
  contextFlags: ContextFlags
  setContextFlags: (flags: Partial<ContextFlags>) => void
}

const STORAGE_KEY = 'unika_settings'

const DEFAULT_CONTEXT_FLAGS: ContextFlags = {
  game_context: true,
  tdd: true,
  gdd: true,
  memory: true,
  logs: true,
  board: false,
}

const DEFAULTS: Record<SoundKey, SoundConfig> = {
  ask:         { enabled: true,  volume: 0.8 },
  done:        { enabled: true,  volume: 0.8 },
  reviewOpen:  { enabled: true,  volume: 0.7 },
  reviewClose: { enabled: true,  volume: 0.7 },
  exit:        { enabled: false, volume: 0.6 },
}

function loadSounds(): Record<SoundKey, SoundConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) : {}
    const sounds = { ...DEFAULTS }
    if (stored.sounds) {
      for (const key of Object.keys(DEFAULTS) as SoundKey[]) {
        if (stored.sounds[key]) sounds[key] = { ...DEFAULTS[key], ...stored.sounds[key] }
      }
    }
    return sounds
  } catch {
    return { ...DEFAULTS }
  }
}

function loadPlanningMode(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) : {}
    return stored.planningMode === true
  } catch {
    return false
  }
}

function loadContextFlags(): ContextFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) : {}
    return { ...DEFAULT_CONTEXT_FLAGS, ...(stored.contextFlags ?? {}) }
  } catch {
    return { ...DEFAULT_CONTEXT_FLAGS }
  }
}

function persist(sounds: Record<SoundKey, SoundConfig>, planningMode?: boolean, contextFlags?: ContextFlags) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) : {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...stored,
      sounds,
      planningMode: planningMode ?? stored.planningMode ?? false,
      contextFlags: contextFlags ?? stored.contextFlags ?? DEFAULT_CONTEXT_FLAGS,
    }))
  } catch {}
}

export const useSettingsStore = create<SettingsState>((set) => ({
  sounds: loadSounds(),
  planningMode: loadPlanningMode(),
  contextFlags: loadContextFlags(),

  setSoundEnabled: (key, enabled) =>
    set(s => {
      const sounds = { ...s.sounds, [key]: { ...s.sounds[key], enabled } }
      persist(sounds, s.planningMode, s.contextFlags)
      return { sounds }
    }),

  setSoundVolume: (key, volume) =>
    set(s => {
      const sounds = { ...s.sounds, [key]: { ...s.sounds[key], volume } }
      persist(sounds, s.planningMode, s.contextFlags)
      return { sounds }
    }),

  setPlanningMode: (v) =>
    set(s => {
      persist(s.sounds, v, s.contextFlags)
      return { planningMode: v }
    }),

  setContextFlags: (flags) =>
    set(s => {
      const contextFlags = { ...s.contextFlags, ...flags }
      persist(s.sounds, s.planningMode, contextFlags)
      return { contextFlags }
    }),
}))

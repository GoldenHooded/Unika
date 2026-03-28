import { create } from 'zustand'

interface UnityStore {
  connected: boolean
  activeScene: string
  activeModel: 'deepseek-chat' | 'deepseek-reasoner'
  assets: any[]
  consoleLogs: any[]
  indexing: boolean
  pluginInstalled: boolean

  setConnected: (v: boolean) => void
  setActiveScene: (name: string) => void
  setActiveModel: (m: 'deepseek-chat' | 'deepseek-reasoner') => void
  setAssets: (assets: any[]) => void
  setConsoleLogs: (logs: any[]) => void
  setIndexing: (v: boolean) => void
  setPluginInstalled: (v: boolean) => void
}

export const useUnityStore = create<UnityStore>((set) => ({
  connected: false,
  activeScene: '',
  activeModel: 'deepseek-chat',
  assets: [],
  consoleLogs: [],
  indexing: false,
  pluginInstalled: false,

  setConnected: (v) => set({ connected: v }),
  setActiveScene: (name) => set({ activeScene: name }),
  setActiveModel: (m) => set({ activeModel: m }),
  setAssets: (assets) => set({ assets }),
  setConsoleLogs: (logs) => set({ consoleLogs: logs }),
  setIndexing: (v) => set({ indexing: v }),
  setPluginInstalled: (v) => set({ pluginInstalled: v }),
}))

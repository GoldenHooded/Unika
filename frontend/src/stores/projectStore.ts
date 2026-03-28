import { create } from 'zustand'

export interface Conversation {
  id: string
  name: string
}

export interface Project {
  id: string
  name: string
  unity_path: string
  description?: string
  conversations: Conversation[]
  active_conversation?: string
  active_model?: string
}

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  activeConversationId: string

  setProjects: (projects: Project[]) => void
  setActiveProject: (id: string | null) => void
  setActiveConversation: (id: string) => void
  addProject: (p: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  getActive: () => Project | null
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeConversationId: 'general',

  setProjects: (projects) => set({ projects }),

  setActiveProject: (id) =>
    set({ activeProjectId: id, activeConversationId: 'general' }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addProject: (p) =>
    set((s) => ({ projects: [...s.projects, p], activeProjectId: p.id })),

  updateProject: (id, updates) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  getActive: () => {
    const { projects, activeProjectId } = get()
    return projects.find((p) => p.id === activeProjectId) ?? null
  },
}))

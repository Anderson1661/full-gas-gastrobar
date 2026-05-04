import { create } from 'zustand'

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

interface AppState {
  notifications: Notification[]
  cashSessionId: number | null
  notify: (type: Notification['type'], message: string) => void
  dismissNotification: (id: string) => void
  setCashSession: (id: number | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  notifications: [],
  cashSessionId: null,

  notify: (type, message) => {
    const id = `notif_${Date.now()}`
    set((state) => ({
      notifications: [...state.notifications, { id, type, message }]
    }))
    // Auto-dismiss después de 4 segundos
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id)
      }))
    }, 4000)
  },

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    })),

  setCashSession: (id) => set({ cashSessionId: id }),
}))

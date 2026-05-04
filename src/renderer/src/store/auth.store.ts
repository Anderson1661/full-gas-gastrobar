import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  id: number
  username: string
  fullName: string
  roleName: string
  permissions: string[]
}

interface AuthState {
  user:            AuthUser | null
  sessionToken:    string | null
  isAuthenticated: boolean
  login:           (user: AuthUser, sessionToken: string) => void
  logout:          () => void
  hasPermission:   (permission: string) => boolean
  isAdmin:         () => boolean
  isMesero:        () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      sessionToken:    null,
      isAuthenticated: false,

      login: (user, sessionToken) => set({ user, sessionToken, isAuthenticated: true }),

      logout: () => set({ user: null, sessionToken: null, isAuthenticated: false }),

      hasPermission: (permission) => {
        const { user } = get()
        if (!user) return false
        if (user.roleName === 'admin') return true
        return user.permissions.includes(permission)
      },

      isAdmin:  () => get().user?.roleName === 'admin',
      isMesero: () => get().user?.roleName === 'mesero',
    }),
    {
      name: 'fullgas-auth',
      partialize: (state) => ({
        user:            state.user,
        sessionToken:    state.sessionToken,
        isAuthenticated: state.isAuthenticated,
      })
    }
  )
)

import React, { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { cn } from '../../lib/utils'
import ForgotPasswordModal from './ForgotPasswordModal'
import AppLogo from '../../components/ui/AppLogo'

export default function LoginPage(): JSX.Element {
  const login = useAuthStore((s) => s.login)

  const [username,    setUsername]    = useState('')
  const [password,    setPassword]    = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [showRecover, setShowRecover] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!username || !password) return

    setLoading(true)
    setError(null)

    const result = await authApi.login({ username, password }) as {
      success: boolean
      data?: {
        user: { id: number; username: string; fullName: string; roleName: string; permissions: string[] }
        sessionToken: string
      }
      error?: string
    }

    setLoading(false)

    if (result.success && result.data) {
      login(result.data.user, result.data.sessionToken)
    } else {
      setError(result.error ?? 'Error de autenticación')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <AppLogo className="mb-8" />

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ingresa tu usuario"
                autoFocus
                className={cn(
                  'w-full px-4 py-3 rounded-lg border bg-secondary text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-base'
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className={cn(
                    'w-full px-4 py-3 pr-12 rounded-lg border bg-secondary text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-base'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className={cn(
                'w-full py-3 rounded-lg font-semibold text-base transition-all',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
              )}
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowRecover(true)}
              className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Sistema POS v1.0
        </p>
      </div>

      {showRecover && <ForgotPasswordModal onClose={() => setShowRecover(false)} />}
    </div>
  )
}

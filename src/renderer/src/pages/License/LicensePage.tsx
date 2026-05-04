import React, { useState } from 'react'
import { Key, Loader2, CheckCircle, AlertTriangle, ShieldAlert } from 'lucide-react'
import { licenseApi } from '../../lib/api'
import { cn } from '../../lib/utils'
import AppLogo from '../../components/ui/AppLogo'

interface Props {
  expired?:     boolean
  expiredAt?:   string | null
  expiredPlan?: string | null
  onActivated?: () => void
}

export default function LicensePage({
  expired     = false,
  expiredAt   = null,
  expiredPlan = null,
  onActivated,
}: Props): JSX.Element {
  const [token,    setToken]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState(false)
  const [planInfo, setPlanInfo] = useState<{
    planLabel: string; company: string; expiresAt: string; daysRemaining: number
  } | null>(null)

  const expiredDate = expiredAt
    ? new Date(expiredAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  async function handleActivate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    setError(null)

    const res = await licenseApi.activate(token.trim()) as {
      success: boolean
      error?: string
      planLabel?: string
      company?: string
      expiresAt?: string
      daysRemaining?: number
    }

    setLoading(false)

    if (!res.success) {
      setError(res.error ?? 'Error al activar la licencia')
      return
    }

    setPlanInfo({
      planLabel:     res.planLabel!,
      company:       res.company!,
      expiresAt:     new Date(res.expiresAt!).toLocaleDateString('es-CO', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      daysRemaining: res.daysRemaining!,
    })
    setSuccess(true)

    // Reinicia la app para continuar con el flujo normal
    setTimeout(() => {
      window.api.invoke('app:relaunch').catch(() => onActivated?.())
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <AppLogo className="mb-8" />

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">

          {/* Icono del estado */}
          <div className="flex justify-center mb-4">
            {expired
              ? <ShieldAlert size={40} className="text-destructive" />
              : <Key size={40} className="text-primary" />
            }
          </div>

          {/* Título */}
          <h2 className="text-xl font-semibold text-foreground text-center mb-2">
            {expired ? 'Licencia vencida' : 'Activar licencia'}
          </h2>

          {/* Mensaje de vencimiento */}
          {expired && expiredDate && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 mb-5 text-sm text-destructive text-center">
              Tu licencia{expiredPlan ? ` ${expiredPlan}` : ''} venció el <strong>{expiredDate}</strong>.
              <br />Ingresa tu nueva clave para continuar.
            </div>
          )}

          {!expired && (
            <p className="text-muted-foreground text-sm text-center mb-6">
              Ingresa la clave de licencia para activar el sistema.
            </p>
          )}

          {/* Formulario */}
          {!success ? (
            <form onSubmit={handleActivate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Clave de licencia
                </label>
                <textarea
                  value={token}
                  onChange={(e) => { setToken(e.target.value); setError(null) }}
                  placeholder="Pega aquí tu clave de licencia..."
                  rows={4}
                  className={cn(
                    'w-full px-4 py-3 rounded-lg border bg-secondary text-foreground',
                    'placeholder:text-muted-foreground text-xs font-mono resize-none',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'
                  )}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !token.trim()}
                className={cn(
                  'w-full py-3 rounded-lg font-semibold text-base transition-all',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'flex items-center justify-center gap-2'
                )}
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                {loading ? 'Verificando...' : (expired ? 'Renovar licencia' : 'Activar licencia')}
              </button>
            </form>
          ) : (
            /* Estado de éxito */
            <div className="text-center space-y-4">
              <CheckCircle size={48} className="text-green-400 mx-auto" />
              <div>
                <p className="font-semibold text-foreground">¡Licencia activada!</p>
                {planInfo && (
                  <div className="mt-3 bg-muted/50 rounded-lg p-3 text-left text-xs text-muted-foreground space-y-1">
                    <p>Plan: <span className="text-foreground font-medium">{planInfo.planLabel}</span></p>
                    <p>Empresa: <span className="text-foreground">{planInfo.company}</span></p>
                    <p>Vence: <span className="text-foreground">{planInfo.expiresAt}</span></p>
                    <p>Días restantes: <span className="text-foreground">{planInfo.daysRemaining}</span></p>
                  </div>
                )}
                <p className="text-muted-foreground text-sm mt-3">Reiniciando el sistema…</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Sistema POS v1.0 · Para soporte: sistetecnioficial1@gmail.com
        </p>
      </div>
    </div>
  )
}

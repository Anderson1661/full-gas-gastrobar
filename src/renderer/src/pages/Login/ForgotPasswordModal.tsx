import React, { useState } from 'react'
import { X, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { securityApi } from '../../lib/api'
import { cn } from '../../lib/utils'

type Step = 'username' | 'answers' | 'new-password' | 'done'

interface Question { questionId: number; question: string }

export default function ForgotPasswordModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [step,        setStep]        = useState<Step>('username')
  const [username,    setUsername]    = useState('')
  const [questions,   setQuestions]   = useState<Question[]>([])
  const [answers,     setAnswers]     = useState<Record<number, string>>({})
  const [newPassword, setNewPassword] = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function handleFetchQuestions(): Promise<void> {
    if (!username.trim()) return
    setLoading(true); setError(null)

    const result = await securityApi.getUserQuestions(username.trim()) as {
      success: boolean
      data?: Question[]
      error?: string
    }

    setLoading(false)

    if (!result.success) {
      setError(result.error ?? 'Error obteniendo preguntas')
      return
    }

    if (!result.data || result.data.length < 2) {
      setError('Este usuario no tiene preguntas de seguridad configuradas. Contacte al administrador.')
      return
    }

    setQuestions(result.data)
    setStep('answers')
  }

  async function handleVerifyAndSetPassword(): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    const answersPayload = questions.map((q) => ({
      questionId: q.questionId,
      answer:     answers[q.questionId] ?? ''
    }))

    setLoading(true); setError(null)

    const result = await securityApi.recoverPassword(username.trim(), answersPayload, newPassword) as {
      success: boolean
      error?: string
      code?: string
    }

    setLoading(false)

    if (!result.success) {
      if (result.code === 'WRONG_ANSWERS') {
        setError('Las respuestas no son correctas. Inténtelo de nuevo.')
      } else if (result.code === 'RATE_LIMIT') {
        setError('Demasiados intentos fallidos. Espere una hora e inténtelo nuevamente.')
      } else {
        setError(result.error ?? 'Error recuperando contraseña')
      }
      return
    }

    setStep('done')
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Recuperar contraseña</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Done */}
          {step === 'done' && (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 size={48} className="text-green-400 mx-auto" />
              <p className="font-medium text-foreground">Contraseña actualizada</p>
              <p className="text-sm text-muted-foreground">
                Tu contraseña fue cambiada exitosamente. Ya puedes iniciar sesión.
              </p>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium"
              >
                Ir al inicio de sesión
              </button>
            </div>
          )}

          {/* Step 1: username */}
          {step === 'username' && (
            <>
              <p className="text-sm text-muted-foreground">
                Ingresa tu nombre de usuario y responde tus preguntas de seguridad para restablecer tu contraseña.
              </p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nombre de usuario</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchQuestions()}
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {error && (
                <div className="px-3 py-2 rounded bg-destructive/15 border border-destructive/30 text-destructive text-xs">
                  {error}
                </div>
              )}

              <button
                onClick={handleFetchQuestions}
                disabled={loading || !username.trim()}
                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Continuar
              </button>
            </>
          )}

          {/* Step 2: security answers + new password */}
          {step === 'answers' && (
            <>
              <p className="text-sm text-muted-foreground">
                Responde las preguntas de seguridad y establece tu nueva contraseña.
              </p>

              {questions.map((q) => (
                <div key={q.questionId}>
                  <label className="text-xs text-muted-foreground mb-1 block">{q.question}</label>
                  <input
                    type="text"
                    value={answers[q.questionId] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.questionId]: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nueva contraseña (mín. 6 caracteres)</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 rounded bg-destructive/15 border border-destructive/30 text-destructive text-xs">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('username'); setError(null) }}
                  className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground"
                >
                  Atrás
                </button>
                <button
                  onClick={handleVerifyAndSetPassword}
                  disabled={loading || !newPassword}
                  className={cn(
                    'flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40',
                    'flex items-center justify-center gap-2'
                  )}
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Cambiar contraseña
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

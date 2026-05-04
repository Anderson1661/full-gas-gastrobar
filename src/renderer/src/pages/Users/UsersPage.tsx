import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi, securityApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import type { User } from '@shared/types/entities'
import { Plus, Pencil, ToggleLeft, ToggleRight, ShieldCheck, Key, Loader2, Eye, EyeOff } from 'lucide-react'
import RefreshButton from '../../components/shared/RefreshButton'
import { cn } from '../../lib/utils'
import { formatDateTime } from '../../lib/utils'

const ROLE_LABELS: Record<string, string> = { admin: 'Administrador', mesero: 'Mesero', developer: 'Desarrollador' }
const ROLE_COLORS: Record<string, string> = {
  admin:     'text-primary bg-primary/20',
  mesero:    'text-blue-400 bg-blue-500/20',
  developer: 'text-violet-400 bg-violet-500/20',
}

function isValidEmailFormat(value: string): boolean {
  const normalized = value.trim()
  return !normalized || /^[^\s@]+@[^\s@]+$/.test(normalized)
}

export default function UsersPage(): JSX.Element {
  const { user: currentUser, sessionToken } = useAuthStore()
  const { notify } = useAppStore()
  const qc = useQueryClient()

  const [showForm,        setShowForm]        = useState(false)
  const [editing,         setEditing]         = useState<User | null>(null)
  const [showSecQ,        setShowSecQ]        = useState<User | null>(null)
  const [showAdminEdit,   setShowAdminEdit]   = useState(false)

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn:  () => usersApi.list() as Promise<User[]>
  })

  async function toggleUser(u: User): Promise<void> {
    if (!currentUser || u.id === currentUser.id || !sessionToken) return
    const result = await usersApi.update(
      { id: u.id, isActive: !u.isActive }, sessionToken
    ) as { success: boolean; error?: string }
    if (result.success) {
      notify('success', `Usuario ${u.isActive ? 'desactivado' : 'activado'}`)
      qc.invalidateQueries({ queryKey: ['users'] })
    } else {
      notify('error', result.error ?? 'Error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
        <div className="flex gap-3">
          <RefreshButton queryKeys={[['users']]} />
          {currentUser?.roleName === 'admin' && (
            <button
              onClick={() => setShowAdminEdit(true)}
              className="flex items-center gap-2 px-4 py-2 border border-border text-sm text-muted-foreground rounded-lg hover:text-foreground"
            >
              <Key size={15} /> Mi cuenta
            </button>
          )}
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Nuevo usuario
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => (
          <div key={u.id} className={cn('bg-card border border-border rounded-xl p-4', !u.isActive && 'opacity-50')}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold">{u.fullName.charAt(0).toUpperCase()}</span>
              </div>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ROLE_COLORS[u.roleName] ?? '')}>
                {ROLE_LABELS[u.roleName] ?? u.roleName}
              </span>
            </div>
            <p className="font-semibold text-foreground">{u.fullName}</p>
            <p className="text-sm text-muted-foreground">@{u.username}</p>
            {u.email && <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>}
            {u.lastLoginAt && (
              <p className="text-xs text-muted-foreground mt-1">Último acceso: {formatDateTime(u.lastLoginAt)}</p>
            )}
            <div className="flex gap-2 mt-4 flex-wrap">
              <button
                onClick={() => { setEditing(u); setShowForm(true) }}
                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil size={12} /> Editar
              </button>
              <button
                onClick={() => setShowSecQ(u)}
                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                <ShieldCheck size={12} /> Preguntas
              </button>
              {u.id !== currentUser?.id && (
                <button
                  onClick={() => toggleUser(u)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
                >
                  {u.isActive ? <ToggleRight size={13} className="text-green-400" /> : <ToggleLeft size={13} />}
                  {u.isActive ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <UserForm
          user={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['users'] }) }}
        />
      )}

      {showSecQ && (
        <SecurityQuestionsModal
          user={showSecQ}
          onClose={() => setShowSecQ(null)}
        />
      )}

      {showAdminEdit && (
        <AdminSelfEditModal
          onClose={() => setShowAdminEdit(false)}
          onSaved={() => { setShowAdminEdit(false); qc.invalidateQueries({ queryKey: ['users'] }) }}
        />
      )}
    </div>
  )
}

// ── User create/edit form ─────────────────────────────────────────────────────

function UserForm({
  user, onClose, onSaved,
}: { user: User | null; onClose: () => void; onSaved: () => void }): JSX.Element {
  const { user: currentUser, sessionToken } = useAuthStore()
  const { notify } = useAppStore()

  const [form, setForm] = useState({
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    email:    user?.email    ?? '',
    roleId:   user?.roleId   ?? 2,
    password: '',
  })
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    if (!currentUser || !sessionToken) return
    if (form.email && !isValidEmailFormat(form.email)) {
      notify('error', 'El correo debe tener un formato valido y contener @')
      return
    }
    setSaving(true)
    const result = user
      ? await usersApi.update({ id: user.id, fullName: form.fullName, email: form.email, roleId: form.roleId }, sessionToken)
      : await usersApi.create(form, sessionToken)

    setSaving(false)
    const r = result as { success: boolean; error?: string }
    if (r.success) {
      notify('success', user ? 'Usuario actualizado' : 'Usuario creado')
      onSaved()
    } else {
      notify('error', r.error ?? 'Error guardando usuario')
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-foreground">{user ? 'Editar usuario' : 'Nuevo usuario'}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Usuario *</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={!!user} className={cn(inputCls, user && 'opacity-50')} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre completo *</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Rol *</label>
            <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: Number(e.target.value) })} className={inputCls}>
              <option value={1}>Administrador</option>
              <option value={2}>Mesero</option>
              <option value={3}>Desarrollador</option>
            </select>
          </div>
          {!user && (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Contraseña * (mín. 6 caracteres)</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground">Cancelar</button>
          <button onClick={save} disabled={saving || !form.username || !form.fullName}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Security Questions Modal ──────────────────────────────────────────────────

interface Question { id: number; question: string }

function SecurityQuestionsModal({ user, onClose }: { user: User; onClose: () => void }): JSX.Element {
  const { sessionToken } = useAuthStore()
  const { notify }       = useAppStore()

  const { data: allQuestions = [] } = useQuery<Question[]>({
    queryKey: ['security-questions'],
    queryFn:  () => securityApi.listQuestions().then((r) => (r as { data?: Question[] }).data ?? r as Question[]),
  })

  const [selected, setSelected] = useState<{ questionId: number; answer: string }[]>([
    { questionId: 0, answer: '' },
    { questionId: 0, answer: '' },
    { questionId: 0, answer: '' },
  ])
  const [saving, setSaving] = useState(false)

  function updateRow(i: number, field: 'questionId' | 'answer', value: string | number): void {
    setSelected((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  async function save(): Promise<void> {
    if (!sessionToken) return
    const valid = selected.filter((r) => r.questionId > 0 && r.answer.trim().length >= 2)
    if (valid.length < 2) {
      notify('error', 'Configura al menos 2 preguntas con respuestas de 2+ caracteres')
      return
    }
    const ids = valid.map((r) => r.questionId)
    if (new Set(ids).size !== ids.length) {
      notify('error', 'No puedes usar la misma pregunta dos veces')
      return
    }
    setSaving(true)
    const result = await securityApi.setupAnswers(user.id, valid, sessionToken) as { success: boolean; error?: string }
    setSaving(false)
    if (result.success) {
      notify('success', 'Preguntas de seguridad guardadas')
      onClose()
    } else {
      notify('error', result.error ?? 'Error guardando')
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Preguntas de seguridad — {user.fullName}</h3>
        <p className="text-xs text-muted-foreground">Configura al menos 2 preguntas para permitir recuperación de contraseña.</p>

        {selected.map((row, i) => (
          <div key={i} className="space-y-2">
            <label className="text-xs text-muted-foreground">Pregunta {i + 1}</label>
            <select
              className={inputCls}
              value={row.questionId}
              onChange={(e) => updateRow(i, 'questionId', Number(e.target.value))}
            >
              <option value={0}>-- Seleccionar pregunta --</option>
              {allQuestions.map((q) => (
                <option key={q.id} value={q.id}
                  disabled={selected.some((r, idx) => idx !== i && r.questionId === q.id)}>
                  {q.question}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Respuesta"
              className={inputCls}
              value={row.answer}
              onChange={(e) => updateRow(i, 'answer', e.target.value)}
            />
          </div>
        ))}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar preguntas
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Admin Self Edit Modal ─────────────────────────────────────────────────────

function AdminSelfEditModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }): JSX.Element {
  const { user: currentUser, sessionToken, logout } = useAuthStore()
  const { notify } = useAppStore()

  const [form, setForm] = useState({
    currentPassword: '',
    fullName:        currentUser?.fullName ?? '',
    username:        currentUser?.username ?? '',
    email:           '',
    newPassword:     '',
    confirmPassword: '',
  })
  const [showPwd,  setShowPwd]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function save(): Promise<void> {
    if (!currentUser || !sessionToken) return
    if (!form.currentPassword) { setError('Ingresa tu contraseña actual para confirmar los cambios'); return }
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError('Las contraseñas nuevas no coinciden'); return
    }

    setSaving(true); setError(null)

    if (form.email && !isValidEmailFormat(form.email)) {
      setError('El correo debe tener un formato valido y contener @'); return
    }

    const dto: Record<string, unknown> = {
      adminId:         currentUser.id,
      currentPassword: form.currentPassword,
    }
    if (form.fullName    !== currentUser.fullName) dto.fullName    = form.fullName
    if (form.username    !== currentUser.username) dto.username    = form.username
    if (form.email       )                          dto.email       = form.email
    if (form.newPassword )                          dto.newPassword = form.newPassword

    const result = await usersApi.updateSelf(dto, sessionToken) as { success: boolean; error?: string }
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Error'); return }

    notify('success', 'Datos actualizados. Por seguridad se cerró tu sesión.')
    logout()
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary'
  const labelCls = 'text-xs text-muted-foreground mb-1 block'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Editar mi cuenta</h3>
        <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 text-amber-400">
          Por seguridad, deberás iniciar sesión de nuevo tras guardar cambios.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Nombre completo</label>
            <input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Nombre de usuario</label>
            <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Email (dejar vacío para no cambiar)</label>
            <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <div className="col-span-2 border-t border-border pt-3">
            <label className={labelCls}>Nueva contraseña (dejar vacío para no cambiar)</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} className={cn(inputCls, 'pr-10')}
                value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {form.newPassword && (
            <div className="col-span-2">
              <label className={labelCls}>Confirmar nueva contraseña</label>
              <input type="password" className={inputCls} value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
            </div>
          )}

          <div className="col-span-2 border-t border-border pt-3">
            <label className={labelCls}>Contraseña actual * (requerida para confirmar)</label>
            <input type="password" className={inputCls} value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded bg-destructive/15 border border-destructive/30 text-destructive text-xs">{error}</div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground">Cancelar</button>
          <button onClick={save} disabled={saving || !form.currentPassword}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}

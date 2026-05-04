import React, { useEffect, useState } from 'react'
import { RefreshCw, Github, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react'
import { updaterApi, ipc } from '../../lib/api'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { useAppStore } from '../../store/app.store'
import { useUpdateStore } from '../../store/update.store'

interface UpdaterConfig {
  enabled: boolean
  owner:   string
  repo:    string
  token:   string
}

const EMPTY_CONFIG: UpdaterConfig = { enabled: false, owner: '', repo: '', token: '' }

function openGitHub(url: string): void {
  ipc(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url).catch(() => {})
}

export default function UpdaterPanel(): JSX.Element {
  const { notify }      = useAppStore()
  const updateStatus    = useUpdateStore((s) => s.status)
  const updateInfo      = useUpdateStore((s) => s.updateInfo)
  const updateProgress  = useUpdateStore((s) => s.progress)
  const updateError     = useUpdateStore((s) => s.error)
  const setUpdateStatus = useUpdateStore((s) => s.setStatus)

  const [config,    setConfig]    = useState<UpdaterConfig | null>(null)
  const [draft,     setDraft]     = useState<UpdaterConfig>(EMPTY_CONFIG)
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    updaterApi.getConfig().then((res) => {
      const c = res as UpdaterConfig
      setConfig(c)
      setDraft(c)
      setShowForm(c.enabled)
    }).catch(() => setConfig(EMPTY_CONFIG))

    updaterApi.getVersion().then(setAppVersion).catch(() => {})
  }, [])

  // Visual ON when saved-enabled OR when form is open (pending confirmation)
  const isToggledOn = (config?.enabled ?? false) || showForm

  function handleToggle(): void {
    if (!config) return
    if (!isToggledOn) {
      // User wants to enable → show form first
      setShowForm(true)
      setDraft({ ...draft, enabled: true })
    } else if (config.enabled) {
      // Saved as enabled → disable immediately
      void saveConfig({ ...config, enabled: false })
    } else {
      // Form open but not yet saved → cancel
      setShowForm(false)
      setDraft({ ...config })
    }
  }

  async function saveConfig(next: UpdaterConfig): Promise<void> {
    setSaving(true)
    try {
      const res = await updaterApi.saveConfig(next) as { success: boolean; error?: string }
      if (res.success) {
        setConfig(next)
        setDraft(next)
        setShowForm(next.enabled)
        notify('success', next.enabled ? 'Actualizaciones automáticas activadas' : 'Actualizaciones automáticas desactivadas')
      } else {
        notify('error', res.error ?? 'Error al guardar la configuración')
      }
    } catch {
      notify('error', 'Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveForm(): Promise<void> {
    if (!draft.owner.trim() || !draft.repo.trim()) {
      notify('error', 'Usuario y repositorio de GitHub son obligatorios')
      return
    }
    await saveConfig({ ...draft, enabled: true })
  }

  function handleCancel(): void {
    if (config) {
      setDraft(config)
      setShowForm(config.enabled)
    }
  }

  if (!config) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-center h-28">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  const isConfigured = config.enabled && config.owner && config.repo
  const formDirty    = draft.owner !== config.owner || draft.repo !== config.repo || draft.token !== config.token

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-2">
        <RefreshCw size={16} className="text-primary" />
        <h3 className="font-semibold text-foreground">Actualizaciones automáticas</h3>
      </div>

      {/* Version + toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Versión actual</p>
          <p className="text-xs text-muted-foreground">{appVersion || '—'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{isToggledOn ? 'Activado' : 'Desactivado'}</span>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
              isToggledOn ? 'bg-primary' : 'bg-secondary border border-border'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
              isToggledOn ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Disabled state description */}
      {!isToggledOn && (
        <div className="flex items-start gap-3 rounded-lg bg-secondary border border-border p-4">
          <AlertCircle size={16} className="text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-foreground">Actualizaciones desactivadas</p>
            <p className="text-xs text-muted-foreground">
              Activa el toggle para conectar con un repositorio de GitHub Releases y recibir actualizaciones automáticas.
            </p>
          </div>
        </div>
      )}

      {/* GitHub config form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border border-border bg-secondary/40 p-4">

          {/* Guide banner */}
          <div className="flex items-start gap-3 rounded-lg bg-blue-500/10 border border-blue-500/30 p-3">
            <Github size={15} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-xs text-blue-300 font-medium">Cómo configurar GitHub Releases</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Crea un repositorio público en GitHub (ej. <code className="bg-black/20 px-1 rounded">mi-usuario/mi-app-updates</code>)</li>
                <li>Para repos <strong className="text-foreground">privados</strong>, necesitas un token con permiso <code className="bg-black/20 px-1 rounded">repo</code></li>
                <li>Ingresa los datos abajo y guarda</li>
              </ol>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => openGitHub('https://github.com/new')}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  <ExternalLink size={11} />
                  Crear repositorio
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => openGitHub('https://github.com/settings/tokens/new?scopes=repo&description=FullGasUpdater')}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  <ExternalLink size={11} />
                  Generar token (repos privados)
                </button>
              </div>
            </div>
          </div>

          {/* Owner */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Usuario u organización de GitHub <span className="text-destructive">*</span>
            </label>
            <input
              value={draft.owner}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              placeholder="ej: mi-usuario"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Repo */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Nombre del repositorio <span className="text-destructive">*</span>
            </label>
            <input
              value={draft.repo}
              onChange={(e) => setDraft({ ...draft, repo: e.target.value })}
              placeholder="ej: mi-app-updates"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Token */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Token de acceso personal
              <span className="ml-1 text-muted-foreground font-normal">(solo para repos privados)</span>
            </label>
            <input
              type="password"
              value={draft.token}
              onChange={(e) => setDraft({ ...draft, token: e.target.value })}
              placeholder="ghp_••••••••••••••••••••"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleSaveForm()}
              disabled={saving || (!formDirty && config.enabled)}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar y activar'}
            </button>
            {!config.enabled && (
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active state: config summary + check button */}
      {isConfigured && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 size={13} className="text-green-400" />
            <span>
              Repositorio: <span className="text-foreground font-mono">{config.owner}/{config.repo}</span>
              {config.token && <span className="ml-2 text-green-400">(token configurado)</span>}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border">
            <div />
            <button
              onClick={() => { updaterApi.check().catch(() => {}); setUpdateStatus('checking') }}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground disabled:opacity-50 hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
              {updateStatus === 'checking' ? 'Verificando...' : 'Buscar actualizaciones'}
            </button>
          </div>

          {updateStatus === 'not-available' && (
            <p className="text-sm text-green-400">El sistema está actualizado.</p>
          )}

          {updateStatus === 'available' && updateInfo && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-blue-300">Nueva versión: {updateInfo.version}</p>
                {updateInfo.releaseNotes && (
                  <p className="text-xs text-muted-foreground mt-1">{updateInfo.releaseNotes}</p>
                )}
              </div>
              <button
                onClick={() => { updaterApi.download().catch(() => {}); setUpdateStatus('downloading') }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                Descargar actualización
              </button>
            </div>
          )}

          {updateStatus === 'downloading' && updateProgress && (
            <div className="space-y-2">
              <p className="text-sm text-foreground">Descargando… {updateProgress.percent}%</p>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${updateProgress.percent}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {(updateProgress.transferred / 1_048_576).toFixed(1)} MB / {(updateProgress.total / 1_048_576).toFixed(1)} MB
              </p>
            </div>
          )}

          {updateStatus === 'ready' && updateInfo && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 space-y-3">
              <p className="text-sm font-semibold text-green-300">
                Versión {updateInfo.version} descargada y lista para instalar.
              </p>
              <button
                onClick={() => updaterApi.install().catch(() => {})}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition-colors"
              >
                Instalar y reiniciar
              </button>
            </div>
          )}

          {updateStatus === 'error' && updateError && (
            <p className="text-sm text-destructive">{updateError}</p>
          )}
        </>
      )}
    </div>
  )
}

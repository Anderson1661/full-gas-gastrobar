import React, { useEffect, useState } from 'react'
import { DatabaseBackup, FolderOpen, Play, Clock } from 'lucide-react'
import { autoBackupApi } from '../../lib/api'
import { useAppStore } from '../../store/app.store'

interface AutoBackupConfig {
  enabled:       boolean
  intervalHours: number
  folderPath:    string
  maxKeepFiles:  number
  lastBackupAt:  string | null
}

const INTERVAL_OPTIONS = [
  { value: 1,  label: 'Cada hora' },
  { value: 6,  label: 'Cada 6 h' },
  { value: 12, label: 'Cada 12 h' },
  { value: 24, label: 'Cada 24 h' },
]

const MAX_FILES_OPTIONS = [3, 7, 14, 30]

function formatLastBackup(iso: string | null): string {
  if (!iso) return 'Nunca'
  try {
    return new Date(iso).toLocaleString('es', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AutoBackupPanel(): JSX.Element {
  const { notify } = useAppStore()
  const [config, setConfig] = useState<AutoBackupConfig | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    autoBackupApi.get().then((res) => setConfig(res as AutoBackupConfig)).catch(() => {})
  }, [])

  async function save(partial: Partial<AutoBackupConfig>): Promise<void> {
    if (!config) return
    const next = { ...config, ...partial }
    setConfig(next)
    setSaving(true)
    try {
      const res = await autoBackupApi.save(next) as { success: boolean; config?: AutoBackupConfig; error?: string }
      if (res.success && res.config) setConfig(res.config)
      else notify('error', res.error ?? 'Error al guardar la configuración')
    } catch {
      notify('error', 'Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  async function pickFolder(): Promise<void> {
    const folderPath = await autoBackupApi.pickFolder()
    if (folderPath) await save({ folderPath })
  }

  async function runNow(): Promise<void> {
    setRunning(true)
    try {
      const res = await autoBackupApi.runNow() as { success: boolean; path?: string; error?: string }
      if (res.success) {
        notify('success', `Backup guardado`)
        autoBackupApi.get().then((r) => setConfig(r as AutoBackupConfig)).catch(() => {})
      } else {
        notify('error', res.error ?? 'Error al hacer el backup')
      }
    } finally {
      setRunning(false)
    }
  }

  if (!config) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <DatabaseBackup size={16} className="text-primary" />
        <h3 className="font-semibold text-foreground">Backup automático</h3>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Activar backups automáticos</p>
          <p className="text-xs text-muted-foreground">Guarda una copia de la base de datos periódicamente</p>
        </div>
        <button
          onClick={() => void save({ enabled: !config.enabled })}
          disabled={saving}
          className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
            config.enabled ? 'bg-primary' : 'bg-secondary border border-border'
          }`}
        >
          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
            config.enabled ? 'translate-x-6' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {config.enabled && (
        <>
          {/* Interval */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Frecuencia</p>
            <div className="grid grid-cols-4 gap-2">
              {INTERVAL_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => void save({ intervalHours: value })}
                  className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                    config.intervalHours === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Max files */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Copias a conservar</p>
            <div className="flex gap-2">
              {MAX_FILES_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => void save({ maxKeepFiles: n })}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    config.maxKeepFiles === n
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Los más antiguos se eliminan automáticamente.</p>
          </div>

          {/* Folder */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Carpeta de destino</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground truncate font-mono">
                {config.folderPath}
              </div>
              <button
                onClick={() => void pickFolder()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary transition-colors shrink-0"
              >
                <FolderOpen size={14} />
                Cambiar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Last backup + run now */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock size={13} />
          <span>Último backup: <span className="text-foreground">{formatLastBackup(config.lastBackupAt)}</span></span>
        </div>
        <button
          onClick={() => void runNow()}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          <Play size={12} />
          {running ? 'Haciendo backup...' : 'Hacer backup ahora'}
        </button>
      </div>
    </div>
  )
}

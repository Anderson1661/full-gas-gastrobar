import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Database, Download, RotateCcw, ShieldAlert } from 'lucide-react'
import { backupApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

interface BackupResponse {
  success: boolean
  data?: {
    path?: string
    autoBackupPath?: string
    directory?: string
    forceLogout?: boolean
  }
  error?: string
}

export default function ToolsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const logout = useAuthStore((state) => state.logout)
  const { notify, setCashSession } = useAppStore()
  const [loadingExport, setLoadingExport] = useState(false)
  const [loadingImport, setLoadingImport] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')

  async function handleExport(): Promise<void> {
    setLoadingExport(true)
    const result = await backupApi.exportSql() as BackupResponse
    setLoadingExport(false)

    if (!result.success) {
      notify('error', result.error ?? 'No se pudo exportar el backup SQL')
      return
    }

    notify('success', `Backup SQL exportado en ${result.data?.path ?? 'la ruta seleccionada'}`)
  }

  async function handleImport(): Promise<void> {
    if (confirmText.trim().toUpperCase() !== 'REEMPLAZAR') {
      notify('warning', 'Escribe REEMPLAZAR para confirmar la restauracion completa')
      return
    }

    if (!currentPassword.trim()) {
      notify('warning', 'Debes confirmar tu contrasena actual para restaurar un backup')
      return
    }

    setLoadingImport(true)
    const result = await backupApi.importSql({ currentPassword }) as BackupResponse
    setLoadingImport(false)

    if (!result.success) {
      notify('error', result.error ?? 'No se pudo importar el backup SQL')
      return
    }

    notify(
      'success',
      `Backup restaurado. Se genero una copia preventiva en ${result.data?.autoBackupPath ?? 'la carpeta seleccionada'}`
    )

    setCurrentPassword('')
    setConfirmText('')

    if (result.data?.forceLogout) {
      setTimeout(() => {
        queryClient.clear()
        setCashSession(null)
        logout()
      }, 1200)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Herramientas</h1>
        <p className="text-sm text-muted-foreground">
          Exporta respaldos SQL completos y restaura la base solo en modo de mantenimiento.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-primary/15 p-3 text-primary">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Exportar backup SQL</h2>
              <p className="text-sm text-muted-foreground">
                Genera un respaldo orientado a datos con usuarios, productos, mesas, ventas, pagos, promociones,
                auditoria y configuracion operativa.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
            El archivo se genera con manifiesto interno de Full Gas para permitir restauraciones controladas desde la app.
          </div>

          <button
            onClick={() => void handleExport()}
            disabled={loadingExport}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Database size={16} />
            {loadingExport ? 'Exportando...' : 'Exportar backup SQL'}
          </button>
        </section>

        <section className="rounded-2xl border border-destructive/40 bg-card p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-destructive/15 p-3 text-destructive">
              <RotateCcw size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Importar backup SQL</h2>
              <p className="text-sm text-muted-foreground">
                Reemplaza los datos operativos con un backup generado por la aplicacion. Antes de restaurar se crea
                automaticamente un respaldo preventivo del estado actual.
              </p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <ShieldAlert size={16} />
              Requisitos de seguridad
            </div>
            <ul className="space-y-1 text-amber-100/90">
              <li>No debe haber caja abierta.</li>
              <li>No debe haber ordenes activas ni otras sesiones conectadas.</li>
              <li>La restauracion cerrara tu sesion al finalizar.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Contrasena actual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Confirma tu contrasena para restaurar"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Confirmacion fuerte
              </label>
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
                placeholder="Escribe REEMPLAZAR"
              />
            </div>
          </div>

          <button
            onClick={() => void handleImport()}
            disabled={loadingImport}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RotateCcw size={16} />
            {loadingImport ? 'Restaurando...' : 'Importar backup SQL'}
          </button>
        </section>
      </div>
    </div>
  )
}

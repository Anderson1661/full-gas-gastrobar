import React, { useState } from 'react'
import { CheckCircle, ChevronRight, Database, Eye, EyeOff, Loader2, Server, ShieldCheck, User } from 'lucide-react'
import { setupApi } from '../../lib/api'
import { cn } from '../../lib/utils'
import AppLogo from '../../components/ui/AppLogo'

interface DbConfig {
  host:     string
  port:     number
  user:     string
  password: string
  database: string
}

type Step = 'welcome' | 'connection' | 'init' | 'admin' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome',    label: 'Bienvenida' },
  { id: 'connection', label: 'Base de datos' },
  { id: 'init',       label: 'Inicializar' },
  { id: 'admin',      label: 'Administrador' },
  { id: 'done',       label: 'Listo' },
]

function stepIndex(s: Step): number {
  return STEPS.findIndex((x) => x.id === s)
}

interface Props {
  onComplete: () => void
  adminOnlyMode?: boolean
}

export default function SetupPage({ onComplete, adminOnlyMode = false }: Props): JSX.Element {
  const [step,     setStep]     = useState<Step>(adminOnlyMode ? 'admin' : 'welcome')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // DB config
  const [dbConfig, setDbConfig] = useState<DbConfig>({
    host:     'localhost',
    port:     3306,
    user:     'root',
    password: '',
    database: 'fullgas_db',
  })
  const [connOk, setConnOk] = useState(false)

  // Init
  const [initLog, setInitLog] = useState<string[]>([])

  // Admin
  const [adminUsername,  setAdminUsername]  = useState('')
  const [adminFullName,  setAdminFullName]  = useState('')
  const [adminPassword,  setAdminPassword]  = useState('')
  const [adminPassword2, setAdminPassword2] = useState('')
  const [showPwd,        setShowPwd]        = useState(false)
  const [adminCreated,   setAdminCreated]   = useState(false)

  function addLog(msg: string): void {
    setInitLog((prev) => [...prev, msg])
  }

  async function handleTestConnection(): Promise<void> {
    setLoading(true)
    setError(null)
    setConnOk(false)
    try {
      const res = await setupApi.testConnection(dbConfig) as { ok: boolean; error?: string }
      if (res.ok) {
        setConnOk(true)
      } else {
        setError(res.error ?? 'No se pudo conectar a MySQL')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleInitialize(): Promise<void> {
    setLoading(true)
    setError(null)
    setInitLog([])
    try {
      addLog('Creando base de datos si no existe...')
      const res = await setupApi.initialize(dbConfig) as { success: boolean; error?: string }
      if (!res.success) {
        setError(res.error ?? 'Error al inicializar la base de datos')
        return
      }
      addLog('✓ Base de datos creada')
      addLog('✓ Migraciones aplicadas')
      addLog('✓ Datos iniciales cargados')
      addLog('Inicialización completa.')
      setStep('admin')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateAdmin(): Promise<void> {
    if (!adminUsername.trim() || !adminFullName.trim()) {
      setError('El usuario y el nombre son obligatorios')
      return
    }
    if (adminPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (adminPassword !== adminPassword2) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await setupApi.createAdmin(
        adminOnlyMode ? null : dbConfig,
        adminUsername.trim(), adminFullName.trim(), adminPassword
      ) as { success: boolean; error?: string }

      if (!res.success) {
        setError(res.error ?? 'Error al crear el administrador')
        return
      }
      setAdminCreated(true)
      setStep('done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFinish(): Promise<void> {
    setLoading(true)
    try {
      await setupApi.complete()
      // Signal main to relaunch (second launch will have .env and boot normally)
      await setupApi.relaunch()
    } catch {
      onComplete()
    }
  }

  const currentIdx = stepIndex(step)

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <AppLogo className="mb-8" />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={cn(
              'flex items-center gap-1.5 text-sm font-medium',
              i < currentIdx  ? 'text-primary' :
              i === currentIdx ? 'text-foreground' :
              'text-muted-foreground'
            )}>
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                i < currentIdx  ? 'bg-primary text-primary-foreground' :
                i === currentIdx ? 'bg-primary/20 text-primary ring-2 ring-primary' :
                'bg-muted text-muted-foreground'
              )}>
                {i < currentIdx ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className="hidden sm:block">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} className="text-muted-foreground" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-card border border-border rounded-xl p-8 shadow-lg">

        {/* ── WELCOME ── */}
        {step === 'welcome' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Server size={24} className="text-primary" />
              <h2 className="text-xl font-bold">Configuración inicial</h2>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Este asistente configurará la base de datos y creará el primer usuario administrador.
              Solo necesitas ejecutarlo una vez.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-200 space-y-1">
              <p className="font-semibold">Requisito previo</p>
              <p>Necesitas <strong>MySQL 8+</strong> instalado y en ejecución en este equipo o accesible en red.</p>
              <p>El usuario MySQL que ingreses debe tener permisos para <code className="bg-amber-500/20 px-1 rounded">CREATE DATABASE</code>.</p>
            </div>
            <button
              onClick={() => setStep('connection')}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition-colors"
            >
              Comenzar configuración
            </button>
          </div>
        )}

        {/* ── CONNECTION ── */}
        {step === 'connection' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Database size={24} className="text-primary" />
              <h2 className="text-xl font-bold">Conexión a MySQL</h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Host</label>
                <input
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  value={dbConfig.host}
                  onChange={(e) => { setDbConfig((p) => ({ ...p, host: e.target.value })); setConnOk(false) }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Puerto</label>
                <input
                  type="number"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  value={dbConfig.port}
                  onChange={(e) => { setDbConfig((p) => ({ ...p, port: parseInt(e.target.value) || 3306 })); setConnOk(false) }}
                />
              </div>
            </div>

            {[
              { label: 'Nombre de la base de datos', key: 'database' as const, placeholder: 'fullgas_db' },
              { label: 'Usuario MySQL',               key: 'user' as const,     placeholder: 'root' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{label}</label>
                <input
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={placeholder}
                  value={dbConfig[key] as string}
                  onChange={(e) => { setDbConfig((p) => ({ ...p, [key]: e.target.value })); setConnOk(false) }}
                />
              </div>
            ))}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Contraseña MySQL</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="(dejar vacío si no hay contraseña)"
                  value={dbConfig.password}
                  onChange={(e) => { setDbConfig((p) => ({ ...p, password: e.target.value })); setConnOk(false) }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-destructive text-xs bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</p>
            )}
            {connOk && (
              <p className="text-green-400 text-xs bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                ✓ Conexión exitosa
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleTestConnection}
                disabled={loading}
                className="flex-1 border border-border hover:bg-muted text-foreground font-medium py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Probar conexión'}
              </button>
              <button
                onClick={() => { setError(null); setStep('init') }}
                disabled={!connOk}
                className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* ── INITIALIZE ── */}
        {step === 'init' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Database size={24} className="text-primary" />
              <h2 className="text-xl font-bold">Inicializar base de datos</h2>
            </div>
            <p className="text-muted-foreground text-sm">
              Se creará la base de datos <code className="bg-muted px-1 rounded">{dbConfig.database}</code>,
              se aplicarán todas las migraciones y se cargarán los datos iniciales.
            </p>

            {initLog.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1 font-mono">
                {initLog.map((line, i) => (
                  <div key={i} className={line.startsWith('✓') ? 'text-green-400' : ''}>{line}</div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-destructive text-xs bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</p>
            )}

            {initLog.length === 0 && (
              <button
                onClick={handleInitialize}
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold py-3 rounded-lg transition-colors"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Inicializando...</span>
                  : 'Inicializar ahora'}
              </button>
            )}
          </div>
        )}

        {/* ── ADMIN ── */}
        {step === 'admin' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <User size={24} className="text-primary" />
              <h2 className="text-xl font-bold">Crear administrador</h2>
            </div>
            <p className="text-muted-foreground text-sm">
              Este será el primer usuario con acceso total al sistema.
            </p>

            {[
              { label: 'Nombre completo', value: adminFullName, set: setAdminFullName, placeholder: 'Ej: Juan García', type: 'text' },
              { label: 'Nombre de usuario', value: adminUsername, set: setAdminUsername, placeholder: 'Ej: admin', type: 'text' },
            ].map(({ label, value, set, placeholder, type }) => (
              <div key={label} className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{label}</label>
                <input
                  type={type}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => { set(e.target.value); setError(null) }}
                />
              </div>
            ))}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Contraseña</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Mínimo 6 caracteres"
                  value={adminPassword}
                  onChange={(e) => { setAdminPassword(e.target.value); setError(null) }}
                />
                <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Confirmar contraseña</label>
              <input
                type="password"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={adminPassword2}
                onChange={(e) => { setAdminPassword2(e.target.value); setError(null) }}
              />
            </div>

            {error && (
              <p className="text-destructive text-xs bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</p>
            )}

            {!adminCreated && (
              <button
                onClick={handleCreateAdmin}
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold py-3 rounded-lg transition-colors"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Creando...</span>
                  : 'Crear administrador'}
              </button>
            )}
          </div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="space-y-6 text-center">
            <CheckCircle size={56} className="text-green-400 mx-auto" />
            <div>
              <h2 className="text-xl font-bold mb-2">¡Todo listo!</h2>
              <p className="text-muted-foreground text-sm">
                La base de datos está configurada y el administrador <strong>{adminUsername}</strong> ha sido creado.
                La aplicación se reiniciará para cargar el sistema.
              </p>
            </div>
            {!adminOnlyMode && (
              <div className="bg-muted/50 rounded-lg p-4 text-left text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground mb-2">Resumen de configuración</p>
                <p>Host: <span className="text-foreground">{dbConfig.host}:{dbConfig.port}</span></p>
                <p>Base de datos: <span className="text-foreground">{dbConfig.database}</span></p>
                <p>Usuario MySQL: <span className="text-foreground">{dbConfig.user}</span></p>
                <p>Admin del sistema: <span className="text-foreground">{adminUsername}</span></p>
              </div>
            )}
            <button
              onClick={handleFinish}
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Reiniciando...</>
                : <><ShieldCheck size={16} /> Ingresar al sistema</>
              }
            </button>
          </div>
        )}

      </div>

      <p className="text-muted-foreground text-xs mt-6">Full Gas Gastrobar POS · Configuración de instalación</p>
    </div>
  )
}

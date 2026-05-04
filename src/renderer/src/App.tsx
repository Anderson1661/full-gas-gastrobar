import React, { useEffect, useState } from 'react'
import { useAuthStore } from './store/auth.store'
import { useAppStore } from './store/app.store'
import { brandingApi, cashApi, licenseApi, setupApi, themeApi, updaterApi } from './lib/api'
import LoginPage from './pages/Login/LoginPage'
import MainLayout from './components/layout/MainLayout'
import SetupPage from './pages/Setup/SetupPage'
import LicensePage from './pages/License/LicensePage'
import { useLicenseStore } from './store/license.store'
import { useBrandingStore } from './store/branding.store'
import { useThemeStore } from './store/theme.store'
import type { ThemeConfig } from './store/theme.store'
import { useUpdateStore } from './store/update.store'
import type { UpdateInfo, ProgressInfo } from './store/update.store'
import { Toaster } from './components/ui/toaster'
import { Loader2 } from 'lucide-react'

type AppState = 'checking' | 'needs-setup' | 'db-loading' | 'db-error' | 'needs-license' | 'license-expired' | 'ready'

function LoadingScreen(): JSX.Element {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-4 text-gray-400">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
        <p className="text-sm">Iniciando sistema…</p>
      </div>
    </div>
  )
}

function DbErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }): JSX.Element {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-950">
      <div className="max-w-md rounded-xl border border-red-800 bg-gray-900 p-8 text-center shadow-xl">
        <div className="mb-4 text-4xl">⚠️</div>
        <h2 className="mb-2 text-lg font-semibold text-red-400">Error de base de datos</h2>
        <p className="mb-6 text-sm text-gray-400">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-500 transition-colors"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const [appState,        setAppState]        = useState<AppState>('checking')
  const [dbError,         setDbError]         = useState('')
  const [adminOnlySetup,  setAdminOnlySetup]  = useState(false)
  const [licExpiredAt,    setLicExpiredAt]    = useState<string | null>(null)
  const [licExpiredPlan,  setLicExpiredPlan]  = useState<string | null>(null)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setCashSession  = useAppStore((s) => s.setCashSession)
  const setLicense      = useLicenseStore((s) => s.setLicense)
  const setBranding     = useBrandingStore((s) => s.setBranding)
  const setTheme        = useThemeStore((s) => s.setTheme)
  const updateStore     = useUpdateStore()

  // Load branding and theme immediately so all screens show correct styles
  useEffect(() => {
    brandingApi.get().then((res: unknown) => {
      const b = res as { businessName?: string; slogan?: string; logoDataUrl?: string | null }
      setBranding({
        businessName: b.businessName ?? 'Full Gas Gastrobar',
        slogan:       b.slogan       ?? 'Gastrobar · Sistema de Gestión',
        logoDataUrl:  b.logoDataUrl  ?? null,
      })
    }).catch(() => {/* use store defaults */})

    themeApi.get().then((res: unknown) => {
      const t = res as Partial<ThemeConfig>
      setTheme({
        colorScheme:    t.colorScheme    ?? 'dark',
        accentColor:    t.accentColor    ?? '24 100% 53%',
        animationLevel: t.animationLevel ?? 'full',
        borderRadius:   t.borderRadius   ?? 'rounded',
      })
    }).catch(() => {/* use store defaults */})
  }, [setBranding, setTheme])

  // Resolve initial state: first run or normal boot
  useEffect(() => {
    setupApi.getStatus()
      .then((result) => {
        const r = result as { needsSetup: boolean; dbReady?: boolean; dbError?: string }
        if (r.needsSetup) {
          setAppState('needs-setup')
        } else if (r.dbReady) {
          setAppState('ready')
        } else if (r.dbError) {
          setDbError(r.dbError)
          setAppState('db-error')
        } else {
          // DB boot in progress — wait for push events
          setAppState('db-loading')
        }
      })
      .catch(() => {
        // IPC not ready yet; wait for push events
        setAppState('db-loading')
      })
  }, [])

  // Listen for DB ready/error pushed from main process
  useEffect(() => {
    const onDbReady = (): void => setAppState('ready')
    const onDbError = (...args: unknown[]): void => {
      const err = args[0]
      setDbError(typeof err === 'string' ? err : 'Error al conectar a la base de datos')
      setAppState('db-error')
    }
    const onNeedsAdmin = (): void => {
      setAdminOnlySetup(true)
      setAppState('needs-setup')
    }
    const onNeedsLicense = (): void => {
      setAppState('needs-license')
    }
    const onLicenseExpired = (...args: unknown[]): void => {
      const info = args[0] as { expiresAt: string; planLabel: string }
      setLicExpiredAt(info?.expiresAt ?? null)
      setLicExpiredPlan(info?.planLabel ?? null)
      setAppState('license-expired')
    }

    window.api.on('app:db-ready', onDbReady)
    window.api.on('app:db-error', onDbError)
    window.api.on('app:needs-admin', onNeedsAdmin)
    window.api.on('app:needs-license', onNeedsLicense)
    window.api.on('app:license-expired', onLicenseExpired)

    return () => {
      window.api.off('app:db-ready', onDbReady)
      window.api.off('app:db-error', onDbError)
      window.api.off('app:needs-admin', onNeedsAdmin)
      window.api.off('app:needs-license', onNeedsLicense)
      window.api.off('app:license-expired', onLicenseExpired)
    }
  }, [])

  // Listen for update events pushed from main process
  useEffect(() => {
    const onChecking      = (): void => updateStore.setStatus('checking')
    const onAvailable     = (...args: unknown[]): void => {
      updateStore.setStatus('available')
      updateStore.setUpdateInfo(args[0] as UpdateInfo)
    }
    const onNotAvailable  = (): void => updateStore.setStatus('not-available')
    const onProgress      = (...args: unknown[]): void => {
      updateStore.setStatus('downloading')
      updateStore.setProgress(args[0] as ProgressInfo)
    }
    const onDownloaded    = (...args: unknown[]): void => {
      updateStore.setStatus('ready')
      updateStore.setUpdateInfo(args[0] as UpdateInfo)
    }
    const onError         = (...args: unknown[]): void =>
      updateStore.setError(typeof args[0] === 'string' ? args[0] : 'Error al verificar actualizaciones')

    window.api.on('update:checking',      onChecking)
    window.api.on('update:available',     onAvailable)
    window.api.on('update:not-available', onNotAvailable)
    window.api.on('update:progress',      onProgress)
    window.api.on('update:downloaded',    onDownloaded)
    window.api.on('update:error',         onError)

    return () => {
      window.api.off('update:checking',      onChecking)
      window.api.off('update:available',     onAvailable)
      window.api.off('update:not-available', onNotAvailable)
      window.api.off('update:progress',      onProgress)
      window.api.off('update:downloaded',    onDownloaded)
      window.api.off('update:error',         onError)
    }
  }, [updateStore])

  // Auto-check for updates 30 s after ready (non-blocking)
  useEffect(() => {
    if (appState !== 'ready') return
    const t = setTimeout(() => { updaterApi.check().catch(() => {/* ignore */}) }, 30_000)
    return () => clearTimeout(t)
  }, [appState])

  // Load license info into store when app becomes ready
  useEffect(() => {
    if (appState === 'ready') {
      licenseApi.status().then((res: unknown) => {
        const r = res as {
          valid: boolean; plan?: string; planLabel?: string; company?: string
          expiresAt?: string; daysRemaining?: number; expiringSoon?: boolean
        }
        if (r.valid) {
          setLicense({
            valid:         true,
            plan:          r.plan as never,
            planLabel:     r.planLabel ?? null,
            company:       r.company ?? null,
            expiresAt:     r.expiresAt ?? null,
            daysRemaining: r.daysRemaining ?? 0,
            expiringSoon:  r.expiringSoon ?? false,
          })
        }
      }).catch(() => {/* non-critical */})
    }
  }, [appState, setLicense])

  // Load current cash session after auth
  useEffect(() => {
    if (isAuthenticated && appState === 'ready') {
      cashApi.current().then((session: unknown) => {
        const s = session as { id?: number } | null
        setCashSession(s?.id ?? null)
      }).catch(() => {
        setCashSession(null)
      })
    }
  }, [isAuthenticated, appState, setCashSession])

  function handleRetry(): void {
    setDbError('')
    setAppState('checking')
    setupApi.getStatus()
      .then((result) => {
        const r = result as { needsSetup: boolean; dbReady?: boolean; dbError?: string }
        if (r.dbReady) {
          setAppState('ready')
        } else if (r.dbError) {
          setDbError(r.dbError)
          setAppState('db-error')
        } else {
          setAppState('db-loading')
        }
      })
      .catch(() => setAppState('db-loading'))
  }

  if (appState === 'checking' || appState === 'db-loading') {
    return <LoadingScreen />
  }

  if (appState === 'needs-setup') {
    return (
      <>
        <SetupPage
          onComplete={() => setAppState('db-loading')}
          adminOnlyMode={adminOnlySetup}
        />
        <Toaster />
      </>
    )
  }

  if (appState === 'db-error') {
    return <DbErrorScreen error={dbError} onRetry={handleRetry} />
  }

  if (appState === 'needs-license') {
    return (
      <>
        <LicensePage onActivated={() => setAppState('db-loading')} />
        <Toaster />
      </>
    )
  }

  if (appState === 'license-expired') {
    return (
      <>
        <LicensePage
          expired
          expiredAt={licExpiredAt}
          expiredPlan={licExpiredPlan}
          onActivated={() => setAppState('db-loading')}
        />
        <Toaster />
      </>
    )
  }

  // appState === 'ready'
  return (
    <>
      {isAuthenticated ? <MainLayout /> : <LoginPage />}
      <Toaster />
    </>
  )
}

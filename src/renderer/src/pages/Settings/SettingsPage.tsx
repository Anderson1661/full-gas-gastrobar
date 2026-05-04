import React, { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { brandingApi, cashApi, settingsApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { useBrandingStore } from '../../store/branding.store'
import type { SystemSetting } from '@shared/types/entities'
import { CreditCard, Flame, ImagePlus, Settings, Trash2 } from 'lucide-react'
import AppearancePanel from '../../components/settings/AppearancePanel'
import AutoBackupPanel from '../../components/settings/AutoBackupPanel'
import UpdaterPanel from '../../components/settings/UpdaterPanel'

export default function SettingsPage(): JSX.Element {
  const { user } = useAuthStore()
  const { notify, setCashSession } = useAppStore()
  const qc = useQueryClient()
  const { businessName, slogan, logoDataUrl, setBranding } = useBrandingStore()


  const [saving,        setSaving]        = useState<string | null>(null)
  const [brandingName,  setBrandingName]  = useState(businessName)
  const [brandingSlogan, setBrandingSlogan] = useState(slogan)
  const [brandingLogo,  setBrandingLogo]  = useState<string | null>(logoDataUrl)
  const [savingBranding, setSavingBranding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setBrandingName(businessName)
    setBrandingSlogan(slogan)
    setBrandingLogo(logoDataUrl)
  }, [businessName, slogan, logoDataUrl])

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setBrandingLogo(ev.target?.result as string ?? null)
    reader.readAsDataURL(file)
  }

  async function saveBrandingSettings(): Promise<void> {
    setSavingBranding(true)
    const res = await brandingApi.save({
      businessName: brandingName.trim() || 'Full Gas Gastrobar',
      slogan:       brandingSlogan.trim(),
      logoDataUrl:  brandingLogo,
    }) as { success: boolean; branding?: { businessName: string; slogan: string; logoDataUrl: string | null } }
    setSavingBranding(false)
    if (res.success && res.branding) {
      setBranding(res.branding)
      notify('success', 'Personalización guardada')
    } else {
      notify('error', 'Error al guardar la personalización')
    }
  }

  const { data: settings = [] } = useQuery<SystemSetting[]>({
    queryKey: ['settings'],
    queryFn:  () => settingsApi.getAll() as Promise<SystemSetting[]>
  })

  const { data: currentSession } = useQuery({
    queryKey: ['cash-session'],
    queryFn:  () => cashApi.current()
  })

  useEffect(() => {
    const session = currentSession as { id?: number } | null | undefined
    setCashSession(session?.id ?? null)
  }, [currentSession, setCashSession])

  async function updateSetting(key: string, value: string): Promise<void> {
    if (!user) return
    setSaving(key)
    await settingsApi.update(key, value, user.id)
    qc.invalidateQueries({ queryKey: ['settings'] })
    notify('success', 'Configuracion guardada')
    setSaving(null)
  }

  async function openCashSession(): Promise<void> {
    if (!user) return
    const result = await cashApi.open({ openedBy: user.id, openingAmount: 0 }, user.username) as { success: boolean; data?: { id: number }; error?: string }
    if (result.success && result.data) {
      setCashSession(result.data.id)
      qc.invalidateQueries({ queryKey: ['cash-session'] })
      notify('success', 'Sesion de caja abierta')
    } else {
      notify('error', result.error ?? 'Error abriendo caja')
    }
  }

  const displayKeys = [
    'business_name', 'business_address', 'business_phone',
    'service_charge_pct', 'strict_stock_control', 'receipt_prefix',
    'currency_symbol', 'low_stock_alert', 'print_bar_ticket'
  ]

  const visibleSettings = settings.filter((setting) => displayKeys.includes(setting.keyName))
  const activeSession = currentSession && typeof currentSession === 'object' && 'id' in currentSession
    ? currentSession as { id: number }
    : null

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Configuracion</h1>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard size={16} className="text-primary" />
          <h3 className="font-semibold text-foreground">Sesion de caja</h3>
        </div>
        {activeSession ? (
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <p className="text-sm text-foreground">Caja abierta (sesion #{activeSession.id})</p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">No hay sesion de caja activa</p>
            {user?.roleName === 'admin' && (
              <button
                onClick={openCashSession}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
              >
                Abrir caja
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-primary" />
          <h3 className="font-semibold text-foreground">Configuracion del sistema</h3>
        </div>
        <div className="space-y-3">
          {visibleSettings.map((setting) => (
            <SettingRow
              key={setting.keyName}
              setting={setting}
              saving={saving === setting.keyName}
              onSave={updateSetting}
            />
          ))}
        </div>
      </div>

      {/* ── Personalización ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <ImagePlus size={16} className="text-primary" />
          <h3 className="font-semibold text-foreground">Personalización</h3>
        </div>

        <div className="space-y-5">
          {/* Logo */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Logo del negocio</p>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary shrink-0 overflow-hidden border border-border">
                {brandingLogo
                  ? <img src={brandingLogo} alt="Logo" className="h-full w-full object-cover" />
                  : <Flame size={28} className="text-white" />
                }
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <ImagePlus size={14} />
                  {brandingLogo ? 'Cambiar imagen' : 'Subir imagen'}
                </button>
                {brandingLogo && (
                  <button
                    onClick={() => setBrandingLogo(null)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                  >
                    <Trash2 size={14} />
                    Quitar logo
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG o WebP. Se muestra en el login, pantallas de activación y barra lateral.</p>
            </div>
          </div>

          {/* Business name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nombre del negocio</label>
            <input
              value={brandingName}
              onChange={(e) => setBrandingName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Ej: Mi Restaurante"
            />
          </div>

          {/* Slogan */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Eslogan o descripción</label>
            <input
              value={brandingSlogan}
              onChange={(e) => setBrandingSlogan(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Ej: Restaurante · Sistema de Gestión"
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-background p-5 flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground mb-1 self-start">Vista previa</p>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary overflow-hidden">
              {brandingLogo
                ? <img src={brandingLogo} alt="preview" className="h-full w-full object-cover" />
                : <Flame size={28} className="text-white" />
              }
            </div>
            <p className="text-xl font-bold text-foreground">{brandingName || 'Nombre del negocio'}</p>
            <p className="text-sm text-muted-foreground">{brandingSlogan}</p>
          </div>

          <button
            onClick={saveBrandingSettings}
            disabled={savingBranding}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-primary/90"
          >
            {savingBranding ? 'Guardando...' : 'Guardar personalización'}
          </button>
        </div>
      </div>

      {/* ── Apariencia ── */}
      <AppearancePanel />

      {/* ── Backup automático ── */}
      <AutoBackupPanel />

      {/* ── Actualizaciones ── */}
      <UpdaterPanel />
    </div>
  )
}

function SettingRow({ setting, saving, onSave }: {
  setting: SystemSetting
  saving: boolean
  onSave: (key: string, value: string) => Promise<void>
}): JSX.Element {
  const [value, setValue] = useState(setting.value)
  const isBool = setting.value === 'true' || setting.value === 'false'

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-foreground">{setting.description ?? setting.keyName}</p>
        <p className="text-xs text-muted-foreground">{setting.keyName}</p>
      </div>
      <div className="flex items-center gap-2">
        {isBool ? (
          <button
            onClick={() => {
              const newValue = value === 'true' ? 'false' : 'true'
              setValue(newValue)
              onSave(setting.keyName, newValue)
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${value === 'true' ? 'bg-primary' : 'bg-secondary border border-border'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${value === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        ) : (
          <>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground w-40 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => onSave(setting.keyName, value)}
              disabled={saving || value === setting.value}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-40"
            >
              {saving ? '...' : 'Guardar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

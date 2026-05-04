import React, { useState } from 'react'
import { Moon, Sun, Monitor, Palette } from 'lucide-react'
import { useThemeStore, ACCENT_PRESETS } from '../../store/theme.store'
import type { ColorScheme, AnimationLevel, RadiusLevel, UiScale } from '../../store/theme.store'
import { themeApi } from '../../lib/api'
import { useAppStore } from '../../store/app.store'

const SCHEMES: { id: ColorScheme; label: string; icon: React.ElementType; bgClass: string; textClass: string; borderClass: string }[] = [
  { id: 'dark',     label: 'Oscuro',     icon: Moon,    bgClass: 'bg-[#0f172a]', textClass: 'text-[#e2e8f0]', borderClass: 'border-[#1e3a5f]' },
  { id: 'light',    label: 'Claro',      icon: Sun,     bgClass: 'bg-[#f0f4f8]', textClass: 'text-[#1e293b]', borderClass: 'border-[#cbd5e1]' },
  { id: 'midnight', label: 'Medianoche', icon: Monitor, bgClass: 'bg-[#020817]', textClass: 'text-[#e2e8f0]', borderClass: 'border-[#0d1b2a]' },
]

const RADIUS_OPTIONS: { id: RadiusLevel; label: string; px: string }[] = [
  { id: 'sharp',   label: 'Angulado',   px: '2px'  },
  { id: 'rounded', label: 'Redondeado', px: '8px'  },
  { id: 'pill',    label: 'Píldora',    px: '20px' },
]

const ANIMATION_OPTIONS: { id: AnimationLevel; label: string; description: string }[] = [
  { id: 'full',    label: 'Completas', description: 'Todas las animaciones activas' },
  { id: 'reduced', label: 'Reducidas', description: 'Solo transiciones esenciales' },
  { id: 'none',    label: 'Sin',       description: 'Interfaz estática' },
]

const SCALE_OPTIONS: { value: UiScale; label: string }[] = [
  { value: 85,  label: '85%' },
  { value: 100, label: '100%' },
  { value: 115, label: '115%' },
]

export default function AppearancePanel(): JSX.Element {
  const { colorScheme, accentColor, animationLevel, borderRadius, uiScale, setTheme } = useThemeStore()
  const { notify } = useAppStore()
  const [saving, setSaving] = useState(false)

  const [localScheme,    setLocalScheme]    = useState<ColorScheme>(colorScheme)
  const [localAccent,    setLocalAccent]    = useState(accentColor)
  const [localAnimation, setLocalAnimation] = useState<AnimationLevel>(animationLevel)
  const [localRadius,    setLocalRadius]    = useState<RadiusLevel>(borderRadius)
  const [localScale,     setLocalScale]     = useState<UiScale>(uiScale)

  function applyLive(partial: {
    colorScheme?:    ColorScheme
    accentColor?:    string
    animationLevel?: AnimationLevel
    borderRadius?:   RadiusLevel
    uiScale?:        UiScale
  }): void {
    const next = {
      colorScheme:    partial.colorScheme    ?? localScheme,
      accentColor:    partial.accentColor    ?? localAccent,
      animationLevel: partial.animationLevel ?? localAnimation,
      borderRadius:   partial.borderRadius   ?? localRadius,
      uiScale:        partial.uiScale        ?? localScale,
    }
    if (partial.colorScheme    !== undefined) setLocalScheme(next.colorScheme)
    if (partial.accentColor    !== undefined) setLocalAccent(next.accentColor)
    if (partial.animationLevel !== undefined) setLocalAnimation(next.animationLevel)
    if (partial.borderRadius   !== undefined) setLocalRadius(next.borderRadius)
    if (partial.uiScale        !== undefined) setLocalScale(next.uiScale)
    setTheme(next)
  }

  async function saveAppearance(): Promise<void> {
    setSaving(true)
    try {
      await themeApi.save({
        colorScheme:    localScheme,
        accentColor:    localAccent,
        animationLevel: localAnimation,
        borderRadius:   localRadius,
        uiScale:        localScale,
      })
      notify('success', 'Apariencia guardada')
    } catch {
      notify('error', 'Error al guardar la apariencia')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-6">
      <div className="flex items-center gap-2">
        <Palette size={16} className="text-primary" />
        <h3 className="font-semibold text-foreground">Apariencia</h3>
      </div>

      {/* Color scheme */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Tema de color</p>
        <div className="grid grid-cols-3 gap-3">
          {SCHEMES.map(({ id, label, icon: Icon, bgClass, textClass, borderClass }) => (
            <button
              key={id}
              onClick={() => applyLive({ colorScheme: id })}
              className={`relative rounded-xl overflow-hidden transition-all border-2 ${
                localScheme === id
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <div className={`${bgClass} p-3 h-20 flex flex-col gap-2`}>
                <div className={`w-full h-2 rounded-sm border ${borderClass}`} />
                <div className={`w-3/4 h-2 rounded-sm border ${borderClass}`} />
                <div className={`w-1/2 h-2 rounded-sm border ${borderClass}`} />
              </div>
              <div className={`${bgClass} border-t ${borderClass} px-2.5 py-2 flex items-center gap-1.5`}>
                <Icon size={11} className={textClass} />
                <span className={`text-xs font-medium ${textClass}`}>{label}</span>
              </div>
              {localScheme === id && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow">
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Color de acento</p>
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map(({ name, value, hex }) => (
            <button
              key={value}
              title={name}
              onClick={() => applyLive({ accentColor: value })}
              style={{ backgroundColor: hex }}
              className={`w-9 h-9 rounded-full transition-all duration-150 hover:scale-110 focus:outline-none ${
                localAccent === value
                  ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110'
                  : ''
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Botones, indicadores y elementos interactivos.
        </p>
      </div>

      {/* Border radius */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Radio de bordes</p>
        <div className="flex gap-3">
          {RADIUS_OPTIONS.map(({ id, label, px }) => (
            <button
              key={id}
              onClick={() => applyLive({ borderRadius: id })}
              className={`flex-1 flex flex-col items-center gap-2.5 py-3 px-2 rounded-xl border transition-all ${
                localRadius === id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="w-10 h-6 border-2 border-current" style={{ borderRadius: px }} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Animations */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Animaciones</p>
        <div className="flex gap-3">
          {ANIMATION_OPTIONS.map(({ id, label, description }) => (
            <button
              key={id}
              onClick={() => applyLive({ animationLevel: id })}
              title={description}
              className={`flex-1 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                localAnimation === id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {ANIMATION_OPTIONS.find((a) => a.id === localAnimation)?.description}
        </p>
      </div>

      {/* UI Scale */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Zoom de la interfaz</p>
        <div className="flex gap-3">
          {SCALE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => applyLive({ uiScale: value })}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all ${
                localScale === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Útil para pantallas táctiles o resoluciones altas.
        </p>
      </div>

      <button
        onClick={saveAppearance}
        disabled={saving}
        className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-primary/90"
      >
        {saving ? 'Guardando...' : 'Guardar apariencia'}
      </button>
    </div>
  )
}

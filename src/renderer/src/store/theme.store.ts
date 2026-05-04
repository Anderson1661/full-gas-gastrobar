import { create } from 'zustand'

export type ColorScheme    = 'dark' | 'light' | 'midnight'
export type AnimationLevel = 'full' | 'reduced' | 'none'
export type RadiusLevel    = 'sharp' | 'rounded' | 'pill'
export type UiScale        = 85 | 100 | 115

export interface ThemeConfig {
  colorScheme:      ColorScheme
  accentColor:      string
  animationLevel:   AnimationLevel
  borderRadius:     RadiusLevel
  uiScale:          UiScale
  sidebarCollapsed: boolean
}

export interface ThemeState extends ThemeConfig {
  loaded:   boolean
  setTheme: (config: Partial<ThemeConfig>) => void
}

const RADIUS_MAP: Record<RadiusLevel, string> = {
  sharp:   '0.2rem',
  rounded: '0.625rem',
  pill:    '1rem',
}

export const DEFAULT_THEME: ThemeConfig = {
  colorScheme:      'dark',
  accentColor:      '24 100% 53%',
  animationLevel:   'full',
  borderRadius:     'rounded',
  uiScale:          100,
  sidebarCollapsed: false,
}

export const ACCENT_PRESETS = [
  { name: 'Naranja', value: '24 100% 53%',  hex: '#f97316' },
  { name: 'Azul',    value: '217 91% 60%',  hex: '#3b82f6' },
  { name: 'Verde',   value: '142 71% 45%',  hex: '#22c55e' },
  { name: 'Morado',  value: '262 83% 58%',  hex: '#a855f7' },
  { name: 'Rojo',    value: '0 72% 51%',    hex: '#ef4444' },
  { name: 'Teal',    value: '173 80% 40%',  hex: '#14b8a6' },
  { name: 'Rosa',    value: '330 81% 60%',  hex: '#ec4899' },
  { name: 'Ámbar',   value: '38 92% 50%',   hex: '#f59e0b' },
]

export function applyThemeToDocument(config: ThemeConfig): void {
  const root = document.documentElement
  root.classList.remove('light', 'midnight')
  if (config.colorScheme !== 'dark') root.classList.add(config.colorScheme)
  root.style.setProperty('--primary', config.accentColor)
  root.style.setProperty('--accent',  config.accentColor)
  root.style.setProperty('--ring',    config.accentColor)
  root.style.setProperty('--radius',  RADIUS_MAP[config.borderRadius])
  root.classList.remove('reduce-motion', 'no-motion')
  if (config.animationLevel === 'reduced') root.classList.add('reduce-motion')
  if (config.animationLevel === 'none')    root.classList.add('no-motion')
  root.style.zoom = String(config.uiScale / 100)
}

// Apply defaults immediately so no flash before saved theme loads
applyThemeToDocument(DEFAULT_THEME)

export const useThemeStore = create<ThemeState>((set) => ({
  ...DEFAULT_THEME,
  loaded: false,
  setTheme: (config) => set((state) => {
    const next = { ...state, ...config, loaded: true }
    applyThemeToDocument(next)
    return next
  }),
}))

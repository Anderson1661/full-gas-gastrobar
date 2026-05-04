import { create } from 'zustand'

export interface BrandingState {
  loaded:       boolean
  businessName: string
  slogan:       string
  logoDataUrl:  string | null
  setBranding:  (data: Partial<Omit<BrandingState, 'setBranding'>>) => void
}

export const useBrandingStore = create<BrandingState>((set) => ({
  loaded:       false,
  businessName: 'Full Gas Gastrobar',
  slogan:       'Gastrobar · Sistema de Gestión',
  logoDataUrl:  null,
  setBranding:  (data) => set({ ...data, loaded: true }),
}))

import { create } from 'zustand'

export type LicensePlan = 'monthly' | 'semester' | 'annual'

export const PLAN_LABELS: Record<LicensePlan, string> = {
  monthly:  'Mensual',
  semester: 'Semestral',
  annual:   'Anual',
}

interface LicenseState {
  loaded:        boolean
  valid:         boolean
  plan:          LicensePlan | null
  planLabel:     string | null
  company:       string | null
  expiresAt:     string | null   // ISO string
  daysRemaining: number
  expiringSoon:  boolean         // < 7 days
  setLicense: (data: Partial<Omit<LicenseState, 'setLicense' | 'clear'>>) => void
  clear: () => void
}

export const useLicenseStore = create<LicenseState>((set) => ({
  loaded:        false,
  valid:         false,
  plan:          null,
  planLabel:     null,
  company:       null,
  expiresAt:     null,
  daysRemaining: 0,
  expiringSoon:  false,
  setLicense: (data) => set({ ...data, loaded: true }),
  clear: () => set({
    loaded: false, valid: false, plan: null, planLabel: null,
    company: null, expiresAt: null, daysRemaining: 0, expiringSoon: false,
  }),
}))

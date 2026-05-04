import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import {
  checkLicense,
  saveLicenseToken,
  verifyToken,
  PLAN_LABELS,
} from '../services/license.service'

export function registerLicenseIpc(): void {

  // Devuelve el estado actual de la licencia instalada
  ipcMain.handle(IPC_CHANNELS.LICENSE_STATUS, async () => {
    const s = checkLicense()
    if (s.valid) {
      return {
        valid:         true,
        plan:          s.plan,
        planLabel:     s.planLabel,
        company:       s.company,
        email:         s.email,
        expiresAt:     s.expiresAt.toISOString(),
        daysRemaining: s.daysRemaining,
        expiringSoon:  s.expiringSoon,
      }
    }
    return {
      valid:      false,
      reason:     s.reason,
      ...(s.expiresAt && { expiresAt: s.expiresAt.toISOString() }),
      ...(s.plan      && { plan:      s.plan, planLabel: PLAN_LABELS[s.plan] }),
      ...(s.company   && { company:   s.company }),
    }
  })

  // Activa una nueva clave de licencia
  ipcMain.handle(IPC_CHANNELS.LICENSE_ACTIVATE, async (_, { token }: { token: string }) => {
    if (!token?.trim()) {
      return { success: false, error: 'Ingresa la clave de licencia' }
    }

    const s = verifyToken(token.trim())

    if (!s.valid) {
      const msg: Record<string, string> = {
        'invalid-format':    'Formato de clave inválido. Verifica que la copiaste completa.',
        'invalid-signature': 'Clave de licencia inválida o no es de Full Gas Gastrobar.',
        'expired':           'Esta clave de licencia ya está vencida. Solicita una nueva.',
      }
      return { success: false, error: msg[s.reason] ?? 'Licencia inválida' }
    }

    saveLicenseToken(token.trim())

    return {
      success:       true,
      plan:          s.plan,
      planLabel:     s.planLabel,
      company:       s.company,
      expiresAt:     s.expiresAt.toISOString(),
      daysRemaining: s.daysRemaining,
    }
  })
}

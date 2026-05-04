import { ipcMain } from 'electron'
import { promotionsService } from '../services/promotions.service'
import { validateSessionToken } from '../services/session.service'
import { IPC_CHANNELS } from '@shared/types/ipc'
import type { CreatePromotionDTO, UpdatePromotionDTO } from '@shared/types/dtos'

export function registerPromotionsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_LIST, async (_, { includeInactive }: { includeInactive?: boolean; sessionToken?: string }) => {
    return promotionsService.list(includeInactive ?? false)
  })

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_GET, async (_, { id }: { id: number }) => {
    return promotionsService.get(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_LIST_ITEMS, async (_, { promotionId }: { promotionId: number }) => {
    const items = await promotionsService.listItems(promotionId)
    return { success: true, data: items }
  })

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_CREATE, async (_, { dto, sessionToken }: { dto: CreatePromotionDTO; sessionToken: string }) => {
    const ctx = await validateSessionToken(sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }
    if (ctx.roleName !== 'admin') return { success: false, error: 'Se requiere rol administrador', code: 'FORBIDDEN' }
    return promotionsService.create(dto, ctx.userId, ctx.username, ctx.roleName, ctx.sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_UPDATE, async (_, { dto, sessionToken }: { dto: UpdatePromotionDTO; sessionToken: string }) => {
    const ctx = await validateSessionToken(sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }
    if (ctx.roleName !== 'admin') return { success: false, error: 'Se requiere rol administrador', code: 'FORBIDDEN' }
    return promotionsService.update(dto, ctx.userId, ctx.username, ctx.roleName, ctx.sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_TOGGLE, async (_, { id, sessionToken }: { id: number; sessionToken: string }) => {
    const ctx = await validateSessionToken(sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }
    if (ctx.roleName !== 'admin') return { success: false, error: 'Se requiere rol administrador', code: 'FORBIDDEN' }
    return promotionsService.toggle(id, ctx.userId, ctx.username, ctx.roleName, ctx.sessionId)
  })
}

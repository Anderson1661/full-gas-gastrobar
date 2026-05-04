import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requirePermissionSession, requireSession } from './session-auth'
import { tablesService } from '../services/tables.service'

export function registerTablesIpc(): void {
  ipcMain.handle(IPC_CHANNELS.TABLES_LIST, async () => {
    return tablesService.list()
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_GET_LAYOUT, async () => {
    return tablesService.getLayout()
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_GET, async (_, id: number) => {
    return tablesService.getById(id)
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_CREATE, async (_, { data, sessionToken }) => {
    const auth = await requirePermissionSession(sessionToken, 'tables.manage')
    if (!auth.ok) return auth.response

    return tablesService.create(data, auth.ctx.userId, auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_UPDATE, async (_, { id, data, sessionToken }) => {
    const auth = await requirePermissionSession(sessionToken, 'tables.manage')
    if (!auth.ok) return auth.response

    return tablesService.update(id, data, auth.ctx.userId, auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_BULK_GENERATE, async (_, { dto, sessionToken }) => {
    const auth = await requirePermissionSession(sessionToken, 'tables.manage')
    if (!auth.ok) return auth.response

    return tablesService.bulkGenerate(dto, auth.ctx.userId, auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_SAVE_LAYOUT, async (_, { dto, sessionToken }) => {
    const auth = await requirePermissionSession(sessionToken, 'tables.manage')
    if (!auth.ok) return auth.response

    return tablesService.saveLayout(dto, auth.ctx.userId, auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_STATUS, async (_, { id, status, sessionToken }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    await tablesService.updateStatus(id, status)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.TABLES_SAVE_FREE_LAYOUT, async (_, { dto, sessionToken }) => {
    const auth = await requirePermissionSession(sessionToken, 'tables.manage')
    if (!auth.ok) return auth.response

    return tablesService.saveFreeLayout(dto, auth.ctx.userId, auth.ctx.username)
  })
}

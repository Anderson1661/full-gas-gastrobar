import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireAdminSession } from './session-auth'
import { productsService } from '../services/products.service'

export function registerProductsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_LIST, async (_, includeInactive?: boolean) => {
    return productsService.list(includeInactive)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_SEARCH, async (_, term: string) => {
    return productsService.search(term)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_GET, async (_, id: number) => {
    return productsService.getById(id)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_CREATE, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireAdminSession(sessionToken)
    if (!auth.ok) return auth.response

    return productsService.create(dto, auth.ctx.userId, actorUsername ?? auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_UPDATE, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireAdminSession(sessionToken)
    if (!auth.ok) return auth.response

    return productsService.update(dto, auth.ctx.userId, actorUsername ?? auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES_LIST, async () => {
    return productsService.getCategories()
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES_CREATE, async (_, { data, sessionToken, actorUsername }) => {
    const auth = await requireAdminSession(sessionToken)
    if (!auth.ok) return auth.response

    return productsService.createCategory(data, auth.ctx.userId, actorUsername ?? auth.ctx.username)
  })
}

import { ipcMain } from 'electron'
import { asPositiveInt, query } from '../database/connection'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireAdminSession } from './session-auth'

export function registerAuditIpc(): void {
  ipcMain.handle(IPC_CHANNELS.AUDIT_LIST, async (_, { from, to, module, limit = 200, sessionToken }) => {
    const auth = await requireAdminSession(sessionToken)
    if (!auth.ok) return auth.response
    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    const safeLimit = asPositiveInt(limit, 200)

    if (from) {
      conditions.push('al.created_at >= ?')
      params.push(`${from} 00:00:00`)
    }
    if (to) {
      conditions.push('al.created_at <= ?')
      params.push(`${to} 23:59:59`)
    }
    if (module) {
      conditions.push('al.module = ?')
      params.push(module)
    }

    return query(
      `SELECT al.id, al.user_id, al.username, al.role_name, al.action, al.module, al.record_id,
              al.entity_type, al.entity_id, al.description, al.details_json,
              al.old_values, al.new_values, al.session_id, al.device_info,
              al.ip_address, al.result, al.reason, al.created_at
       FROM audit_logs al
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT ${safeLimit}`,
      params
    )
  })
}

import { execute } from '../database/connection'

interface AuditEntry {
  userId:      number
  username:    string
  roleName?:   string
  action:      string
  module:      string
  recordId?:   string
  entityType?: string
  entityId?:   string
  description?: string
  details?:    Record<string, unknown>
  oldValues?:  Record<string, unknown>
  newValues?:  Record<string, unknown>
  sessionId?:  number
  deviceInfo?: string
  ipAddress?:  string
  result?:     'success' | 'failure'
  reason?:     string
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs (
         user_id, username, role_name, action, module,
         record_id, entity_type, entity_id,
         description, details_json, old_values, new_values,
         session_id, device_info, ip_address, result, reason
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.userId,
        entry.username,
        entry.roleName ?? null,
        entry.action.toUpperCase(),
        entry.module,
        entry.recordId ?? null,
        entry.entityType ?? entry.module,
        entry.entityId ?? entry.recordId ?? null,
        entry.description ?? null,
        entry.details    ? JSON.stringify(entry.details)    : null,
        entry.oldValues  ? JSON.stringify(entry.oldValues)  : null,
        entry.newValues  ? JSON.stringify(entry.newValues)  : null,
        entry.sessionId  ?? null,
        entry.deviceInfo ?? null,
        entry.ipAddress  ?? null,
        entry.result     ?? 'success',
        entry.reason     ?? null,
      ]
    )
  } catch (err) {
    console.error('[Audit] Error registrando evento:', err)
  }
}

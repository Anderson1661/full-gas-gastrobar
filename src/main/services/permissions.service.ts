import { query } from '../database/connection'

interface PermissionRow {
  name: string
}

const cache = new Map<number, { permissions: string[]; expiresAt: number }>()

export async function listUserPermissions(userId: number): Promise<string[]> {
  const cached = cache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions
  }

  const rows = await query<PermissionRow>(
    `SELECT p.name
     FROM users u
     JOIN role_permissions rp ON rp.role_id = u.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.id = ?
       AND u.is_active = 1
     ORDER BY p.name`,
    [userId]
  )

  const permissions = rows.map((row) => row.name)
  cache.set(userId, { permissions, expiresAt: Date.now() + 30_000 })
  return permissions
}

export async function userHasPermission(
  userId: number,
  permission: string,
  roleName?: string
): Promise<boolean> {
  if (roleName === 'admin') return true
  const permissions = await listUserPermissions(userId)
  return permissions.includes(permission)
}

export function invalidatePermissionCache(userId?: number): void {
  if (userId) {
    cache.delete(userId)
    return
  }

  cache.clear()
}

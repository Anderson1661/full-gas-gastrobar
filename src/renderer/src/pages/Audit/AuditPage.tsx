import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '../../lib/api'
import { formatDateTime, today, nDaysAgo } from '../../lib/utils'
import { Shield } from 'lucide-react'
import RefreshButton from '../../components/shared/RefreshButton'

const MODULES = ['', 'auth', 'orders', 'payments', 'inventory', 'users', 'cash', 'expenses', 'products', 'promotions', 'reports', 'settings']

export default function AuditPage(): JSX.Element {
  const [from,   setFrom]   = useState(nDaysAgo(7))
  const [to,     setTo]     = useState(today())
  const [module, setModule] = useState('')

  const { data: logs = [], isError, error } = useQuery<unknown[]>({
    queryKey: ['audit', from, to, module],
    queryFn:  () => auditApi.list({ from, to, module: module || undefined }) as Promise<unknown[]>
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Auditoría</h1>
        </div>
        <RefreshButton queryKeys={[['audit']]} />
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none" />
        <select value={module} onChange={e => setModule(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none">
          <option value="">Todos los módulos</option>
          {MODULES.filter(m => m).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{logs.length} registros</span>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isError && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            No se pudo cargar la auditoria{error instanceof Error ? `: ${error.message}` : ''}
          </div>
        )}
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Fecha</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Usuario</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Acción</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Módulo</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(logs as {
              id: number
              created_at: string
              username: string
              action: string
              module: string
              description: string
              entity_type?: string
              entity_id?: string
            }[]).map(log => (
              <tr key={log.id} className="hover:bg-secondary/40">
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                <td className="px-4 py-2 text-foreground font-medium">{log.username}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    log.action === 'LOGIN'   ? 'bg-blue-500/20 text-blue-400'  :
                    log.action === 'CREATE'  ? 'bg-green-500/20 text-green-400':
                    log.action === 'CANCEL'  ? 'bg-red-500/20 text-red-400'   :
                    log.action === 'CLOSE'   ? 'bg-violet-500/20 text-violet-400':
                    log.action === 'ADJUST'  ? 'bg-amber-500/20 text-amber-400':
                    'bg-secondary text-muted-foreground'
                  }`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{log.module}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {log.description}
                  {(log.entity_type || log.entity_id) && (
                    <span className="block text-[11px] text-muted-foreground/70">
                      {log.entity_type ?? log.module}{log.entity_id ? ` #${log.entity_id}` : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">Sin registros de auditoría en el período</div>
        )}
      </div>
    </div>
  )
}

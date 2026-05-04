import React from 'react'
import { useAppStore } from '../../store/app.store'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

const icons = {
  success: <CheckCircle size={16} className="text-green-400" />,
  error:   <AlertCircle size={16} className="text-red-400" />,
  warning: <AlertTriangle size={16} className="text-amber-400" />,
  info:    <Info size={16} className="text-blue-400" />,
}

const borders = {
  success: 'border-green-500/40',
  error:   'border-red-500/40',
  warning: 'border-amber-500/40',
  info:    'border-blue-500/40',
}

export function Toaster(): JSX.Element {
  const { notifications, dismissNotification } = useAppStore()

  if (!notifications.length) return <></>

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 min-w-[300px] max-w-sm">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={cn(
            'flex items-start gap-3 bg-card border rounded-xl px-4 py-3 shadow-lg',
            borders[n.type]
          )}
        >
          <div className="mt-0.5">{icons[n.type]}</div>
          <p className="flex-1 text-sm text-foreground">{n.message}</p>
          <button
            onClick={() => dismissNotification(n.id)}
            className="text-muted-foreground hover:text-foreground mt-0.5"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

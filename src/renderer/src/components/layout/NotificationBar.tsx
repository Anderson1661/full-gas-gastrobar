import React from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Notification {
  id:      string
  type:    'success' | 'error' | 'warning' | 'info'
  message: string
}

interface Props {
  notifications: Notification[]
  onDismiss:     (id: string) => void
}

const icons = {
  success: <CheckCircle size={15} className="text-green-400" />,
  error:   <AlertCircle size={15} className="text-red-400" />,
  warning: <AlertTriangle size={15} className="text-amber-400" />,
  info:    <Info size={15} className="text-blue-400" />,
}

const styles = {
  success: 'bg-green-500/15 border-green-500/30',
  error:   'bg-red-500/15 border-red-500/30',
  warning: 'bg-amber-500/15 border-amber-500/30',
  info:    'bg-blue-500/15 border-blue-500/30',
}

export default function NotificationBar({ notifications, onDismiss }: Props): JSX.Element {
  return (
    <div className="px-6 pt-4 space-y-1">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm', styles[n.type])}
        >
          {icons[n.type]}
          <span className="flex-1 text-foreground">{n.message}</span>
          <button onClick={() => onDismiss(n.id)} className="text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

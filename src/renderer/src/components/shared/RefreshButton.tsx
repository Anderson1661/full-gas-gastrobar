import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

interface RefreshButtonProps {
  queryKeys: string[][]
  className?: string
  label?: string
}

export default function RefreshButton({ queryKeys, className, label }: RefreshButtonProps): JSX.Element {
  const qc = useQueryClient()
  const [spinning, setSpinning] = useState(false)

  async function handleRefresh(): Promise<void> {
    setSpinning(true)
    await Promise.all(queryKeys.map(key => qc.invalidateQueries({ queryKey: key })))
    setTimeout(() => setSpinning(false), 600)
  }

  return (
    <button
      onClick={() => void handleRefresh()}
      disabled={spinning}
      title="Actualizar datos"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50',
        className
      )}
    >
      <RefreshCw size={13} className={spinning ? 'animate-spin' : ''} />
      {label ?? 'Actualizar'}
    </button>
  )
}

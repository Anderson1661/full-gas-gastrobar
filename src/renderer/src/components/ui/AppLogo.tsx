import React from 'react'
import { Flame } from 'lucide-react'
import { useBrandingStore } from '../../store/branding.store'
import { cn } from '../../lib/utils'

interface AppLogoProps {
  /** 'centered' = stacked vertically (login / license / setup pages)
   *  'sidebar'  = compact horizontal (sidebar header) */
  variant?: 'centered' | 'sidebar'
  className?: string
}

export default function AppLogo({ variant = 'centered', className }: AppLogoProps): JSX.Element {
  const { businessName, slogan, logoDataUrl } = useBrandingStore()

  if (variant === 'sidebar') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0 overflow-hidden">
          {logoDataUrl
            ? <img src={logoDataUrl} alt={businessName} className="h-full w-full object-cover" />
            : <Flame size={16} className="text-white" />
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground truncate">{businessName}</p>
          <p className="text-xs text-muted-foreground truncate">{slogan.split('·')[0].trim()}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('text-center', className)}>
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 overflow-hidden">
        {logoDataUrl
          ? <img src={logoDataUrl} alt={businessName} className="h-full w-full object-cover" />
          : <Flame size={32} className="text-white" />
        }
      </div>
      <h1 className="text-3xl font-bold text-foreground">{businessName}</h1>
      <p className="text-muted-foreground mt-1">{slogan}</p>
    </div>
  )
}

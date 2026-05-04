import React from 'react'
import {
  LayoutDashboard,
  UtensilsCrossed,
  Warehouse,
  Receipt,
  Users,
  BarChart3,
  ClipboardList,
  Settings,
  LogOut,
  Coffee,
  Tag,
  DatabaseBackup,
  Vault,
  ChevronLeft,
  ChevronRight,
  Flame,
  History,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { useThemeStore } from '../../store/theme.store'
import { authApi } from '../../lib/api'
import { cn } from '../../lib/utils'
import AppLogo from '../ui/AppLogo'
import type { PageKey } from './MainLayout'

interface NavItem {
  key: PageKey
  label: string
  icon: React.ReactNode
  perm?: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard',     icon: <LayoutDashboard size={18} /> },
  { key: 'tables',    label: 'Mesas',         icon: <Coffee size={18} /> },
  { key: 'products',  label: 'Productos',     icon: <UtensilsCrossed size={18} />, adminOnly: true },
  { key: 'promotions',label: 'Promociones',   icon: <Tag size={18} />,             adminOnly: true },
  { key: 'inventory', label: 'Inventario',    icon: <Warehouse size={18} />,       perm: 'inventory.view' },
  { key: 'expenses',  label: 'Gastos',        icon: <Receipt size={18} />,         perm: 'expenses.view' },
  { key: 'cash',      label: 'Caja',          icon: <Vault size={18} />,           perm: 'cash.view' },
  { key: 'users',     label: 'Usuarios',      icon: <Users size={18} />,           adminOnly: true },
  { key: 'reports',   label: 'Reportes',      icon: <BarChart3 size={18} />,       perm: 'reports.view' },
  { key: 'history',   label: 'Historial',     icon: <History size={18} />,         adminOnly: true },
  { key: 'audit',     label: 'Auditoria',     icon: <ClipboardList size={18} />,   adminOnly: true },
  { key: 'settings',  label: 'Configuracion', icon: <Settings size={18} />,        adminOnly: true },
  { key: 'tools',     label: 'Herramientas',  icon: <DatabaseBackup size={18} />,  perm: 'backup.manage' },
]

interface SidebarProps {
  currentPage: PageKey
  onNavigate:  (page: PageKey) => void
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps): JSX.Element {
  const { user, sessionToken, logout, hasPermission, isAdmin } = useAuthStore()
  const cashSessionId = useAppStore((state) => state.cashSessionId)
  const { sidebarCollapsed, setTheme } = useThemeStore()

  const collapsed = sidebarCollapsed

  function toggleCollapse(): void {
    setTheme({ sidebarCollapsed: !collapsed })
  }

  async function handleLogout(): Promise<void> {
    if (sessionToken) {
      await authApi.logout(sessionToken).catch(() => {})
    }
    logout()
  }

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin()
    if (item.perm) return hasPermission(item.perm)
    return true
  })

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn('border-b border-border py-4 flex items-center justify-center', collapsed ? 'px-0' : 'px-4')}>
        {collapsed
          ? <Flame size={22} className="text-primary" />
          : <AppLogo variant="sidebar" />
        }
      </div>

      {/* Cash session indicator */}
      {collapsed ? (
        <div className="mx-auto mt-3">
          <div
            className={cn('w-2 h-2 rounded-full', cashSessionId ? 'bg-green-400' : 'bg-amber-400')}
            title={cashSessionId ? 'Caja abierta' : 'Sin sesión de caja'}
          />
        </div>
      ) : (
        cashSessionId ? (
          <div className="mx-3 mt-3 rounded border border-green-500/30 bg-green-500/20 px-2 py-1">
            <p className="text-xs font-medium text-green-400">Caja abierta</p>
          </div>
        ) : (
          <div className="mx-3 mt-3 rounded border border-amber-500/30 bg-amber-500/20 px-2 py-1">
            <p className="text-xs font-medium text-amber-400">Sin sesion de caja</p>
          </div>
        )
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            title={collapsed ? item.label : undefined}
            className={cn(
              'flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors',
              collapsed ? 'justify-center' : 'gap-3 text-left',
              currentPage === item.key
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            {item.icon}
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {/* User area */}
      <div className="border-t border-border px-3 py-3 space-y-1">
        {collapsed ? (
          <div className="flex justify-center mb-1">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20"
              title={`${user?.fullName} (${user?.roleName})`}
            >
              <span className="text-xs font-bold text-primary">
                {user?.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 shrink-0">
              <span className="text-xs font-bold text-primary">
                {user?.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{user?.fullName}</p>
              <p className="text-xs capitalize text-muted-foreground">{user?.roleName}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => void handleLogout()}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={cn(
            'flex w-full items-center rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive',
            collapsed ? 'justify-center' : 'gap-2'
          )}
        >
          <LogOut size={13} />
          {!collapsed && 'Cerrar sesion'}
        </button>

        <button
          onClick={toggleCollapse}
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          className={cn(
            'flex w-full items-center rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
            collapsed ? 'justify-center' : 'justify-end gap-1'
          )}
        >
          {!collapsed && <span className="text-[11px]">Colapsar</span>}
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  )
}

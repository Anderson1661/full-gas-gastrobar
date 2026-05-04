import React, { useState } from 'react'
import Sidebar from './Sidebar'
import { useAppStore } from '../../store/app.store'
import { useLicenseStore } from '../../store/license.store'
import { useUpdateStore } from '../../store/update.store'
import { updaterApi } from '../../lib/api'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'

// Pages
import DashboardPage    from '../../pages/Dashboard/DashboardPage'
import TablesPage       from '../../pages/Tables/TablesPage'
import ProductsPage     from '../../pages/Products/ProductsPage'
import InventoryPage    from '../../pages/Inventory/InventoryPage'
import ExpensesPage     from '../../pages/Expenses/ExpensesPage'
import UsersPage        from '../../pages/Users/UsersPage'
import ReportsPage      from '../../pages/Reports/ReportsPage'
import AuditPage        from '../../pages/Audit/AuditPage'
import SettingsPage     from '../../pages/Settings/SettingsPage'
import PromotionsPage   from '../../pages/Promotions/PromotionsPage'
import ToolsPage        from '../../pages/Tools/ToolsPage'
import CashPage         from '../../pages/Cash/CashPage'
import HistoryPage      from '../../pages/History/HistoryPage'
import NotificationBar  from './NotificationBar'

export type PageKey =
  | 'dashboard' | 'tables' | 'products' | 'promotions'
  | 'inventory' | 'expenses' | 'users' | 'cash'
  | 'reports' | 'audit' | 'settings' | 'tools' | 'history'

export default function MainLayout(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard')
  const notifications  = useAppStore((s) => s.notifications)
  const dismiss        = useAppStore((s) => s.dismissNotification)
  const expiringSoon   = useLicenseStore((s) => s.expiringSoon)
  const daysRemaining  = useLicenseStore((s) => s.daysRemaining)
  const updateStatus   = useUpdateStore((s) => s.status)
  const updateInfo     = useUpdateStore((s) => s.updateInfo)
  const downloadUpdate = useUpdateStore((s) => s.setStatus)

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':  return <DashboardPage />
      case 'tables':     return <TablesPage />
      case 'products':   return <ProductsPage />
      case 'promotions': return <PromotionsPage />
      case 'inventory':  return <InventoryPage />
      case 'expenses':   return <ExpensesPage />
      case 'cash':       return <CashPage />
      case 'users':      return <UsersPage />
      case 'reports':    return <ReportsPage />
      case 'audit':      return <AuditPage />
      case 'settings':   return <SettingsPage />
      case 'tools':      return <ToolsPage />
      case 'history':    return <HistoryPage />
      default:           return <DashboardPage />
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {updateStatus === 'available' && updateInfo && (
          <div className="flex items-center justify-between gap-2 bg-blue-500/10 border-b border-blue-500/30 px-4 py-2 text-blue-300 text-sm">
            <div className="flex items-center gap-2">
              <Download size={14} className="shrink-0" />
              <span>Nueva versión disponible: <strong>{updateInfo.version}</strong></span>
            </div>
            <button
              onClick={() => { updaterApi.download().catch(() => {}); downloadUpdate('downloading') }}
              className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-colors"
            >
              Descargar
            </button>
          </div>
        )}
        {updateStatus === 'ready' && updateInfo && (
          <div className="flex items-center justify-between gap-2 bg-green-500/10 border-b border-green-500/30 px-4 py-2 text-green-300 text-sm">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="shrink-0" />
              <span>Versión <strong>{updateInfo.version}</strong> lista para instalar</span>
            </div>
            <button
              onClick={() => updaterApi.install().catch(() => {})}
              className="px-3 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-500 transition-colors"
            >
              Instalar y reiniciar
            </button>
          </div>
        )}
        {expiringSoon && (
          <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-amber-300 text-sm">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              Tu licencia vence en <strong>{daysRemaining} día{daysRemaining !== 1 ? 's' : ''}</strong>.
              Contacta a soporte para renovarla.
            </span>
          </div>
        )}
        {notifications.length > 0 && (
          <NotificationBar notifications={notifications} onDismiss={dismiss} />
        )}
        <div className="flex-1 overflow-auto p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}

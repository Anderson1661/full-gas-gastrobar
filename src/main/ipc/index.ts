import { registerAuthIpc }       from './auth.ipc'
import { registerLicenseIpc }    from './license.ipc'
import { registerBrandingIpc }   from './branding.ipc'
import { registerTablesIpc }     from './tables.ipc'
import { registerOrdersIpc }     from './orders.ipc'
import { registerPaymentsIpc }   from './payments.ipc'
import { registerProductsIpc }   from './products.ipc'
import { registerInventoryIpc }  from './inventory.ipc'
import { registerCashIpc }       from './cash.ipc'
import { registerUsersIpc }      from './users.ipc'
import { registerReportsIpc }    from './reports.ipc'
import { registerSettingsIpc }   from './settings.ipc'
import { registerAuditIpc }      from './audit.ipc'
import { registerExpensesIpc }   from './expenses.ipc'
import { registerPrintIpc }      from './print.ipc'
import { registerSecurityIpc }   from './security.ipc'
import { registerPromotionsIpc } from './promotions.ipc'
import { registerBackupIpc }     from './backup.ipc'
import { registerUpdaterIpc }    from './updater.ipc'

export function registerAllIpcHandlers(): void {
  registerAuthIpc()
  registerTablesIpc()
  registerOrdersIpc()
  registerPaymentsIpc()
  registerProductsIpc()
  registerInventoryIpc()
  registerCashIpc()
  registerUsersIpc()
  registerReportsIpc()
  registerSettingsIpc()
  registerAuditIpc()
  registerExpensesIpc()
  registerPrintIpc()
  registerSecurityIpc()
  registerPromotionsIpc()
  registerBackupIpc()
  registerLicenseIpc()
  registerUpdaterIpc()

  console.log('[IPC] Todos los handlers registrados')
}

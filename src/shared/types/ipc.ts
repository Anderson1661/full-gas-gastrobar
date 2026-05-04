// =============================================
// Canales IPC - contratos type-safe
// =============================================

export const IPC_CHANNELS = {
  // Auth
  AUTH_LOGIN:           'auth:login',
  AUTH_LOGOUT:          'auth:logout',
  AUTH_CHANGE_PASSWORD: 'auth:change-password',
  AUTH_VERIFY_TOKEN:    'auth:verify-token',

  // Security questions / password recovery
  SECURITY_LIST_QUESTIONS:    'security:list-questions',
  SECURITY_SETUP_ANSWERS:     'security:setup-answers',
  SECURITY_GET_USER_QUESTIONS:'security:get-user-questions',
  SECURITY_VERIFY_ANSWERS:    'security:verify-answers',
  SECURITY_RECOVER_PASSWORD:  'security:recover-password',
  SECURITY_HAS_QUESTIONS:     'security:has-questions',

  // Sessions
  SESSIONS_LIST:    'sessions:list',
  SESSIONS_REVOKE:  'sessions:revoke',

  // Admin self-edit
  ADMIN_UPDATE_SELF: 'admin:update-self',

  // Tables
  TABLES_LIST:          'tables:list',
  TABLES_GET:           'tables:get',
  TABLES_GET_LAYOUT:    'tables:get-layout',
  TABLES_CREATE:        'tables:create',
  TABLES_UPDATE:        'tables:update',
  TABLES_SAVE_LAYOUT:       'tables:save-layout',
  TABLES_BULK_GENERATE:     'tables:bulk-generate',
  TABLES_STATUS:            'tables:status',
  TABLES_SAVE_FREE_LAYOUT:  'tables:save-free-layout',

  // Orders
  ORDERS_CREATE:        'orders:create',
  ORDERS_GET:           'orders:get',
  ORDERS_LIST_ACTIVE:   'orders:list-active',
  ORDERS_CREATE_SUBORDER:'orders:create-suborder',
  ORDERS_ADD_ITEM:      'orders:add-item',
  ORDERS_CANCEL_ITEM:   'orders:cancel-item',
  ORDERS_SEND_TO_BAR:   'orders:send-to-bar',
  ORDERS_REQUEST_BILL:  'orders:request-bill',
  ORDERS_RELEASE_EMPTY: 'orders:release-empty',

  // Payments
  PAYMENTS_REGISTER:    'payments:register',
  PAYMENTS_CLOSE_ORDER: 'payments:close-order',
  PAYMENTS_GET_BY_ORDER:'payments:get-by-order',
  PAYMENTS_METHODS:     'payments:methods',

  // Products
  PRODUCTS_LIST:        'products:list',
  PRODUCTS_GET:         'products:get',
  PRODUCTS_CREATE:      'products:create',
  PRODUCTS_UPDATE:      'products:update',
  PRODUCTS_SEARCH:      'products:search',
  CATEGORIES_LIST:      'products:categories-list',
  CATEGORIES_CREATE:    'products:categories-create',

  // Inventory
  INVENTORY_ADJUST:     'inventory:adjust',
  INVENTORY_MOVEMENTS:  'inventory:movements',
  INVENTORY_LOW_STOCK:  'inventory:low-stock',

  // Cash
  CASH_OPEN_SESSION:    'cash:open-session',
  CASH_CLOSE_SESSION:   'cash:close-session',
  CASH_CURRENT_SESSION: 'cash:current-session',
  CASH_SESSION_SUMMARY: 'cash:session-summary',
  CASH_LIST_SESSIONS:   'cash:list-sessions',
  CASH_SESSION_DETAIL:  'cash:session-detail',
  CASH_ADD_MOVEMENT:    'cash:add-movement',
  CASH_LIST_MOVEMENTS:  'cash:list-movements',
  CASH_EXPORT_PDF:      'cash:export-pdf',

  // Expenses
  EXPENSES_CREATE:      'expenses:create',
  EXPENSES_LIST:        'expenses:list',
  EXPENSES_CATEGORIES:  'expenses:categories',

  // Promotions
  PROMOTIONS_LIST:         'promotions:list',
  PROMOTIONS_GET:          'promotions:get',
  PROMOTIONS_CREATE:       'promotions:create',
  PROMOTIONS_UPDATE:       'promotions:update',
  PROMOTIONS_TOGGLE:       'promotions:toggle',
  PROMOTIONS_DELETE:       'promotions:delete',
  PROMOTIONS_LIST_ITEMS:   'promotions:list-items',

  // Users
  USERS_LIST:           'users:list',
  USERS_CREATE:         'users:create',
  USERS_UPDATE:         'users:update',

  // Reports
  REPORTS_SALES:        'reports:sales',
  REPORTS_PRODUCTS:     'reports:products',
  REPORTS_PAYMENTS:     'reports:payments',
  REPORTS_INVENTORY:    'reports:inventory',
  REPORTS_EXPENSES:     'reports:expenses',
  REPORTS_PROFIT:       'reports:profit',
  REPORTS_CASH_CLOSURE: 'reports:cash-closure',
  REPORTS_DASHBOARD:    'reports:dashboard',
  REPORTS_EXPORT_PDF_PACKAGE: 'reports:export-pdf-package',

  // Audit
  AUDIT_LIST:           'audit:list',

  // Settings
  SETTINGS_GET:         'settings:get',
  SETTINGS_UPDATE:      'settings:update',
  SETTINGS_GET_ALL:     'settings:get-all',

  // Backup / Restore
  BACKUP_EXPORT_SQL:    'backup:export-sql',
  BACKUP_IMPORT_SQL:    'backup:import-sql',

  // Print
  PRINT_BAR_TICKET:     'print:bar-ticket',
  PRINT_RECEIPT:        'print:receipt',
  PRINT_BILL:           'print:bill',

  // Suppliers
  SUPPLIERS_LIST:       'suppliers:list',
  SUPPLIERS_CREATE:     'suppliers:create',
  SUPPLIERS_UPDATE:     'suppliers:update',

  // Setup / first-run wizard
  SETUP_GET_STATUS:      'setup:get-status',
  SETUP_TEST_CONNECTION: 'setup:test-connection',
  SETUP_INITIALIZE:      'setup:initialize',
  SETUP_CREATE_ADMIN:    'setup:create-admin',
  SETUP_COMPLETE:        'setup:complete',

  // License
  LICENSE_STATUS:   'license:status',
  LICENSE_ACTIVATE: 'license:activate',

  // Branding
  BRANDING_GET:  'branding:get',
  BRANDING_SAVE: 'branding:save',

  // Theme / Appearance
  THEME_GET:  'theme:get',
  THEME_SAVE: 'theme:save',

  // History / closed orders
  HISTORY_LIST:             'history:list',
  HISTORY_GET_CORRECTIONS:  'history:get-corrections',
  HISTORY_ADD_CORRECTION:   'history:add-correction',

  // Auto-backup
  AUTO_BACKUP_GET:         'auto-backup:get',
  AUTO_BACKUP_SAVE:        'auto-backup:save',
  AUTO_BACKUP_RUN_NOW:     'auto-backup:run-now',
  AUTO_BACKUP_PICK_FOLDER: 'auto-backup:pick-folder',

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // Updater
  UPDATE_CHECK:        'update:check',
  UPDATE_DOWNLOAD:     'update:download',
  UPDATE_INSTALL:      'update:install',
  UPDATE_GET_VERSION:  'update:get-version',
  UPDATE_CONFIG_GET:   'update:config-get',
  UPDATE_CONFIG_SAVE:  'update:config-save',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

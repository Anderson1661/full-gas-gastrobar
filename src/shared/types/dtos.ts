// =============================================
// DTOs - contratos para operaciones IPC
// =============================================

// AUTH
export interface LoginDTO {
  username: string
  password: string
}

export interface AuthResponse {
  user: {
    id: number
    username: string
    fullName: string
    roleName: string
    permissions: string[]
  }
  token: string
}

// ORDERS
export interface CreateOrderDTO {
  tableId: number
  waiterId: number
  notes?: string
}

export interface CreateSubOrderDTO {
  orderId: number
  createdBy: number
  label?: string
}

export interface AddOrderItemDTO {
  orderId: number
  subOrderId?: number
  productId: number
  quantity: number
  notes?: string
}

export interface CancelOrderItemDTO {
  orderItemId: number
  reason: string
  cancelledBy: number
}

export interface SendToBarDTO {
  orderId: number
  itemIds?: number[]  // vacío = todos los no enviados
}

// PAYMENTS
export interface RegisterPaymentDTO {
  orderId: number
  subOrderId?: number
  paymentMethodId: number
  amount: number
  serviceAccepted?: boolean | null
  reference?: string
  notes?: string
  receivedBy: number
}

export interface CloseOrderDTO {
  orderId: number
  serviceAccepted: boolean
  closedBy: number
}

// INVENTORY
export interface AdjustInventoryDTO {
  productId: number
  type: 'adjustment_in' | 'adjustment_out' | 'waste' | 'purchase' | 'return'
  quantity: number
  unitCost?: number
  reason: string
  performedBy: number
  adminUsername: string
  adminPassword: string
}

// CASH SESSION
export interface OpenCashSessionDTO {
  openedBy: number
  openingAmount: number
}

export interface CloseCashSessionDTO {
  sessionId: number
  closedBy: number
  closingAmountReal: number
  detailsByMethod: {
    paymentMethodId: number
    realAmount: number
  }[]
  notes?: string
}

// PRODUCTS
export interface CreateProductDTO {
  categoryId: number
  supplierId?: number
  sku?: string
  name: string
  description?: string
  costPrice: number
  salePrice: number
  stock?: number
  minStock?: number
  unit?: string
  trackInventory?: boolean
}

export interface UpdateProductDTO extends Partial<CreateProductDTO> {
  id: number
  isActive?: boolean
}

// USERS
export interface CreateUserDTO {
  username: string
  fullName: string
  email?: string
  password: string
  roleId: number
}

export interface UpdateUserDTO {
  id: number
  fullName?: string
  email?: string
  roleId?: number
  isActive?: boolean
}

export interface ChangePasswordDTO {
  userId: number
  currentPassword: string
  newPassword: string
}

// EXPENSES
export interface CreateExpenseDTO {
  categoryId: number
  cashSessionId?: number
  description: string
  amount: number
  notes?: string
  registeredBy: number
  expenseDate: string
}

// REPORTS
export interface ReportFilters {
  from: string
  to: string
  waiterId?: number
  tableId?: number
  categoryId?: number
  paymentMethodId?: number
}

export interface ExportAccountingPdfDTO {
  from: string
  to: string
  cashSessionId?: number
}

export interface AdminCredentialsDTO {
  username: string
  password: string
}

// SECURITY QUESTIONS
export interface SetupSecurityAnswersDTO {
  userId: number
  answers: { questionId: number; answer: string }[]
}

export interface VerifySecurityAnswersDTO {
  username: string
  answers: { questionId: number; answer: string }[]
}

export interface RecoverPasswordDTO {
  username: string
  answers: { questionId: number; answer: string }[]
  newPassword: string
}

// SESSIONS
export interface CreateSessionDTO {
  userId: number
  deviceInfo?: string
  ipAddress?: string
  timeoutMinutes?: number
}

export interface ValidateSessionDTO {
  sessionToken: string
}

// PROMOTIONS
export interface CreatePromotionDTO {
  name: string
  description?: string
  type: 'percentage' | 'fixed_amount' | 'fixed_price' | 'combo' | 'happy_hour'
  discountValue: number
  minQuantity?: number
  appliesTo?: 'product' | 'category' | 'order'
  startTime?: string
  endTime?: string
  daysOfWeek?: string
  validFrom?: string
  validUntil?: string
  isActive?: boolean
  autoApply?: boolean
  priority?: number
  productIds?: number[]
  categoryIds?: number[]
}

export interface UpdatePromotionDTO extends Partial<CreatePromotionDTO> {
  id: number
}

// TABLE LAYOUT
export interface TableLayoutZoneInputDTO {
  id?: number
  name: string
  rows: number
  cols: number
  sortOrder: number
  desiredCount?: number
  isActive?: boolean
}

export interface TableLayoutTableUpdateDTO {
  tableId: number
  zoneId: number
  layoutRow: number
  layoutCol: number
  layoutOrder: number
  name?: string | null
  capacity?: number
  isActive?: boolean
}

export interface BulkGenerateTablesDTO {
  zones: TableLayoutZoneInputDTO[]
}

export interface SaveTableLayoutDTO {
  zones: TableLayoutZoneInputDTO[]
  tables: TableLayoutTableUpdateDTO[]
}

export interface SwapTablesDTO {
  sourceTableId: number
  targetTableId: number
}

// FREE CANVAS LAYOUT
export interface FreeLayoutZoneDTO {
  id?: number
  name: string
  sortOrder: number
  isActive: boolean
}

export interface FreeLayoutTableItemDTO {
  tableId?: number          // undefined = crear nueva mesa
  number: number
  name: string | null
  capacity: number
  zoneName: string | null   // nombre de zona para correlación (incluye zonas nuevas)
  positionX: number
  positionY: number
  isActive: boolean
}

export interface SaveFreeLayoutDTO {
  zones: FreeLayoutZoneDTO[]
  tables: FreeLayoutTableItemDTO[]
}

// CASH MOVEMENTS
export interface AddCashMovementDTO {
  cashSessionId: number
  type: 'in' | 'out'
  concept: string
  amount: number
  description?: string
  registeredBy: number
}

export interface ExportCashSessionPdfDTO {
  cashSessionId: number
}

// BACKUP
export interface ExportDatabaseBackupDTO {
  suggestedName?: string
}

export interface ImportDatabaseBackupDTO {
  currentPassword: string
}

// ADMIN EDIT
export interface UpdateAdminDTO {
  adminId: number
  currentPassword: string
  fullName?: string
  username?: string
  email?: string
  newPassword?: string
}

// PAGINATION
export interface PaginationParams {
  page: number
  limit: number
  search?: string
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// API RESULT
export interface ApiResult<T = void> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

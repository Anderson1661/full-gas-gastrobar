// =============================================
// Entidades del dominio - espejo del schema DB
// =============================================

export type UserRole = 'admin' | 'mesero' | 'developer'

export interface User {
  id: number
  username: string
  fullName: string
  email: string | null
  roleId: number
  roleName: UserRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface Role {
  id: number
  name: UserRole
  description: string | null
  isActive: boolean
}

export type TableStatus = 'available' | 'occupied' | 'pending_payment' | 'reserved' | 'inactive'

export interface BarTable {
  id: number
  number: number
  name: string | null
  capacity: number
  zoneId: number | null
  zone: string | null
  positionX: number
  positionY: number
  layoutRow: number | null
  layoutCol: number | null
  layoutOrder: number | null
  status: TableStatus
  isActive: boolean
  // runtime
  currentOrderId?: number
  currentOrderTotal?: number
  currentWaiter?: string
}

export interface TableLayoutZone {
  id: number
  name: string
  rows: number
  cols: number
  sortOrder: number
  isActive: boolean
  tables: BarTable[]
}

export interface ProductCategory {
  id: number
  name: string
  description: string | null
  color: string | null
  icon: string | null
  sortOrder: number
  isActive: boolean
}

export interface Product {
  id: number
  categoryId: number
  categoryName: string
  supplierId: number | null
  sku: string | null
  name: string
  description: string | null
  costPrice: number
  salePrice: number
  stock: number
  minStock: number
  unit: string
  trackInventory: boolean
  isActive: boolean
  imagePath: string | null
  createdAt: string
}

export type OrderStatus = 'open' | 'pending_payment' | 'paid' | 'cancelled'

export interface Order {
  id: number
  tableId: number
  tableNumber: number
  tableName: string | null
  waiterId: number
  waiterName: string
  cashSessionId: number | null
  status: OrderStatus
  subtotal: number
  serviceCharge: number
  serviceAccepted: boolean | null
  total: number
  totalPaid: number
  balanceDue: number
  notes: string | null
  openedAt: string
  closedAt: string | null
  items?: OrderItem[]
  payments?: Payment[]
  subOrders?: SubOrder[]
}

export type OrderItemStatus = 'active' | 'cancelled' | 'modified'

export interface OrderItem {
  id: number
  orderId: number
  subOrderId: number | null
  productId: number
  productName: string
  categoryName: string
  promotionId: number | null
  quantity: number
  unitPrice: number
  originalPrice: number
  discountAmount: number
  subtotal: number
  notes: string | null
  status: OrderItemStatus
  sentToBar: boolean
  sentAt: string | null
  createdAt: string
}

export type SubOrderStatus = 'pending' | 'partial' | 'paid'

export interface SubOrder {
  id: number
  orderId: number
  roundNumber: number
  label: string | null
  subtotal: number
  totalPaid: number
  balanceDue: number
  status: SubOrderStatus
  createdBy: number
  createdAt: string
  closedAt: string | null
  items?: OrderItem[]
}

export interface PaymentMethod {
  id: number
  name: string
  code: string
  isActive: boolean
  sortOrder: number
}

export interface Payment {
  id: number
  orderId: number
  subOrderId: number | null
  subOrderLabel: string | null
  paymentMethodId: number
  paymentMethodName: string
  amount: number
  tenderedAmount: number
  changeGiven: number
  reference: string | null
  receivedBy: number
  receivedByName: string
  notes: string | null
  createdAt: string
}

export interface Receipt {
  id: number
  receiptNumber: string
  orderId: number
  subtotal: number
  serviceCharge: number
  total: number
  totalPaid: number
  changeGiven: number
  issuedBy: number
  issuedByName: string
  issuedAt: string
  printedAt: string | null
  voided: boolean
  voidReason: string | null
}

export type InventoryMovementType =
  | 'purchase'
  | 'sale'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'waste'
  | 'return'

export interface InventoryMovement {
  id: number
  productId: number
  productName: string
  type: InventoryMovementType
  quantity: number
  unitCost: number | null
  stockBefore: number
  stockAfter: number
  referenceId: number | null
  referenceType: string | null
  reason: string | null
  performedBy: number
  performedByName: string
  createdAt: string
}

export interface Expense {
  id: number
  categoryId: number
  categoryName: string
  cashSessionId: number | null
  description: string
  amount: number
  notes: string | null
  registeredBy: number
  registeredByName: string
  expenseDate: string
  createdAt: string
}

export interface ExpenseCategory {
  id: number
  name: string
  description: string | null
  isActive: boolean
}

export type PromotionType = 'percentage' | 'fixed_amount' | 'fixed_price' | 'combo' | 'happy_hour'

export interface Promotion {
  id: number
  name: string
  description: string | null
  type: PromotionType
  discountValue: number
  minQuantity: number
  appliesTo: 'product' | 'category' | 'order'
  startTime: string | null
  endTime: string | null
  daysOfWeek: string | null
  validFrom: string | null
  validUntil: string | null
  isActive: boolean
  autoApply: boolean
  priority: number
  createdBy: number
  createdByName: string | null
  updatedBy: number | null
  createdAt: string
}

export interface PromotionItem {
  id: number
  promotionId: number
  productId: number | null
  productName: string | null
  categoryId: number | null
  categoryName: string | null
}

export interface CashSession {
  id: number
  openedBy: number
  openedByName: string
  closedBy: number | null
  closedByName: string | null
  openingAmount: number
  closingAmountReal: number | null
  status: 'open' | 'closed'
  notes: string | null
  openedAt: string
  closedAt: string | null
  pdfPath: string | null
}

export type CashMovementConcept = 'sale' | 'expense' | 'manual_in' | 'manual_out' | 'adjustment'

export interface CashMovement {
  id: number | string
  cashSessionId: number
  type: 'in' | 'out'
  concept: CashMovementConcept
  amount: number
  description: string | null
  registeredBy: number | null
  registeredByName: string | null
  createdAt: string
}

export interface CashSessionMethodDetail {
  paymentMethodId: number
  paymentMethodName: string
  theoreticalAmount: number
  realAmount: number | null
  difference: number | null
}

export interface CashSessionSummary {
  session: CashSession
  totalOrders: number
  totalSales: number
  totalService: number
  totalExpenses: number
  totalManualIn: number
  totalManualOut: number
  byMethod: { methodId: number; methodName: string; total: number }[]
  closureDetails: CashSessionMethodDetail[]
  expectedCash: number
  difference: number | null
}

export interface AuditLog {
  id: number
  userId: number
  username: string
  roleName: string | null
  action: string
  module: string
  recordId: string | null
  entityType: string | null
  entityId: string | null
  description: string | null
  detailsJson: Record<string, unknown> | null
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  sessionId: number | null
  deviceInfo: string | null
  ipAddress: string | null
  result: 'success' | 'failure'
  reason: string | null
  createdAt: string
}

export interface UserSession {
  id: number
  userId: number
  sessionToken: string
  deviceInfo: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  lastUsedAt: string
  revokedAt: string | null
  revokeReason: string | null
  isActive: boolean
}

export interface SecurityQuestion {
  id: number
  question: string
  isActive: boolean
  sortOrder: number
}

export interface UserSecurityAnswer {
  id: number
  userId: number
  questionId: number
  question: string
  createdAt: string
}

export interface PasswordResetAttempt {
  id: number
  userId: number | null
  username: string | null
  ipAddress: string | null
  success: boolean
  failReason: string | null
  createdAt: string
}

export interface SystemSetting {
  id: number
  keyName: string
  value: string
  description: string | null
  updatedAt: string
}

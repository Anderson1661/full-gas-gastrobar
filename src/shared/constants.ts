export const ROLES = {
  ADMIN:     'admin',
  MESERO:    'mesero',
  DEVELOPER: 'developer',
} as const

export const TABLE_STATUS_LABELS: Record<string, string> = {
  available:       'Libre',
  occupied:        'Ocupada',
  pending_payment: 'Por cobrar',
  reserved:        'Reservada',
  inactive:        'Inactiva',
}

export const TABLE_STATUS_COLORS: Record<string, string> = {
  available:       '#22C55E',  // green
  occupied:        '#EF4444',  // red
  pending_payment: '#F59E0B',  // amber
  reserved:        '#8B5CF6',  // violet
  inactive:        '#6B7280',  // gray
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  open:            'Abierta',
  pending_payment: 'Por cobrar',
  paid:            'Cerrada',
  cancelled:       'Cancelada',
}

export const INVENTORY_MOVEMENT_LABELS: Record<string, string> = {
  purchase:       'Compra / Entrada',
  sale:           'Venta',
  adjustment_in:  'Ajuste +',
  adjustment_out: 'Ajuste -',
  waste:          'Merma',
  return:         'Devolución',
}

export const SERVICE_CHARGE_PCT = 5

export const RECEIPT_NUMBER_FORMAT = (prefix: string, seq: number): string =>
  `${prefix}-${String(seq).padStart(5, '0')}`

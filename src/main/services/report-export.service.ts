import { app, BrowserWindow, dialog } from 'electron'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { reportsService } from './reports.service'
import { settingsService } from './settings.service'
import { auditLog } from '../utils/audit'
import { renderPdfToFile } from '../utils/pdf'
import type { ExportAccountingPdfDTO, ApiResult } from '@shared/types/dtos'
import type { SessionContext } from './session.service'

interface PdfPackageFile {
  key: string
  path: string
}

interface PdfPackageResult {
  directory: string
  files: PdfPackageFile[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createTimestamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function buildDocumentHtml(args: {
  businessName: string
  title: string
  subtitle: string
  summaryItems: { label: string; value: string }[]
  tableHeaders: string[]
  tableRows: string[][]
  footerNote?: string
}): string {
  const generatedAt = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  const summaryBlocks = args.summaryItems
    .map((item) => `
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(item.label)}</div>
        <div class="summary-value">${escapeHtml(item.value)}</div>
      </div>
    `)
    .join('')

  const headerRow = args.tableHeaders
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join('')

  const bodyRows = args.tableRows.length
    ? args.tableRows
        .map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('')
    : `<tr><td colspan="${args.tableHeaders.length}" class="empty-row">Sin registros para este rango</td></tr>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    :root {
      color-scheme: light;
      --accent: #b45309;
      --text: #111827;
      --muted: #6b7280;
      --border: #d1d5db;
      --soft: #f9fafb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 32px;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background: white;
    }
    header {
      border-bottom: 2px solid var(--accent);
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 24px;
      color: var(--accent);
    }
    .subtitle {
      color: var(--muted);
      font-size: 13px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary-card {
      border: 1px solid var(--border);
      background: var(--soft);
      border-radius: 12px;
      padding: 12px;
    }
    .summary-label {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .summary-value {
      font-size: 18px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    thead th {
      background: #f3f4f6;
      border-bottom: 1px solid var(--border);
      padding: 8px;
      text-align: left;
    }
    tbody td {
      border-bottom: 1px solid #e5e7eb;
      padding: 8px;
      vertical-align: top;
    }
    .empty-row {
      text-align: center;
      color: var(--muted);
      padding: 18px 8px;
    }
    footer {
      margin-top: 16px;
      font-size: 11px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(args.businessName)}</h1>
    <div class="subtitle">${escapeHtml(args.title)}</div>
    <div class="subtitle">${escapeHtml(args.subtitle)}</div>
    <div class="subtitle">Generado: ${escapeHtml(generatedAt)}</div>
  </header>
  <section class="summary-grid">
    ${summaryBlocks}
  </section>
  <table>
    <thead>
      <tr>${headerRow}</tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
  <footer>${escapeHtml(args.footerNote ?? 'Documento generado automaticamente por Full Gas Gastrobar')}</footer>
</body>
</html>`
}

export class ReportExportService {
  async exportAccountingPackage(
    ctx: SessionContext,
    dto: ExportAccountingPdfDTO
  ): Promise<ApiResult<PdfPackageResult>> {
    if (!dto.from || !dto.to) {
      return { success: false, error: 'Debes indicar un rango valido para exportar', code: 'INVALID_RANGE' }
    }

    const targetRoot = await this.promptDirectory()
    if (!targetRoot) {
      return { success: false, error: 'Exportacion cancelada por el usuario', code: 'CANCELLED' }
    }

    const packageDirectory = join(targetRoot, `reportes-contables-${createTimestamp()}`)
    await mkdir(packageDirectory, { recursive: true })

    const [businessName, sales, payments, expenses, profit, cashClosure] = await Promise.all([
      settingsService.get('business_name'),
      reportsService.getSales({ from: dto.from, to: dto.to }),
      reportsService.getPaymentSummary({ from: dto.from, to: dto.to }),
      reportsService.getExpenseReport({ from: dto.from, to: dto.to }),
      reportsService.getProfitReport({ from: dto.from, to: dto.to }),
      reportsService.getCashClosureReport({ from: dto.from, to: dto.to, cashSessionId: dto.cashSessionId }),
    ])

    const resolvedBusinessName = businessName ?? 'Full Gas Gastrobar'
    const rangeLabel = `Rango: ${dto.from} a ${dto.to}`

    const salesTotal = sales.reduce((acc, row) => acc + Number((row as { total?: number }).total ?? 0), 0)
    const salesReceipts = sales.reduce((acc, row) => acc + Number((row as { receipts?: number }).receipts ?? 0), 0)
    const paymentTotal = payments.reduce((acc, row) => acc + Number((row as { total?: number }).total ?? 0), 0)
    const expensesTotal = expenses.reduce((acc, row) => acc + Number((row as { total?: number }).total ?? 0), 0)
    const cashSessions = cashClosure.sessions as Array<Record<string, unknown>>
    const cashSalesTotal = cashSessions.reduce((acc, row) => acc + Number(row.total_sales ?? 0), 0)

    const files: PdfPackageFile[] = [
      {
        key: 'ventas',
        path: join(packageDirectory, 'ventas.pdf'),
      },
      {
        key: 'pagos',
        path: join(packageDirectory, 'pagos.pdf'),
      },
      {
        key: 'gastos',
        path: join(packageDirectory, 'gastos.pdf'),
      },
      {
        key: 'utilidad',
        path: join(packageDirectory, 'utilidad.pdf'),
      },
      {
        key: 'cierre_caja',
        path: join(packageDirectory, 'cierre_caja.pdf'),
      },
    ]

    const documents = [
      {
        file: files[0],
        html: buildDocumentHtml({
          businessName: resolvedBusinessName,
          title: 'Reporte de ventas',
          subtitle: rangeLabel,
          summaryItems: [
            { label: 'Ventas totales', value: formatCurrency(salesTotal) },
            { label: 'Cuentas cerradas', value: String(salesReceipts) },
            { label: 'Promedio por cuenta', value: salesReceipts > 0 ? formatCurrency(salesTotal / salesReceipts) : formatCurrency(0) },
          ],
          tableHeaders: ['Fecha', 'Recibos', 'Subtotal', 'Servicio', 'Total'],
          tableRows: sales.map((row) => {
            const casted = row as Record<string, unknown>
            return [
              String(casted.date ?? ''),
              String(casted.receipts ?? 0),
              formatCurrency(Number(casted.subtotal ?? 0)),
              formatCurrency(Number(casted.service ?? 0)),
              formatCurrency(Number(casted.total ?? 0)),
            ]
          }),
        }),
      },
      {
        file: files[1],
        html: buildDocumentHtml({
          businessName: resolvedBusinessName,
          title: 'Reporte de pagos',
          subtitle: rangeLabel,
          summaryItems: [
            { label: 'Total recaudado', value: formatCurrency(paymentTotal) },
            { label: 'Metodos usados', value: String(payments.length) },
            {
              label: 'Transacciones',
              value: String(payments.reduce((acc, row) => acc + Number((row as { transactions?: number }).transactions ?? 0), 0)),
            },
          ],
          tableHeaders: ['Metodo', 'Codigo', 'Transacciones', 'Cambio', 'Total'],
          tableRows: payments.map((row) => {
            const casted = row as Record<string, unknown>
            return [
              String(casted.method ?? ''),
              String(casted.code ?? ''),
              String(casted.transactions ?? 0),
              formatCurrency(Number(casted.change_given ?? 0)),
              formatCurrency(Number(casted.total ?? 0)),
            ]
          }),
        }),
      },
      {
        file: files[2],
        html: buildDocumentHtml({
          businessName: resolvedBusinessName,
          title: 'Reporte de gastos',
          subtitle: rangeLabel,
          summaryItems: [
            { label: 'Total gastos', value: formatCurrency(expensesTotal) },
            { label: 'Categorias', value: String(expenses.length) },
            {
              label: 'Registros',
              value: String(expenses.reduce((acc, row) => acc + Number((row as { count?: number }).count ?? 0), 0)),
            },
          ],
          tableHeaders: ['Categoria', 'Registros', 'Total'],
          tableRows: expenses.map((row) => {
            const casted = row as Record<string, unknown>
            return [
              String(casted.category ?? ''),
              String(casted.count ?? 0),
              formatCurrency(Number(casted.total ?? 0)),
            ]
          }),
        }),
      },
      {
        file: files[3],
        html: buildDocumentHtml({
          businessName: resolvedBusinessName,
          title: 'Reporte de utilidad',
          subtitle: rangeLabel,
          summaryItems: [
            { label: 'Ventas brutas', value: formatCurrency(profit.totalSales) },
            { label: 'Utilidad bruta', value: formatCurrency(profit.grossProfit) },
            { label: 'Utilidad neta', value: formatCurrency(profit.netProfit) },
          ],
          tableHeaders: ['Indicador', 'Valor'],
          tableRows: [
            ['Ventas brutas', formatCurrency(profit.totalSales)],
            ['Costo de productos', formatCurrency(profit.totalCost)],
            ['Utilidad bruta', formatCurrency(profit.grossProfit)],
            ['Gastos operativos', formatCurrency(profit.totalExpenses)],
            ['Utilidad neta', formatCurrency(profit.netProfit)],
            ['Margen bruto', `${Number(profit.grossMargin ?? 0).toFixed(2)}%`],
          ],
        }),
      },
      {
        file: files[4],
        html: buildDocumentHtml({
          businessName: resolvedBusinessName,
          title: 'Reporte de cierre de caja',
          subtitle: dto.cashSessionId ? `Sesion de caja #${dto.cashSessionId}` : rangeLabel,
          summaryItems: [
            { label: 'Sesiones', value: String(cashSessions.length) },
            { label: 'Ventas registradas', value: formatCurrency(cashSalesTotal) },
            {
              label: 'Gastos asociados',
              value: formatCurrency(
                (cashClosure.expenses as Array<Record<string, unknown>>).reduce(
                  (acc, row) => acc + Number(row.total_expenses ?? 0),
                  0
                )
              ),
            },
          ],
          tableHeaders: ['Sesion', 'Apertura', 'Cierre', 'Estado', 'Ventas', 'Gastos'],
          tableRows: cashSessions.map((row) => {
            const expenseRow = (cashClosure.expenses as Array<Record<string, unknown>>).find(
              (item) => Number(item.session_id ?? 0) === Number(row.id ?? 0)
            )

            return [
              `#${String(row.id ?? '')}`,
              String(row.opened_at ?? ''),
              String(row.closed_at ?? '-'),
              String(row.status ?? ''),
              formatCurrency(Number(row.total_sales ?? 0)),
              formatCurrency(Number(expenseRow?.total_expenses ?? 0)),
            ]
          }),
          footerNote: 'Incluye resumen por sesion de caja; el detalle por metodo queda auditado en la base de datos.',
        }),
      },
    ]

    for (const document of documents) {
      await renderPdfToFile(document.file.path, document.html)
    }

    await auditLog({
      userId: ctx.userId,
      username: ctx.username,
      roleName: ctx.roleName,
      action: 'EXPORT_REPORT_PDF',
      module: 'reports',
      description: 'Paquete PDF contable exportado',
      sessionId: ctx.sessionId,
      deviceInfo: ctx.deviceInfo ?? undefined,
      ipAddress: ctx.ipAddress ?? undefined,
      details: {
        from: dto.from,
        to: dto.to,
        cashSessionId: dto.cashSessionId ?? null,
        directory: packageDirectory,
        files: files.map((file) => file.key),
      },
    })

    return {
      success: true,
      data: {
        directory: packageDirectory,
        files,
      },
    }
  }

  private async promptDirectory(): Promise<string | null> {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const response = await dialog.showOpenDialog(targetWindow ?? undefined, {
      title: 'Selecciona la carpeta destino para los PDFs contables',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('documents'),
    })

    if (response.canceled || !response.filePaths[0]) return null
    return response.filePaths[0]
  }
}

export const reportExportService = new ReportExportService()

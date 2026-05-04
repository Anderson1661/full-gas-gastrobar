import { BrowserWindow } from 'electron'
import type { Order, Receipt } from '@shared/types/entities'

interface PrintOptions {
  silent?: boolean
  copies?: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)
}

function buildBarTicketHtml(items: Order['items'], tableNumber: number, waiterName: string): string {
  const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  const rows = (items ?? [])
    .filter(i => i.status === 'active' && !i.sentToBar)
    .map(i => `<tr><td>${i.quantity}</td><td>${i.productName}</td><td>${i.notes ?? ''}</td></tr>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: monospace; font-size: 14px; width: 280px; margin: 0; padding: 8px; }
  h2 { text-align: center; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 4px; border-bottom: 1px dotted #ccc; }
  .footer { text-align: center; margin-top: 8px; font-size: 11px; }
</style>
</head>
<body>
  <h2>FULL GAS GASTROBAR</h2>
  <p>COMANDA - BARRA</p>
  <p>Mesa: <strong>${tableNumber}</strong> | Mesero: ${waiterName}</p>
  <p>${now}</p>
  <hr>
  <table>
    <tr><th>Cant</th><th>Producto</th><th>Nota</th></tr>
    ${rows}
  </table>
  <div class="footer">--- FIN DE COMANDA ---</div>
</body>
</html>`
}

function buildReceiptHtml(receipt: Receipt, order: Order, businessName: string): string {
  const now = new Date(receipt.issuedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  const items = (order.items ?? [])
    .filter(i => i.status === 'active')
    .map(i => `
      <tr>
        <td>${i.quantity}</td>
        <td>${i.productName}</td>
        <td style="text-align:right">${formatCurrency(i.unitPrice)}</td>
        <td style="text-align:right">${formatCurrency(i.subtotal)}</td>
      </tr>
    `).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: monospace; font-size: 13px; width: 300px; margin: 0; padding: 8px; }
  h2 { text-align: center; font-size: 16px; margin: 4px 0; }
  .center { text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; }
  .total-row { font-weight: bold; border-top: 1px solid #000; }
  hr { border-top: 1px dashed #000; }
</style>
</head>
<body>
  <h2>${businessName}</h2>
  <p class="center">COMPROBANTE INTERNO</p>
  <p class="center">N° ${receipt.receiptNumber}</p>
  <p>Mesa: ${order.tableNumber} | Mesero: ${order.waiterName}</p>
  <p>${now}</p>
  <hr>
  <table>
    <tr><th>Cant</th><th>Producto</th><th>P.Unit</th><th>Total</th></tr>
    ${items}
  </table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(receipt.subtotal)}</td></tr>
    ${receipt.serviceCharge > 0
      ? `<tr><td>Servicio (5%)</td><td style="text-align:right">${formatCurrency(receipt.serviceCharge)}</td></tr>`
      : ''}
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${formatCurrency(receipt.total)}</td></tr>
    <tr><td>Pagado</td><td style="text-align:right">${formatCurrency(receipt.totalPaid)}</td></tr>
    ${receipt.changeGiven > 0
      ? `<tr><td>Cambio</td><td style="text-align:right">${formatCurrency(receipt.changeGiven)}</td></tr>`
      : ''}
  </table>
  <hr>
  <p class="center">¡Gracias por su visita!</p>
</body>
</html>`
}

export async function printBarTicket(order: Order, opts: PrintOptions = {}): Promise<void> {
  const html = buildBarTicketHtml(order.items ?? [], order.tableNumber, order.waiterName)
  await printHtml(html, opts)
}

export async function printReceipt(receipt: Receipt, order: Order, businessName: string, opts: PrintOptions = {}): Promise<void> {
  const html = buildReceiptHtml(receipt, order, businessName)
  await printHtml(html, opts)
}

async function printHtml(html: string, opts: PrintOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    win.webContents.once('did-finish-load', () => {
      win.webContents.print(
        { silent: opts.silent ?? true, copies: opts.copies ?? 1 },
        (success, reason) => {
          win.destroy()
          if (success) resolve()
          else reject(new Error(`Error de impresión: ${reason}`))
        }
      )
    })
  })
}

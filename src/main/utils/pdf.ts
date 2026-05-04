import { BrowserWindow } from 'electron'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export async function renderPdfToFile(outputPath: string, html: string): Promise<void> {
  // Write HTML to a temp file so loadFile() can handle arbitrary sizes
  // (data: URIs are URL-length-limited and fail silently for large payloads)
  const tempPath = join(
    tmpdir(),
    `fg_pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.html`
  )
  await writeFile(tempPath, html, 'utf-8')

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  try {
    await win.loadFile(tempPath)

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      margins: { marginType: 'default' },
    })

    await writeFile(outputPath, pdfBuffer)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await unlink(tempPath).catch(() => {})
  }
}

import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { config } from 'dotenv'
import { closeDatabase } from './database/connection'
import { registerSetupIpc, tryNormalBoot } from './ipc/setup.ipc'
import { getEnvPath } from './setup/bootstrap'
import { getBranding } from './services/branding.service'
import { registerBrandingIpc } from './ipc/branding.ipc'
import { registerThemeIpc } from './ipc/theme.ipc'
import { registerAutoBackupIpc } from './ipc/auto-backup.ipc'
import { registerHistoryIpc } from './ipc/history.ipc'
import { startAutoBackupScheduler, stopAutoBackupScheduler } from './services/auto-backup.service'
import { setupAutoUpdater, onUpdateEvent } from './services/updater.service'

let mainWindow: BrowserWindow | null = null

function applyBrandingToWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const branding = getBranding()
  mainWindow.setTitle(branding.businessName)
  if (branding.logoDataUrl) {
    try {
      mainWindow.setIcon(nativeImage.createFromDataURL(branding.logoDataUrl))
    } catch { /* ignore — bad image format */ }
  }
}

function createWindow(): void {
  const branding = getBranding()
  mainWindow = new BrowserWindow({
    width:             1280,
    height:            800,
    minWidth:          1024,
    minHeight:         700,
    show:              false,
    autoHideMenuBar:   true,
    title:             branding.businessName,
    webPreferences: {
      preload:          join(__dirname, '../preload/index.js'),
      sandbox:          false,
      contextIsolation: true,
      nodeIntegration:  false,
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function notifyRendererReady(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:db-ready')
  }
  startAutoBackupScheduler()
}

function notifyNeedsAdmin(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:needs-admin')
  }
}

function notifyNeedsLicense(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:needs-license')
  }
}

function notifyLicenseExpired(expiresAt: string, planLabel: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:license-expired', { expiresAt, planLabel })
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.fullgas.gastrobar')

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  // Register setup IPC before anything else — does not need DB
  registerSetupIpc(notifyRendererReady)

  // Theme IPC — persist appearance preferences
  registerThemeIpc()

  // Auto-backup IPC
  registerAutoBackupIpc()

  // History / closed orders IPC
  registerHistoryIpc()

  // Branding IPC — update window title/icon live when saved
  registerBrandingIpc((b) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(b.businessName)
      if (b.logoDataUrl) {
        try { mainWindow.setIcon(nativeImage.createFromDataURL(b.logoDataUrl)) } catch { /* ignore */ }
      }
    }
  })

  // Open a URL in the system default browser
  ipcMain.handle('shell:open-external', (_, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url)
    }
  })

  // Allow renderer to request app restart after setup completes
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  // Auto-updater: route events to renderer
  setupAutoUpdater()
  onUpdateEvent((event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`update:${event}`, payload)
    }
  })

  const envPath = getEnvPath()
  const hasEnv  = existsSync(envPath)

  if (hasEnv) {
    // Load credentials from userData/.env
    config({ path: envPath })
  }
  // Dev fallback
  if (is.dev) config()

  // Create the window immediately — renderer decides what to show
  createWindow()

  if (hasEnv) {
    // Attempt normal DB boot in background; renderer will receive 'app:db-ready'
    const { ok, error } = await tryNormalBoot(notifyRendererReady, notifyNeedsAdmin, notifyNeedsLicense, notifyLicenseExpired)
    if (!ok) {
      console.error('[App] DB init failed:', error)
      // Send error to renderer so it can offer reconfiguration
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.on('did-finish-load', () => {
          mainWindow?.webContents.send('app:db-error', error)
        })
      }
    }
  }
  // If no .env the renderer detects via setup:get-status and shows the wizard

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  stopAutoBackupScheduler()
  await closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

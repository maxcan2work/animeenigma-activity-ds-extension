import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  Tray,
  Menu,
  nativeImage,
  shell,
  Notification,
} from 'electron'
import { startBridge, stopBridge, getBridgeStatus } from 'animeenigma-discord-bridge'
import { loadConfig } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SITE_URL = 'https://animeenigma.org'

/** @type {import('electron').Tray | null} */
let tray = null
/** @type {ReturnType<typeof loadConfig> | null} */
let config = null
let bridgeError = ''
let healthTimer = null
let isQuitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const where = process.platform === 'darwin' ? 'menu bar' : 'system tray'
    if (Notification.isSupported()) {
      new Notification({
        title: 'AnimeEnigma Presence',
        body: `Already running in the ${where}.`,
      }).show()
    }
  })

  function iconPath() {
    const candidates = [
      path.resolve(__dirname, '../assets/tray.png'),
      path.resolve(__dirname, '../../extension/icons/icon-48.png'),
      path.resolve(__dirname, '../../assets/logo-mark.png'),
    ]
    for (const p of candidates) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return p
    }
    return candidates[0]
  }

  function statusLabel() {
    if (bridgeError) return 'Error'
    const st = getBridgeStatus()
    if (!st.running) return 'Starting…'
    if (st.discord) return 'Connected'
    return 'Discord not ready'
  }

  function tooltipText() {
    const label = statusLabel()
    const port = config?.port ?? 3847
    return `AnimeEnigma Presence — ${label} (port ${port})`
  }

  function rebuildMenu() {
    if (!tray) return
    const label = statusLabel()
    tray.setToolTip(tooltipText())
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Status: ${label}`, enabled: false },
        { type: 'separator' },
        {
          label: 'Open AnimeEnigma',
          click: () => {
            void shell.openExternal(SITE_URL)
          },
        },
        {
          label: 'Open config folder',
          click: () => {
            if (config?.userConfigPath) {
              shell.showItemInFolder(config.userConfigPath)
            } else {
              shell.openPath(app.getPath('userData'))
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.quit()
          },
        },
      ]),
    )
  }

  async function bootBridge() {
    config = loadConfig()
    bridgeError = ''

    if (!config.discordClientId) {
      bridgeError = 'missing Client ID'
      rebuildMenu()
      console.error(
        `[companion] No Discord Client ID. Edit ${config.userConfigPath} and set discordClientId (Developer Portal → Application ID).`,
      )
      return
    }

    try {
      await startBridge({
        clientId: config.discordClientId,
        port: config.port,
        apiKey: config.apiKey,
        apiBase: config.apiBase,
        largeImageKey: config.largeImageKey,
      })
    } catch (err) {
      bridgeError = err.message || String(err)
      console.error('[companion] bridge failed:', bridgeError)
    }
    rebuildMenu()
  }

  function startHealthPoll() {
    clearInterval(healthTimer)
    healthTimer = setInterval(() => {
      rebuildMenu()
    }, 2000)
  }

  app.whenReady().then(async () => {
    if (process.platform === 'darwin' && app.dock) {
      app.dock.hide()
    }

    const img = nativeImage.createFromPath(iconPath())
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 18, height: 18 }))
    rebuildMenu()

    await bootBridge()
    startHealthPoll()
  })

  app.on('before-quit', (event) => {
    if (isQuitting) return
    isQuitting = true
    if (healthTimer) {
      clearInterval(healthTimer)
      healthTimer = null
    }
    event.preventDefault()
    void stopBridge()
      .catch(() => {})
      .finally(() => {
        app.exit(0)
      })
  })

  app.on('window-all-closed', (e) => {
    e.preventDefault()
  })
}

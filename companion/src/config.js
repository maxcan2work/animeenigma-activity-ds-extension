import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULTS = {
  discordClientId: '',
  port: 3847,
  apiKey: '',
  largeImageKey: 'logo',
  apiBase: 'https://animeenigma.org',
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function packagedExamplePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'config.example.json')
  }
  return path.resolve(__dirname, '../config.example.json')
}

function bundledDefaults() {
  return readJsonFile(packagedExamplePath()) || {}
}

/**
 * Load companion config.
 * Precedence: process env → userData/config.json → bundled example → hard-coded defaults.
 * On first run, seeds userData/config.json from the example (and optional build-time Client ID).
 */
export function loadConfig() {
  const userDataDir = app.getPath('userData')
  const userConfigPath = path.join(userDataDir, 'config.json')
  const example = bundledDefaults()
  const seededClientId = String(
    process.env.DISCORD_CLIENT_ID || example.discordClientId || '',
  ).trim()

  if (!fs.existsSync(userConfigPath)) {
    fs.mkdirSync(userDataDir, { recursive: true })
    const seed = {
      ...DEFAULTS,
      ...example,
      discordClientId: seededClientId,
    }
    fs.writeFileSync(userConfigPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
  }

  const file = readJsonFile(userConfigPath) || {}

  const discordClientId = String(
    process.env.DISCORD_CLIENT_ID?.trim() ||
      file.discordClientId ||
      example.discordClientId ||
      DEFAULTS.discordClientId,
  ).trim()

  const port = Number(
    process.env.BRIDGE_PORT || file.port || example.port || DEFAULTS.port,
  )

  const apiKey = String(
    process.env.ANIMEENIGMA_API_KEY?.trim() ||
      file.apiKey ||
      example.apiKey ||
      DEFAULTS.apiKey,
  ).trim()

  const largeImageKey = String(
    process.env.DISCORD_LARGE_IMAGE_KEY?.trim() ||
      file.largeImageKey ||
      example.largeImageKey ||
      DEFAULTS.largeImageKey,
  ).trim()

  const apiBase = String(
    process.env.ANIMEENIGMA_API_BASE?.trim() ||
      file.apiBase ||
      example.apiBase ||
      DEFAULTS.apiBase,
  )
    .trim()
    .replace(/\/$/, '')

  return {
    discordClientId,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULTS.port,
    apiKey,
    largeImageKey,
    apiBase,
    userConfigPath,
  }
}

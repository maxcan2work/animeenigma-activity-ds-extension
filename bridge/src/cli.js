import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { startBridge, stopBridge } from './server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

async function main() {
  try {
    await startBridge({
      clientId: process.env.DISCORD_CLIENT_ID,
      port: process.env.BRIDGE_PORT,
      largeImageKey: process.env.DISCORD_LARGE_IMAGE_KEY,
      apiKey: process.env.ANIMEENIGMA_API_KEY,
      apiBase: process.env.ANIMEENIGMA_API_BASE,
    })
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}

async function shutdown() {
  await stopBridge()
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown()
})
process.on('SIGTERM', () => {
  void shutdown()
})

void main()

#!/usr/bin/env node
/**
 * Bake DISCORD_CLIENT_ID into companion/config.example.json before packaging.
 * Used by CI so end-user builds ship with the shared Application ID.
 *
 * Usage: DISCORD_CLIENT_ID=... node companion/scripts/bake-client-id.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'config.example.json')
const clientId = String(process.env.DISCORD_CLIENT_ID || '').trim()

if (!clientId) {
  console.error(
    '[bake-client-id] DISCORD_CLIENT_ID is missing. Add it as a GitHub Actions secret (or export locally before pack).',
  )
  process.exit(1)
}

if (!/^\d{17,20}$/.test(clientId)) {
  console.error(
    '[bake-client-id] DISCORD_CLIENT_ID looks invalid (expected Discord snowflake digits).',
  )
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
config.discordClientId = clientId
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
console.log(`[bake-client-id] wrote discordClientId into ${configPath}`)

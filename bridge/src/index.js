import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import DiscordRPC from 'discord-rpc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim()
const PORT = Number(process.env.BRIDGE_PORT || 3847)
const LARGE_IMAGE_KEY = process.env.DISCORD_LARGE_IMAGE_KEY?.trim() || ''
const API_KEY = process.env.ANIMEENIGMA_API_KEY?.trim() || ''
const API_BASE = (process.env.ANIMEENIGMA_API_BASE || 'https://animeenigma.org').replace(/\/$/, '')

if (!CLIENT_ID) {
  console.error('[bridge] DISCORD_CLIENT_ID is missing. Copy .env.example → .env and paste your Application ID.')
  process.exit(1)
}

DiscordRPC.register(CLIENT_ID)

let rpc = new DiscordRPC.Client({ transport: 'ipc' })
let rpcReady = false
let rpcConnecting = false

/** @type {null | { type: string, details: string, state?: string, url?: string, startTimestamp?: number, largeImageText?: string, source: string }} */
let pageContext = null
/** @type {null | object} */
let apiActivity = null

let lastFingerprint = ''
let pageStaleTimer = null
let reconcileTimer = null

const ACTIVITY_TYPE = {
  playing: 0,
  watching: 3,
  competing: 5,
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function animeTitle(anime) {
  if (!anime) return 'Anime'
  return anime.name || anime.name_ru || anime.name_jp || anime.title || 'Anime'
}

function formatWatchState(snap) {
  const parts = []
  if (snap.episode_number != null) parts.push(`Episode ${snap.episode_number}`)
  if (snap.position_seconds != null && snap.duration_seconds) {
    const pos = Math.max(0, Math.floor(snap.position_seconds))
    const dur = Math.max(1, Math.floor(snap.duration_seconds))
    const pct = Math.min(99, Math.floor((pos / dur) * 100))
    parts.push(`${pct}%`)
  }
  return parts.join(' · ') || 'Watching'
}

function presenceFromApi(snap) {
  if (!snap || snap.state !== 'watching' || !snap.is_live) return null
  const title = animeTitle(snap.anime)
  const animeId = snap.anime?.id
  return {
    type: 'watching',
    details: title,
    state: formatWatchState(snap),
    url: animeId ? `${API_BASE}/anime/${animeId}` : API_BASE,
    largeImageText: title,
    startTimestamp: snap.updated_at ? Date.parse(snap.updated_at) || Date.now() : Date.now(),
    source: 'api',
  }
}

function resolvePresence() {
  const fromApi = presenceFromApi(apiActivity)
  if (fromApi) return fromApi
  if (pageContext) return pageContext
  return null
}

function buildDiscordActivity(payload) {
  const typeKey = String(payload.type || 'playing').toLowerCase()
  const start = payload.startTimestamp || Date.now()
  const activity = {
    details: String(payload.details || 'AnimeEnigma').slice(0, 128),
    state: payload.state ? String(payload.state).slice(0, 128) : undefined,
    timestamps: { start: Math.round(start) },
    instance: false,
    // discord-rpc's setActivity() drops `type`; we send via request() instead
    type: ACTIVITY_TYPE[typeKey] ?? ACTIVITY_TYPE.playing,
  }

  if (LARGE_IMAGE_KEY) {
    activity.assets = {
      large_image: LARGE_IMAGE_KEY,
      large_text: String(payload.largeImageText || 'AnimeEnigma').slice(0, 128),
    }
  }

  if (payload.url && /^https:\/\/([a-z0-9-]+\.)?animeenigma\.org([/:?]|$)/i.test(payload.url)) {
    activity.buttons = [{ label: 'Open on AnimeEnigma', url: payload.url }]
  }

  return activity
}

async function setDiscordActivity(activity) {
  // Use raw SET_ACTIVITY so Activity Type (Watching / Playing) is preserved.
  try {
    await rpc.request('SET_ACTIVITY', { pid: process.pid, activity })
  } catch (err) {
    // Buttons can fail on unverified apps — retry without them.
    if (activity.buttons) {
      const { buttons: _b, ...rest } = activity
      await rpc.request('SET_ACTIVITY', { pid: process.pid, activity: rest })
      return
    }
    throw err
  }
}

async function applyPresence() {
  if (!rpcReady) return { ok: false, error: 'Discord RPC not connected' }

  const resolved = resolvePresence()
  if (!resolved) {
    if (lastFingerprint) {
      lastFingerprint = ''
      await rpc.clearActivity()
      console.log('[bridge] presence cleared')
    }
    return { ok: true, cleared: true }
  }

  const activity = buildDiscordActivity(resolved)
  const fingerprint = JSON.stringify({
    type: activity.type,
    details: activity.details,
    state: activity.state,
    url: resolved.url || null,
    source: resolved.source || null,
  })

  if (fingerprint === lastFingerprint) {
    return { ok: true, skipped: true, source: resolved.source }
  }

  lastFingerprint = fingerprint
  await setDiscordActivity(activity)
  console.log(
    `[bridge] presence ← ${resolved.source}: ${resolved.type} | ${resolved.details}${resolved.state ? ` / ${resolved.state}` : ''}`,
  )
  return { ok: true, source: resolved.source, activity }
}

function scheduleReconcile(ms = 50) {
  clearTimeout(reconcileTimer)
  reconcileTimer = setTimeout(() => {
    applyPresence().catch((err) => console.error('[bridge] apply error:', err.message))
  }, ms)
}

function unwrapEnvelope(json) {
  if (json && typeof json === 'object' && 'data' in json) return json.data
  return json
}

async function fetchCurrentActivity() {
  if (!API_KEY) return null
  const res = await fetch(`${API_BASE}/api/users/me/activity/current`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`activity/current HTTP ${res.status}`)
  }
  return unwrapEnvelope(await res.json())
}

function parseSseChunk(buffer, onEvent) {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  for (const block of parts) {
    let event = 'message'
    const dataLines = []
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) continue
    const raw = dataLines.join('\n')
    try {
      onEvent(event, JSON.parse(raw))
    } catch {
      /* ignore malformed frames */
    }
  }
  return rest
}

async function runActivityStream() {
  if (!API_KEY) {
    console.log('[bridge] ANIMEENIGMA_API_KEY not set — watch presence will use page DOM only')
    return
  }

  let backoff = 1000
  for (;;) {
    try {
      console.log('[bridge] connecting to AnimeEnigma activity SSE…')
      const res = await fetch(`${API_BASE}/api/users/me/activity/stream`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'text/event-stream',
        },
      })
      if (!res.ok || !res.body) {
        throw new Error(`SSE HTTP ${res.status}`)
      }

      backoff = 1000
      console.log('[bridge] activity SSE connected')

      // Seed from snapshot once connected
      try {
        apiActivity = await fetchCurrentActivity()
        scheduleReconcile()
      } catch (err) {
        console.warn('[bridge] snapshot seed failed:', err.message)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        buf = parseSseChunk(buf, (event, data) => {
          if (event !== 'activity') return
          apiActivity = data
          scheduleReconcile()
        })
      }

      throw new Error('SSE ended')
    } catch (err) {
      console.warn(`[bridge] activity SSE error: ${err.message}; retry in ${backoff}ms`)
      await new Promise((r) => setTimeout(r, backoff))
      backoff = Math.min(backoff * 2, 30_000)

      // Poll while reconnecting
      try {
        apiActivity = await fetchCurrentActivity()
        scheduleReconcile()
      } catch {
        /* ignore */
      }
    }
  }
}

// Fallback poll if SSE is flaky (also useful without long-lived streams)
async function pollActivityLoop() {
  if (!API_KEY) return
  for (;;) {
    await new Promise((r) => setTimeout(r, 45_000))
    try {
      apiActivity = await fetchCurrentActivity()
      scheduleReconcile()
    } catch {
      /* ignore */
    }
  }
}

const server = http.createServer(async (req, res) => {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        discord: rpcReady,
        apiKey: Boolean(API_KEY),
        apiWatching: Boolean(presenceFromApi(apiActivity)),
        hasPageContext: Boolean(pageContext),
      }),
    )
    return
  }

  if (req.method === 'POST' && url.pathname === '/activity') {
    try {
      const body = await readJson(req)

      if (body.clear) {
        pageContext = null
        clearTimeout(pageStaleTimer)
        const result = await applyPresence()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
      }

      pageContext = {
        type: body.type || 'playing',
        details: body.details || 'AnimeEnigma',
        state: body.state,
        url: body.url,
        largeImageText: body.largeImageText,
        startTimestamp: body.startTimestamp || Date.now(),
        source: 'extension',
      }

      clearTimeout(pageStaleTimer)
      pageStaleTimer = setTimeout(() => {
        pageContext = null
        scheduleReconcile()
        console.log('[bridge] page context stale')
      }, 90_000)

      const result = await applyPresence()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      console.error('[bridge] /activity error:', err.message)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
})

function attachRpcHandlers(client) {
  client.on('ready', () => {
    rpcReady = true
    rpcConnecting = false
    console.log(`[bridge] Discord RPC ready (app ${CLIENT_ID})`)
    scheduleReconcile()
  })

  client.on('disconnected', () => {
    if (!rpcReady && !rpcConnecting) return
    rpcReady = false
    console.warn('[bridge] Discord RPC disconnected — will retry')
    scheduleRpcReconnect(2000)
  })
}

async function connectRpc() {
  if (rpcReady || rpcConnecting) return
  rpcConnecting = true
  try {
    await rpc.login({ clientId: CLIENT_ID })
  } catch (err) {
    rpcReady = false
    rpcConnecting = false
    console.error(`[bridge] Discord RPC login failed: ${err.message}`)
    try {
      await rpc.destroy()
    } catch {
      /* ignore */
    }
    rpc = new DiscordRPC.Client({ transport: 'ipc' })
    attachRpcHandlers(rpc)
    scheduleRpcReconnect(3000)
  }
}

let rpcRetryTimer = null
function scheduleRpcReconnect(ms) {
  clearTimeout(rpcRetryTimer)
  rpcRetryTimer = setTimeout(() => {
    void connectRpc()
  }, ms)
}

attachRpcHandlers(rpc)

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] listening on http://127.0.0.1:${PORT}`)
  console.log('[bridge] keep Discord Desktop open while using AnimeEnigma')
  void connectRpc()
  void runActivityStream()
  void pollActivityLoop()
})

function shutdown() {
  clearTimeout(rpcRetryTimer)
  server.close()
  rpc.destroy().catch(() => {})
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import DiscordRPC from 'discord-rpc'
import {
  discordActivityType,
  discordStatusDisplayType,
  buildPresenceButtons,
  parseSseChunk,
  presenceFromApi,
  resolvePresence,
  unwrapEnvelope,
  acceptPageActivity,
} from './lib/activity.js'

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

/** Which extension tab currently owns pageContext (cross-window / incognito safe). */
let pageLeader = { id: null, focusedAt: 0 }

let lastFingerprint = ''
let lastDiscordSetAt = 0
let pageStaleTimer = null
let reconcileTimer = null
let rpcRetryTimer = null
/** Sticky elapsed clock for API "watching" so progress heartbeats don't reset Discord. */
let apiWatchStartedAt = null
let apiWatchKey = ''
/**
 * One Discord elapsed clock for the whole presence session.
 * Must stay fixed across tab switches / play-pause / URL noise or Discord freezes/resets the timer.
 */
let discordClockStart = null

function apiActivityKey(snap) {
  if (!snap || snap.state !== 'watching') return ''
  return `${snap.anime?.id || ''}:${snap.episode_number ?? ''}`
}

function withStickyStart(resolved) {
  if (!resolved) {
    apiWatchKey = ''
    apiWatchStartedAt = null
    discordClockStart = null
    return null
  }
  if (resolved.source === 'api') {
    const key = apiActivityKey(apiActivity)
    if (key && key !== apiWatchKey) {
      apiWatchKey = key
      apiWatchStartedAt = Date.now()
    }
    if (!apiWatchStartedAt) apiWatchStartedAt = resolved.startTimestamp || Date.now()
    discordClockStart = apiWatchStartedAt
    return { ...resolved, startTimestamp: discordClockStart }
  }
  apiWatchKey = ''
  apiWatchStartedAt = null
  if (!discordClockStart) {
    discordClockStart = Number(resolved.startTimestamp) || Date.now()
  }
  return { ...resolved, startTimestamp: discordClockStart }
}

function stablePresenceFingerprint(resolved, activity) {
  let urlKey = ''
  try {
    const u = new URL(resolved.url || '')
    urlKey = u.pathname
    if (/\/anime\//i.test(u.pathname)) {
      urlKey += `?ep=${u.searchParams.get('episode') || u.searchParams.get('ep') || ''}`
    }
  } catch {
    urlKey = resolved.url || ''
  }
  return JSON.stringify({
    type: activity.type,
    details: activity.details,
    state: activity.state,
    urlKey,
    source: resolved.source || null,
    locale: resolved.locale || null,
    buttons: (activity.buttons || []).map((b) => b.url),
  })
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

function buildDiscordActivity(payload) {
  const start = payload.startTimestamp || Date.now()
  const activity = {
    // App name stays AnimeEnigma (Developer Portal). Card lines:
    // details = page header ("На главной"), state = playful line.
    details: String(payload.details || 'AnimeEnigma').slice(0, 128),
    state: payload.state ? String(payload.state).slice(0, 128) : undefined,
    timestamps: { start: Math.round(start) },
    instance: false,
    type: discordActivityType(payload),
    status_display_type: discordStatusDisplayType(payload),
  }

  if (LARGE_IMAGE_KEY) {
    activity.assets = {
      large_image: LARGE_IMAGE_KEY,
    }
    // Only set tooltip when it's useful (anime title). Never default to the
    // app name — some Discord layouts surface large_text as another body line.
    const tip = payload.largeImageText ? String(payload.largeImageText).trim() : ''
    if (tip && !/^animeenigma(\s+game)?$/i.test(tip)) {
      activity.assets.large_text = tip.slice(0, 128)
    }
  }

  const buttons = buildPresenceButtons(payload, API_BASE)
  if (buttons.length) activity.buttons = buttons

  return Object.fromEntries(Object.entries(activity).filter(([, v]) => v !== undefined))
}

async function setDiscordActivity(activity) {
  try {
    await rpc.request('SET_ACTIVITY', { pid: process.pid, activity })
  } catch (err) {
    if (activity.buttons) {
      const { buttons: _b, ...rest } = activity
      await rpc.request('SET_ACTIVITY', { pid: process.pid, activity: rest })
      return
    }
    throw err
  }
}

async function applyPresence({ force = false } = {}) {
  if (!rpcReady) return { ok: false, error: 'Discord RPC not connected' }

  const resolved = withStickyStart(resolvePresence(apiActivity, pageContext, API_BASE))
  if (!resolved) {
    if (lastFingerprint) {
      lastFingerprint = ''
      discordClockStart = null
      await rpc.clearActivity()
      console.log('[bridge] presence cleared')
    }
    return { ok: true, cleared: true }
  }

  const activity = buildDiscordActivity({
    ...resolved,
    // Profile button comes from the extension tab (logged-in user), even when
    // API "watching" wins over page details/state.
    showProfileButton: pageContext?.showProfileButton,
    profileUrl: pageContext?.profileUrl,
    locale: resolved.locale || pageContext?.locale || 'en',
  })
  const fingerprint = stablePresenceFingerprint(resolved, activity)

  // Never re-SET an identical payload — Discord freezes the elapsed timer when
  // SET_ACTIVITY is repeated with the same activity (tab switches / heartbeats).
  // `force` only bypasses the rate limit for *changed* presence (nav / reconnect).
  if (fingerprint === lastFingerprint) {
    return { ok: true, skipped: true, source: resolved.source }
  }

  const now = Date.now()
  const minGap = force ? 200 : 450
  if (now - lastDiscordSetAt < minGap) {
    scheduleReconcile(minGap + 50, force)
    return { ok: true, deferred: true, source: resolved.source }
  }

  lastFingerprint = fingerprint
  lastDiscordSetAt = now
  await setDiscordActivity(activity)
  console.log(
    `[bridge] presence ← ${resolved.source}: type=${activity.type} | ${resolved.details}${resolved.state ? ` / ${resolved.state}` : ''} | since=${activity.timestamps?.start}`,
  )
  return { ok: true, source: resolved.source, activity }
}

function scheduleReconcile(ms = 50, force = false) {
  clearTimeout(reconcileTimer)
  reconcileTimer = setTimeout(() => {
    applyPresence({ force }).catch((err) => console.error('[bridge] apply error:', err.message))
  }, ms)
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

      try {
        apiActivity = await fetchCurrentActivity()
        scheduleReconcile()
      } catch {
        /* ignore */
      }
    }
  }
}

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
        apiWatching: Boolean(presenceFromApi(apiActivity, API_BASE)),
        hasPageContext: Boolean(pageContext),
      }),
    )
    return
  }

  if (req.method === 'POST' && url.pathname === '/activity') {
    try {
      const body = await readJson(req)
      const verdict = acceptPageActivity(pageLeader, body)
      if (!verdict.accept) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, skipped: verdict.reason }))
        return
      }
      pageLeader = verdict.leader

      if (body.clear) {
        pageContext = null
        discordClockStart = null
        clearTimeout(pageStaleTimer)
        const result = await applyPresence({ force: true })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
      }

      pageContext = {
        type: body.type || 'watching',
        details: body.details || 'AnimeEnigma',
        state: body.state,
        url: body.url,
        largeImageText: body.largeImageText,
        startTimestamp: body.startTimestamp || discordClockStart || Date.now(),
        locale: body.locale || 'en',
        showProfileButton: Boolean(body.showProfileButton),
        profileUrl: body.profileUrl,
        tabInstanceId: body.tabInstanceId,
        focusedAt: body.focusedAt,
        source: 'extension',
      }

      clearTimeout(pageStaleTimer)
      // 15m: Chrome heavily throttles background tabs; 90s caused timer resets.
      pageStaleTimer = setTimeout(() => {
        pageContext = null
        pageLeader = { id: null, focusedAt: 0 }
        scheduleReconcile(50, true)
        console.log('[bridge] page context stale')
      }, 15 * 60_000)

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
    // Force re-SET after Discord restart; otherwise we skip as "unchanged"
    // and the client shows no activity / a frozen clock.
    lastFingerprint = ''
    console.log(`[bridge] Discord RPC ready (app ${CLIENT_ID})`)
    scheduleReconcile(50, true)
  })

  client.on('disconnected', () => {
    if (!rpcReady && !rpcConnecting) return
    rpcReady = false
    lastFingerprint = ''
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

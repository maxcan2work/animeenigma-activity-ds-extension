import http from 'node:http'
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

/** Discord silently drops Rich Presence updates faster than ~1 / 15s. */
const DISCORD_SET_MIN_MS = 15_000

/** @type {null | ReturnType<typeof createState>} */
let state = null

function createState(opts) {
  return {
    clientId: opts.clientId,
    port: opts.port,
    largeImageKey: opts.largeImageKey,
    apiKey: opts.apiKey,
    apiBase: opts.apiBase,
    rpc: new DiscordRPC.Client({ transport: 'ipc' }),
    rpcReady: false,
    rpcConnecting: false,
    pageContext: null,
    apiActivity: null,
    pageLeader: { id: null, focusedAt: 0 },
    lastFingerprint: '',
    lastDiscordSetAt: 0,
    pendingActivity: null,
    pendingFingerprint: null,
    pendingSource: null,
    flushTimer: null,
    pageStaleTimer: null,
    reconcileTimer: null,
    rpcRetryTimer: null,
    apiWatchStartedAt: null,
    apiWatchKey: '',
    discordClockStart: null,
    server: null,
    abort: new AbortController(),
    stopped: false,
  }
}

function apiActivityKey(snap) {
  if (!snap || snap.state !== 'watching') return ''
  return `${snap.anime?.id || ''}:${snap.episode_number ?? ''}`
}

function withStickyStart(s, resolved) {
  if (!resolved) {
    s.apiWatchKey = ''
    s.apiWatchStartedAt = null
    s.discordClockStart = null
    return null
  }
  if (resolved.source === 'api') {
    const key = apiActivityKey(s.apiActivity)
    if (key && key !== s.apiWatchKey) {
      s.apiWatchKey = key
      s.apiWatchStartedAt = Date.now()
    }
    if (!s.apiWatchStartedAt) s.apiWatchStartedAt = resolved.startTimestamp || Date.now()
    s.discordClockStart = s.apiWatchStartedAt
    return { ...resolved, startTimestamp: s.discordClockStart }
  }
  s.apiWatchKey = ''
  s.apiWatchStartedAt = null
  if (!s.discordClockStart) {
    s.discordClockStart = Number(resolved.startTimestamp) || Date.now()
  }
  return { ...resolved, startTimestamp: s.discordClockStart }
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

function buildDiscordActivity(s, payload) {
  const start = payload.startTimestamp || Date.now()
  const activity = {
    details: String(payload.details || 'AnimeEnigma').slice(0, 128),
    state: payload.state ? String(payload.state).slice(0, 128) : undefined,
    timestamps: { start: Math.round(start) },
    instance: false,
    type: discordActivityType(payload),
    status_display_type: discordStatusDisplayType(payload),
  }

  if (s.largeImageKey) {
    activity.assets = {
      large_image: s.largeImageKey,
    }
    const tip = payload.largeImageText ? String(payload.largeImageText).trim() : ''
    if (tip && !/^animeenigma(\s+game)?$/i.test(tip)) {
      activity.assets.large_text = tip.slice(0, 128)
    }
  }

  const buttons = buildPresenceButtons(payload, s.apiBase)
  if (buttons.length) activity.buttons = buttons

  return Object.fromEntries(Object.entries(activity).filter(([, v]) => v !== undefined))
}

async function setDiscordActivity(s, activity) {
  try {
    await s.rpc.request('SET_ACTIVITY', { pid: process.pid, activity })
  } catch (err) {
    if (activity.buttons) {
      const { buttons: _b, ...rest } = activity
      await s.rpc.request('SET_ACTIVITY', { pid: process.pid, activity: rest })
      return
    }
    throw err
  }
}

function scheduleFlush(s, ms) {
  clearTimeout(s.flushTimer)
  s.flushTimer = setTimeout(() => {
    flushPendingPresence(s).catch((err) => console.error('[bridge] flush error:', err.message))
  }, Math.max(0, ms))
}

function clearPendingPresence(s) {
  s.pendingActivity = null
  s.pendingFingerprint = null
  s.pendingSource = null
  clearTimeout(s.flushTimer)
  s.flushTimer = null
}

async function flushPendingPresence(s) {
  if (!s.rpcReady || !s.pendingActivity) return { ok: true, skipped: true }

  const now = Date.now()
  const wait = s.lastDiscordSetAt ? DISCORD_SET_MIN_MS - (now - s.lastDiscordSetAt) : 0
  if (wait > 0) {
    scheduleFlush(s, wait + 25)
    return { ok: true, deferred: true, waitMs: wait }
  }

  const activity = s.pendingActivity
  const fingerprint = s.pendingFingerprint
  const source = s.pendingSource
  clearPendingPresence(s)

  s.lastFingerprint = fingerprint
  s.lastDiscordSetAt = Date.now()
  try {
    await setDiscordActivity(s, activity)
  } catch (err) {
    s.pendingActivity = activity
    s.pendingFingerprint = fingerprint
    s.pendingSource = source
    s.lastFingerprint = ''
    s.lastDiscordSetAt = Date.now()
    scheduleFlush(s, DISCORD_SET_MIN_MS)
    throw err
  }

  console.log(
    `[bridge] presence ← ${source || '?'}: type=${activity.type} | ${activity.details}${activity.state ? ` / ${activity.state}` : ''} | since=${activity.timestamps?.start}`,
  )
  return { ok: true, source, activity }
}

async function applyPresence(s, { force = false } = {}) {
  if (!s.rpcReady) return { ok: false, error: 'Discord RPC not connected' }

  const resolved = withStickyStart(s, resolvePresence(s.apiActivity, s.pageContext, s.apiBase))
  if (!resolved) {
    clearPendingPresence(s)
    if (s.lastFingerprint) {
      s.lastFingerprint = ''
      s.discordClockStart = null
      await s.rpc.clearActivity()
      s.lastDiscordSetAt = Date.now()
      console.log('[bridge] presence cleared')
    }
    return { ok: true, cleared: true }
  }

  const activity = buildDiscordActivity(s, {
    ...resolved,
    showProfileButton: s.pageContext?.showProfileButton,
    profileUrl: s.pageContext?.profileUrl,
    locale: resolved.locale || s.pageContext?.locale || 'en',
  })
  const fingerprint = stablePresenceFingerprint(resolved, activity)

  if (fingerprint === s.lastFingerprint && !s.pendingFingerprint) {
    return { ok: true, skipped: true, source: resolved.source }
  }
  if (fingerprint === s.pendingFingerprint) {
    return { ok: true, deferred: true, source: resolved.source }
  }

  s.pendingActivity = activity
  s.pendingFingerprint = fingerprint
  s.pendingSource = resolved.source

  const now = Date.now()
  const wait = s.lastDiscordSetAt ? DISCORD_SET_MIN_MS - (now - s.lastDiscordSetAt) : 0
  if (wait > 0 && s.lastDiscordSetAt > 0) {
    scheduleFlush(s, wait + 25)
    console.log(
      `[bridge] presence queued (${resolved.source}): ${resolved.details}${resolved.state ? ` / ${resolved.state}` : ''} — flush in ${Math.ceil(wait / 1000)}s`,
    )
    return { ok: true, deferred: true, waitMs: wait, source: resolved.source }
  }

  return flushPendingPresence(s)
}

function scheduleReconcile(s, ms = 50, force = false) {
  clearTimeout(s.reconcileTimer)
  s.reconcileTimer = setTimeout(() => {
    applyPresence(s, { force }).catch((err) => console.error('[bridge] apply error:', err.message))
  }, ms)
}

async function fetchCurrentActivity(s) {
  if (!s.apiKey) return null
  const res = await fetch(`${s.apiBase}/api/users/me/activity/current`, {
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      Accept: 'application/json',
    },
    signal: s.abort.signal,
  })
  if (!res.ok) {
    throw new Error(`activity/current HTTP ${res.status}`)
  }
  return unwrapEnvelope(await res.json())
}

async function runActivityStream(s) {
  if (!s.apiKey) {
    console.log('[bridge] ANIMEENIGMA_API_KEY not set — watch presence will use page DOM only')
    return
  }

  let backoff = 1000
  while (!s.stopped) {
    try {
      console.log('[bridge] connecting to AnimeEnigma activity SSE…')
      const res = await fetch(`${s.apiBase}/api/users/me/activity/stream`, {
        headers: {
          Authorization: `Bearer ${s.apiKey}`,
          Accept: 'text/event-stream',
        },
        signal: s.abort.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(`SSE HTTP ${res.status}`)
      }

      backoff = 1000
      console.log('[bridge] activity SSE connected')

      try {
        s.apiActivity = await fetchCurrentActivity(s)
        scheduleReconcile(s)
      } catch (err) {
        if (s.stopped || err.name === 'AbortError') return
        console.warn('[bridge] snapshot seed failed:', err.message)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      for (;;) {
        if (s.stopped) return
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        buf = parseSseChunk(buf, (event, data) => {
          if (event !== 'activity') return
          s.apiActivity = data
          scheduleReconcile(s)
        })
      }

      throw new Error('SSE ended')
    } catch (err) {
      if (s.stopped || err.name === 'AbortError') return
      console.warn(`[bridge] activity SSE error: ${err.message}; retry in ${backoff}ms`)
      await new Promise((r) => {
        const t = setTimeout(r, backoff)
        s.abort.signal.addEventListener('abort', () => {
          clearTimeout(t)
          r()
        }, { once: true })
      })
      if (s.stopped) return
      backoff = Math.min(backoff * 2, 30_000)

      try {
        s.apiActivity = await fetchCurrentActivity(s)
        scheduleReconcile(s)
      } catch {
        /* ignore */
      }
    }
  }
}

async function pollActivityLoop(s) {
  if (!s.apiKey) return
  while (!s.stopped) {
    await new Promise((r) => {
      const t = setTimeout(r, 45_000)
      s.abort.signal.addEventListener('abort', () => {
        clearTimeout(t)
        r()
      }, { once: true })
    })
    if (s.stopped) return
    try {
      s.apiActivity = await fetchCurrentActivity(s)
      scheduleReconcile(s)
    } catch {
      /* ignore */
    }
  }
}

function attachRpcHandlers(s) {
  s.rpc.on('ready', () => {
    if (s.stopped) return
    s.rpcReady = true
    s.rpcConnecting = false
    s.lastFingerprint = ''
    s.lastDiscordSetAt = 0
    clearPendingPresence(s)
    console.log(`[bridge] Discord RPC ready (app ${s.clientId})`)
    scheduleReconcile(s, 50, true)
  })

  s.rpc.on('disconnected', () => {
    if (s.stopped) return
    if (!s.rpcReady && !s.rpcConnecting) return
    s.rpcReady = false
    s.lastFingerprint = ''
    clearPendingPresence(s)
    console.warn('[bridge] Discord RPC disconnected — will retry')
    scheduleRpcReconnect(s, 2000)
  })
}

async function connectRpc(s) {
  if (s.stopped || s.rpcReady || s.rpcConnecting) return
  s.rpcConnecting = true
  try {
    await s.rpc.login({ clientId: s.clientId })
  } catch (err) {
    s.rpcReady = false
    s.rpcConnecting = false
    if (s.stopped) return
    console.error(`[bridge] Discord RPC login failed: ${err.message}`)
    try {
      await s.rpc.destroy()
    } catch {
      /* ignore */
    }
    if (s.stopped) return
    s.rpc = new DiscordRPC.Client({ transport: 'ipc' })
    attachRpcHandlers(s)
    scheduleRpcReconnect(s, 3000)
  }
}

function scheduleRpcReconnect(s, ms) {
  clearTimeout(s.rpcRetryTimer)
  if (s.stopped) return
  s.rpcRetryTimer = setTimeout(() => {
    void connectRpc(s)
  }, ms)
}

function createHttpServer(s) {
  return http.createServer(async (req, res) => {
    cors(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${s.port}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          discord: s.rpcReady,
          apiKey: Boolean(s.apiKey),
          apiWatching: Boolean(presenceFromApi(s.apiActivity, s.apiBase)),
          hasPageContext: Boolean(s.pageContext),
        }),
      )
      return
    }

    if (req.method === 'POST' && url.pathname === '/activity') {
      try {
        const body = await readJson(req)
        const verdict = acceptPageActivity(s.pageLeader, body)
        if (!verdict.accept) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, skipped: verdict.reason }))
          return
        }
        s.pageLeader = verdict.leader

        if (body.clear) {
          s.pageContext = null
          s.discordClockStart = null
          clearTimeout(s.pageStaleTimer)
          const result = await applyPresence(s, { force: true })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
          return
        }

        s.pageContext = {
          type: body.type || 'watching',
          details: body.details || 'AnimeEnigma',
          state: body.state,
          url: body.url,
          largeImageText: body.largeImageText,
          startTimestamp: body.startTimestamp || s.discordClockStart || Date.now(),
          locale: body.locale || 'en',
          showProfileButton: Boolean(body.showProfileButton),
          profileUrl: body.profileUrl,
          tabInstanceId: body.tabInstanceId,
          focusedAt: body.focusedAt,
          source: 'extension',
        }

        clearTimeout(s.pageStaleTimer)
        s.pageStaleTimer = setTimeout(() => {
          s.pageContext = null
          s.pageLeader = { id: null, focusedAt: 0 }
          scheduleReconcile(s, 50, true)
          console.log('[bridge] page context stale')
        }, 15 * 60_000)

        const result = await applyPresence(s, { force: true })
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
}

/**
 * @param {{
 *   clientId?: string,
 *   port?: number,
 *   apiKey?: string,
 *   apiBase?: string,
 *   largeImageKey?: string,
 * }} [options]
 */
export async function startBridge(options = {}) {
  if (state && !state.stopped) {
    throw new Error('[bridge] already running')
  }

  const clientId = String(options.clientId || '').trim()
  if (!clientId) {
    throw new Error(
      '[bridge] DISCORD_CLIENT_ID is missing. Copy .env.example → .env and paste your Application ID.',
    )
  }

  const s = createState({
    clientId,
    port: Number(options.port || 3847),
    largeImageKey: String(options.largeImageKey || '').trim(),
    apiKey: String(options.apiKey || '').trim(),
    apiBase: String(options.apiBase || 'https://animeenigma.org').replace(/\/$/, ''),
  })
  state = s

  try {
    DiscordRPC.register(s.clientId)
  } catch (err) {
    console.warn(`[bridge] DiscordRPC.register skipped: ${err.message}`)
  }
  attachRpcHandlers(s)
  s.server = createHttpServer(s)

  await new Promise((resolve, reject) => {
    s.server.once('error', reject)
    s.server.listen(s.port, '127.0.0.1', () => {
      s.server.off('error', reject)
      resolve()
    })
  })

  console.log(`[bridge] listening on http://127.0.0.1:${s.port}`)
  console.log('[bridge] keep Discord Desktop open while using AnimeEnigma')
  void connectRpc(s)
  void runActivityStream(s)
  void pollActivityLoop(s)

  return {
    port: s.port,
    getStatus: () => getBridgeStatus(),
  }
}

export async function stopBridge() {
  const s = state
  if (!s || s.stopped) return

  s.stopped = true
  s.abort.abort()
  clearTimeout(s.flushTimer)
  clearTimeout(s.pageStaleTimer)
  clearTimeout(s.reconcileTimer)
  clearTimeout(s.rpcRetryTimer)
  clearPendingPresence(s)

  await new Promise((resolve) => {
    if (!s.server) {
      resolve()
      return
    }
    s.server.close(() => resolve())
  })

  try {
    if (s.rpcReady) await s.rpc.clearActivity()
  } catch {
    /* ignore */
  }
  try {
    await s.rpc.destroy()
  } catch {
    /* ignore */
  }

  s.rpcReady = false
  s.rpcConnecting = false
  state = null
  console.log('[bridge] stopped')
}

export function getBridgeStatus() {
  const s = state
  if (!s || s.stopped) {
    return { running: false, discord: false, port: null }
  }
  return {
    running: true,
    discord: s.rpcReady,
    port: s.port,
    apiKey: Boolean(s.apiKey),
    apiWatching: Boolean(presenceFromApi(s.apiActivity, s.apiBase)),
    hasPageContext: Boolean(s.pageContext),
  }
}

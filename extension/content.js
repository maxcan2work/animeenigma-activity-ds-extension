(() => {
  const HEARTBEAT_MS = 20_000
  const DEBOUNCE_MS = 350
  const NAV_DEBOUNCE_MS = 40
  const API_BASE = location.origin
  const SESSION_START_KEY = 'ae-discord-session-start'

  let lastSent = ''
  let lastIdentity = ''
  let startTimestamp = readSessionStart()
  let debounceTimer = null
  let lastPayload = null
  let locale = 'en'
  let showProfileButton = false
  /** @type {Map<string, { names: Record<string, string>, raw?: object, fetchedAt: number }>} */
  const animeCache = new Map()

  async function refreshSettings() {
    try {
      const stored = await chrome.storage.sync.get({ locale: 'en', showProfileButton: false })
      locale = globalThis.AeI18n.normalizeLocale(stored.locale)
      showProfileButton = Boolean(stored.showProfileButton)
    } catch {
      locale = 'en'
      showProfileButton = false
    }
  }

  function t(key, vars) {
    return globalThis.AeI18n.t(locale, key, vars)
  }

  /** Public profile URL for the logged-in AnimeEnigma user (`/user/{public_id}`). */
  function resolveOwnProfileUrl() {
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return undefined
      const user = JSON.parse(raw)
      const id = user?.public_id || user?.publicId
      if (!id || typeof id !== 'string') return undefined
      return `${API_BASE}/user/${encodeURIComponent(id)}`
    } catch {
      return undefined
    }
  }

  function withButtonFields(payload) {
    const profileUrl = showProfileButton ? resolveOwnProfileUrl() : undefined
    return {
      ...payload,
      showProfileButton: Boolean(showProfileButton && profileUrl),
      profileUrl,
    }
  }
  function readSessionStart() {
    try {
      const raw = sessionStorage.getItem(SESSION_START_KEY)
      const n = raw ? Number(raw) : NaN
      if (Number.isFinite(n) && n > 0) return n
      const now = Date.now()
      sessionStorage.setItem(SESSION_START_KEY, String(now))
      return now
    } catch {
      return Date.now()
    }
  }

  function ensureSessionStart() {
    startTimestamp = readSessionStart()
    return startTimestamp
  }

  /** Identity used only for logging / future hooks (timer is session-scoped). */
  function activityIdentity(payload) {
    let urlKey = ''
    try {
      const u = new URL(payload.url || location.href)
      urlKey = u.pathname
      if (/\/anime\//i.test(u.pathname)) {
        const ep = u.searchParams.get('episode') || u.searchParams.get('ep') || ''
        urlKey += `?ep=${ep}`
      }
    } catch {
      urlKey = payload.url || ''
    }
    return JSON.stringify({
      type: payload.type,
      details: payload.details,
      urlKey,
    })
  }
  function cleanTitle(raw) {
    return String(raw || '')
      .replace(/\s*[—|–|-]\s*AnimeEnigma\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function text(el) {
    return el?.textContent?.replace(/\s+/g, ' ').trim() || ''
  }

  function unwrap(json) {
    return json && typeof json === 'object' && 'data' in json ? json.data : json
  }

  async function fetchAnimeMeta(id) {
    const cached = animeCache.get(id)
    if (cached && Date.now() - cached.fetchedAt < 10 * 60_000) return cached

    try {
      const res = await fetch(`${API_BASE}/api/anime/${encodeURIComponent(id)}`, {
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return null
      const anime = unwrap(await res.json())
      const names = {
        en: anime?.name || anime?.title || '',
        ru: anime?.name_ru || '',
        ja: anime?.name_jp || '',
      }
      if (!names.en && !names.ru && !names.ja) return null
      const entry = { names, raw: anime, fetchedAt: Date.now() }
      animeCache.set(id, entry)
      return entry
    } catch {
      return null
    }
  }

  function titleFromMeta(meta) {
    if (!meta) return null
    return globalThis.AeI18n.animeTitle(locale, {
      name: meta.names.en,
      name_ru: meta.names.ru,
      name_jp: meta.names.ja,
      ...(meta.raw || {}),
    })
  }

  function animeTitleFromDom() {
    const h1 = document.querySelector('h1')
    if (h1) {
      const value = text(h1)
      if (value && value.length < 200) return value
    }
    return cleanTitle(document.title)
  }

  function isVideoPlaying() {
    return [...document.querySelectorAll('video')].some(
      (v) => !v.paused && !v.ended && v.readyState > 2,
    )
  }

  async function detect() {
    const path = location.pathname
    const url = location.href
    const q = new URLSearchParams(location.search)

    const animeMatch = path.match(/^\/anime\/([^/]+)(?:\/watch)?\/?$/i)
    if (animeMatch) {
      const animeId = decodeURIComponent(animeMatch[1])
      const meta = await fetchAnimeMeta(animeId)
      const title = titleFromMeta(meta) || animeTitleFromDom() || t('anime.fallback')
      const episode = q.get('episode') || q.get('ep')
      const playing = isVideoPlaying()
      const stateParts = []
      if (episode) stateParts.push(t('page.episode', { n: episode }))
      if (playing) stateParts.push(t('page.playing'))
      else if (document.querySelector('video')) stateParts.push(t('page.paused'))
      else stateParts.push(t('page.animePage'))

      return {
        type: 'watching',
        details: title,
        state: stateParts.join(' · '),
        url,
        largeImageText: title,
        locale,
      }
    }

    const gameMatch = path.match(/^\/game(?:\/([^/]+))?\/?$/i)
    if (gameMatch) {
      const roomId = gameMatch[1]
      return {
        type: 'competing',
        details: roomId ? t('page.guessOp') : t('page.gameLobby'),
        state: roomId ? t('state.guessOp') : t('state.gameLobby'),
        url,
        locale,
      }
    }

    if (/^\/watch\/room\//i.test(path)) {
      return {
        type: 'watching',
        details: t('page.watchTogether'),
        state: t('state.watchTogether'),
        url,
        locale,
      }
    }

    if (/^\/profile\/?$/i.test(path) || /^\/user\//i.test(path)) {
      return {
        type: 'watching',
        details: t('page.profile'),
        state: t('state.profile'),
        url,
        locale,
      }
    }

    if (/^\/characters\//i.test(path)) {
      return {
        type: 'watching',
        details: t('page.character'),
        state: t('state.character'),
        url,
        locale,
      }
    }

    const pageMap = [
      [/^\/browse\/?$/i, 'watching', 'page.browse', 'state.browse'],
      [/^\/schedule\/?$/i, 'watching', 'page.schedule', 'state.schedule'],
      [/^\/themes\/?$/i, 'listening', 'page.themes', 'state.themes'],
      [/^\/recs\/?$/i, 'watching', 'page.recs', 'state.recs'],
      [/^\/following\/?$/i, 'watching', 'page.following', 'state.following'],
      [/^\/anidle\/?$/i, 'competing', 'page.anidle', 'state.anidle'],
      [/^\/gacha/i, 'competing', 'page.gacha', 'state.gacha'],
      [/^\/fanfics/i, 'watching', 'page.fanfics', 'state.fanfics'],
      [/^\/collections\//i, 'watching', 'page.collection', 'state.collection'],
      [/^\/downloads\/?$/i, 'watching', 'page.downloads', 'state.downloads'],
      [/^\/about\/?$/i, 'watching', 'page.about', 'state.about'],
      [/^\/auth\/?$/i, 'watching', 'page.auth', 'state.auth'],
      [/^\/admin/i, 'watching', 'page.admin', 'state.admin'],
      [/^\/$/i, 'watching', 'page.home', 'state.home'],
    ]

    for (const [re, type, detailsKey, stateKey] of pageMap) {
      if (re.test(path)) {
        return {
          type,
          details: t(detailsKey),
          state: t(stateKey),
          url,
          locale,
        }
      }
    }

    return {
      type: 'watching',
      details: t('page.browsing'),
      state: t('state.browsing'),
      url,
      locale,
    }
  }

  function fingerprint(payload) {
    return JSON.stringify({
      type: payload.type,
      details: payload.details,
      state: payload.state,
      url: payload.url,
      locale: payload.locale,
      showProfileButton: Boolean(payload.showProfileButton),
      profileUrl: payload.profileUrl || null,
    })
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id)
    } catch {
      return false
    }
  }

  let stopped = false
  let heartbeatTimer = null

  function shutdown() {
    if (stopped) return
    stopped = true
    clearTimeout(debounceTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    try {
      mo.disconnect()
    } catch {
      /* ignore */
    }
  }

  function post(payload) {
    if (stopped || !extensionAlive()) {
      shutdown()
      return
    }
    try {
      chrome.runtime.sendMessage({ type: 'ae-activity', payload }, () => {
        const err = chrome.runtime.lastError?.message || ''
        if (/context invalidated|extension context/i.test(err)) shutdown()
      })
    } catch {
      // Thrown synchronously when the extension was reloaded on this tab.
      shutdown()
    }
  }

  function send(payload, { heartbeat = false } = {}) {
    if (stopped) return

    const id = activityIdentity(payload)
    const fp = fingerprint(payload)

    // Keep one elapsed timer for the browsing session.
    ensureSessionStart()
    if (id !== lastIdentity) lastIdentity = id

    // Heartbeats only refresh bridge TTL; Discord must not be rewritten.
    if (heartbeat && fp === lastSent) {
      lastPayload = { ...payload, startTimestamp }
      post(lastPayload)
      return
    }

    if (fp === lastSent) {
      lastPayload = { ...payload, startTimestamp }
      return
    }

    lastSent = fp
    lastPayload = { ...payload, startTimestamp }
    post(lastPayload)
  }

  function tick(urgent = false) {
    if (stopped) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (stopped) return
      detect()
        .then((payload) => send(withButtonFields(payload)))
        .catch(() => {})
    }, urgent ? NAV_DEBOUNCE_MS : DEBOUNCE_MS)
  }

  function clearPresence() {
    if (stopped) return
    lastSent = ''
    lastIdentity = ''
    lastPayload = null
    try {
      sessionStorage.removeItem(SESSION_START_KEY)
    } catch {
      /* ignore */
    }
    post({ clear: true })
  }

  const wrap = (fnName) => {
    const orig = history[fnName]
    history[fnName] = function (...args) {
      const ret = orig.apply(this, args)
      tick(true)
      return ret
    }
  }
  wrap('pushState')
  wrap('replaceState')
  window.addEventListener('popstate', () => tick(true))

  // Light DOM watch — full subtree floods updates.
  const mo = new MutationObserver(() => tick(false))
  const observeRoot = () => {
    const h1 = document.querySelector('h1')
    if (h1) mo.observe(h1, { childList: true, characterData: true, subtree: true })
    mo.observe(document.querySelector('title') || document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }
  observeRoot()

  document.addEventListener('play', () => tick(false), true)
  document.addEventListener('pause', () => tick(false), true)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick(true)
  })
  window.addEventListener('beforeunload', clearPresence)

  heartbeatTimer = setInterval(() => {
    if (stopped) return
    if (lastPayload) send(lastPayload, { heartbeat: true })
    else tick(true)
  }, HEARTBEAT_MS)

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return
    if (!changes.locale && !changes.showProfileButton) return
    if (changes.locale) {
      locale = globalThis.AeI18n.normalizeLocale(changes.locale.newValue)
    }
    if (changes.showProfileButton) {
      showProfileButton = Boolean(changes.showProfileButton.newValue)
    }
    lastSent = ''
    tick(true)
  })

  refreshSettings().finally(() => tick(true))
})()

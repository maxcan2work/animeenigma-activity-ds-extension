(() => {
  const HEARTBEAT_MS = 20_000
  const DEBOUNCE_MS = 500
  const API_BASE = location.origin

  let lastSent = ''
  let startTimestamp = Date.now()
  let debounceTimer = null
  let lastPayload = null
  /** @type {Map<string, { name: string, fetchedAt: number }>} */
  const animeCache = new Map()

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
      const name = anime?.name || anime?.name_ru || anime?.name_jp || anime?.title
      if (!name) return null
      const entry = { name: String(name), fetchedAt: Date.now() }
      animeCache.set(id, entry)
      return entry
    } catch {
      return null
    }
  }

  function animeTitleFromDom() {
    const h1 = document.querySelector('h1')
    if (h1) {
      const t = text(h1)
      if (t && t.length < 200) return t
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
      const title = meta?.name || animeTitleFromDom() || 'Anime'
      const episode = q.get('episode') || q.get('ep')
      const playing = isVideoPlaying()
      const stateParts = []
      if (episode) stateParts.push(`Episode ${episode}`)
      if (playing) stateParts.push('On page · playing')
      else if (document.querySelector('video')) stateParts.push('On page · paused')
      else stateParts.push('Anime page')

      return {
        type: 'watching',
        details: title,
        state: stateParts.join(' · '),
        url,
        largeImageText: title,
      }
    }

    const gameMatch = path.match(/^\/game(?:\/([^/]+))?\/?$/i)
    if (gameMatch) {
      const roomId = gameMatch[1]
      return {
        type: 'playing',
        details: roomId ? 'Guess the opening' : 'Game lobby',
        state: roomId ? `Room ${roomId.slice(0, 8)}…` : 'Browsing rooms',
        url,
        largeImageText: 'AnimeEnigma Game',
      }
    }

    if (/^\/watch\/room\//i.test(path)) {
      return {
        type: 'watching',
        details: 'Watch together',
        state: 'Shared room',
        url,
      }
    }

    if (/^\/profile\/?$/i.test(path) || /^\/user\//i.test(path)) {
      return {
        type: 'playing',
        details: 'Viewing profile',
        state: text(document.querySelector('h1')) || cleanTitle(document.title) || 'Profile',
        url,
      }
    }

    if (/^\/characters\//i.test(path)) {
      return {
        type: 'playing',
        details: 'Character page',
        state: text(document.querySelector('h1')) || cleanTitle(document.title),
        url,
      }
    }

    const pageMap = [
      [/^\/browse\/?$/i, 'Browsing catalog'],
      [/^\/schedule\/?$/i, 'Checking schedule'],
      [/^\/themes\/?$/i, 'Browsing themes (OP/ED)'],
      [/^\/recs\/?$/i, 'Looking at recommendations'],
      [/^\/following\/?$/i, 'Following feed'],
      [/^\/anidle\/?$/i, 'Playing Anidle'],
      [/^\/gacha/i, 'In gacha'],
      [/^\/fanfics/i, 'Reading fanfics'],
      [/^\/collections\//i, 'Browsing a collection'],
      [/^\/downloads\/?$/i, 'Downloads'],
      [/^\/about\/?$/i, 'About page'],
      [/^\/auth\/?$/i, 'Logging in'],
      [/^\/admin/i, 'Admin panel'],
      [/^\/$/i, 'On the home page'],
    ]

    for (const [re, details] of pageMap) {
      if (re.test(path)) {
        return {
          type: 'playing',
          details,
          state: 'AnimeEnigma',
          url,
        }
      }
    }

    return {
      type: 'playing',
      details: 'Browsing AnimeEnigma',
      state: cleanTitle(document.title) || path,
      url,
    }
  }

  function fingerprint(payload) {
    return JSON.stringify({
      type: payload.type,
      details: payload.details,
      state: payload.state,
      url: payload.url,
    })
  }

  function send(payload, { force = false } = {}) {
    const fp = fingerprint(payload)
    if (!force && fp === lastSent) {
      lastPayload = { ...payload, startTimestamp }
      chrome.runtime.sendMessage({ type: 'ae-activity', payload: lastPayload }, () => {
        void chrome.runtime.lastError
      })
      return
    }

    if (fp !== lastSent) {
      startTimestamp = Date.now()
      lastSent = fp
    }

    lastPayload = { ...payload, startTimestamp }
    chrome.runtime.sendMessage({ type: 'ae-activity', payload: lastPayload }, () => {
      void chrome.runtime.lastError
    })
  }

  function tick() {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      detect()
        .then((payload) => send(payload))
        .catch(() => {})
    }, DEBOUNCE_MS)
  }

  function clearPresence() {
    lastSent = ''
    lastPayload = null
    chrome.runtime.sendMessage({ type: 'ae-activity', payload: { clear: true } }, () => {
      void chrome.runtime.lastError
    })
  }

  const wrap = (fnName) => {
    const orig = history[fnName]
    history[fnName] = function (...args) {
      const ret = orig.apply(this, args)
      tick()
      return ret
    }
  }
  wrap('pushState')
  wrap('replaceState')
  window.addEventListener('popstate', tick)

  const mo = new MutationObserver(tick)
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  document.addEventListener('play', tick, true)
  document.addEventListener('pause', tick, true)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick()
  })
  window.addEventListener('beforeunload', clearPresence)

  setInterval(() => {
    if (lastPayload) send(lastPayload, { force: true })
    else tick()
  }, HEARTBEAT_MS)

  tick()
})()

/** Pure helpers used by the Discord presence bridge (unit-tested). */

export function unwrapEnvelope(json) {
  if (json && typeof json === 'object' && 'data' in json) return json.data
  return json
}

export function animeTitle(anime) {
  if (!anime) return 'Anime'
  return anime.name || anime.name_ru || anime.name_jp || anime.title || 'Anime'
}

/**
 * @param {object | null | undefined} snap
 * @param {string} apiBase
 * @param {string} [locale]
 */
export function presenceFromApi(snap, apiBase = 'https://animeenigma.org', locale = 'en') {
  if (!snap || snap.state !== 'watching' || !snap.is_live) return null
  const title = localizedAnimeTitle(locale, snap.anime)
  const animeId = snap.anime?.id
  const base = String(apiBase || 'https://animeenigma.org').replace(/\/$/, '')
  return {
    type: 'watching',
    details: title,
    state: formatWatchState(snap, locale),
    url: animeId ? `${base}/anime/${animeId}` : base,
    animeUrl: animeId ? `${base}/anime/${animeId}` : undefined,
    largeImageText: title,
    startTimestamp: snap.updated_at ? Date.parse(snap.updated_at) || Date.now() : Date.now(),
    source: 'api',
    locale,
  }
}

export function isAnimeEnigmaUrl(url) {
  return /^https:\/\/([a-z0-9-]+\.)?animeenigma\.org([/:?]|$)/i.test(String(url || ''))
}

/**
 * Discord allows at most 2 buttons; labels max 32 chars.
 *
 * Priority when the profile button is enabled:
 * - anime page → this anime + profile
 * - otherwise → website + profile
 * Without profile: website (+ this anime when known).
 *
 * @param {{ url?: string, animeUrl?: string, locale?: string, profileUrl?: string, showProfileButton?: boolean }} payload
 * @param {string} [apiBase]
 */
export function buildPresenceButtons(payload, apiBase = 'https://animeenigma.org') {
  const base = String(apiBase || 'https://animeenigma.org').replace(/\/$/, '')
  const home = `${base}/`
  const locale = normalizeLocale(payload?.locale)
  const animeUrl = resolveAnimePageUrl(payload?.animeUrl || payload?.url, base)
  const profileUrl = resolveProfileUrl(payload?.profileUrl, base)
  const showProfile = Boolean(payload?.showProfileButton && profileUrl)

  /** @type {{ label: string, url: string }[]} */
  const buttons = []

  if (showProfile && animeUrl) {
    buttons.push({ label: buttonLabel(locale, 'anime'), url: animeUrl })
    buttons.push({ label: buttonLabel(locale, 'profile'), url: profileUrl })
  } else {
    buttons.push({ label: buttonLabel(locale, 'home'), url: home })
    if (animeUrl) buttons.push({ label: buttonLabel(locale, 'anime'), url: animeUrl })
    else if (showProfile) buttons.push({ label: buttonLabel(locale, 'profile'), url: profileUrl })
  }

  return buttons.slice(0, 2)
}

function normalizeLocale(value) {
  const v = String(value || '').toLowerCase()
  if (v === 'ru' || v === 'rus' || v === 'ru-ru') return 'ru'
  if (v === 'ja' || v === 'jp' || v === 'jpn' || v === 'ja-jp') return 'ja'
  return 'en'
}

function buttonLabel(locale, kind) {
  const labels = {
    en: { home: 'Open website', anime: 'Watch too', profile: 'Open profile' },
    ru: { home: 'Открыть веб-сайт', anime: 'Смотреть тоже', profile: 'Открыть профиль' },
    ja: { home: 'ウェブサイトを開く', anime: '一緒に見る', profile: 'プロフィールを開く' },
  }
  return (labels[locale] || labels.en)[kind]
}

export function localizedAnimeTitle(locale, anime) {
  if (!anime) return 'Anime'
  const lang = normalizeLocale(locale)
  if (lang === 'ru') return anime.name_ru || anime.name || anime.name_jp || anime.title || 'Anime'
  if (lang === 'ja') return anime.name_jp || anime.name || anime.name_ru || anime.title || 'Anime'
  return anime.name || anime.name_ru || anime.name_jp || anime.title || 'Anime'
}

export function formatWatchState(snap, locale = 'en') {
  const lang = normalizeLocale(locale)
  const n = snap?.episode_number
  const total = resolveEpisodeTotal(snap?.anime || snap)

  if (n != null && total != null) {
    if (lang === 'ru') return `Серия ${n} из ${total}`
    if (lang === 'ja') return `第${n}/${total}話`
    return `Episode ${n} of ${total}`
  }
  if (n != null) {
    if (lang === 'ru') return `Серия ${n}`
    if (lang === 'ja') return `第${n}話`
    return `Episode ${n}`
  }
  if (lang === 'ru') return 'Смотрит'
  if (lang === 'ja') return '視聴中'
  return 'Watching'
}

/** Prefer announced count, else aired count (ongoing titles). */
export function resolveEpisodeTotal(animeOrSnap) {
  if (!animeOrSnap || typeof animeOrSnap !== 'object') return null
  const candidates = [
    animeOrSnap.episodes_count,
    animeOrSnap.episodesCount,
    animeOrSnap.episodes_aired,
    animeOrSnap.episodesAired,
    animeOrSnap.anime?.episodes_count,
    animeOrSnap.anime?.episodes_aired,
  ]
  for (const raw of candidates) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return null
}

/** @returns {string | null} canonical https://…/user/{publicId} */
export function resolveProfileUrl(url, apiBase = 'https://animeenigma.org') {
  if (!url || !isAnimeEnigmaUrl(url)) return null
  try {
    const u = new URL(url)
    const m = u.pathname.match(/^\/user\/([^/]+)\/?$/i)
    if (!m) return null
    const base = String(apiBase || `${u.protocol}//${u.host}`).replace(/\/$/, '')
    return `${base}/user/${encodeURIComponent(decodeURIComponent(m[1]))}`
  } catch {
    return null
  }
}

/** @returns {string | null} canonical https://…/anime/{id} */
export function resolveAnimePageUrl(url, apiBase = 'https://animeenigma.org') {
  if (!url || !isAnimeEnigmaUrl(url)) return null
  try {
    const u = new URL(url)
    const m = u.pathname.match(/^\/anime\/([^/]+)(?:\/watch)?\/?$/i)
    if (!m) return null
    const base = String(apiBase || `${u.protocol}//${u.host}`).replace(/\/$/, '')
    return `${base}/anime/${encodeURIComponent(decodeURIComponent(m[1]))}`
  } catch {
    return null
  }
}

/**
 * Incremental SSE frame parser.
 * @param {string} buffer
 * @param {(event: string, data: unknown) => void} onEvent
 * @returns {string} remainder
 */
export function parseSseChunk(buffer, onEvent) {
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

/**
 * Decide whether a page-context POST may replace the current bridge leader.
 * Used so several browser windows / profiles (normal + incognito) sharing one
 * local bridge don't flip Discord presence back and forth on heartbeats.
 *
 * @param {{ id: string | null, focusedAt: number }} leader
 * @param {{ clear?: boolean, tabInstanceId?: string, focusedAt?: number }} incoming
 */
export function acceptPageActivity(leader, incoming) {
  const current = {
    id: leader?.id ? String(leader.id) : null,
    focusedAt: Number(leader?.focusedAt) || 0,
  }
  const id = incoming?.tabInstanceId ? String(incoming.tabInstanceId) : ''
  const at = Number(incoming?.focusedAt) || 0

  if (incoming?.clear) {
    if (current.id && id && id !== current.id) {
      return { accept: false, leader: current, reason: 'not-leader' }
    }
    return { accept: true, leader: { id: null, focusedAt: 0 }, reason: 'cleared' }
  }

  // Same tab always refreshes (heartbeats / navigation).
  if (current.id && id && id === current.id) {
    return {
      accept: true,
      leader: { id, focusedAt: Math.max(at, current.focusedAt) },
      reason: 'same-tab',
    }
  }

  // Different tab only wins with a newer focus timestamp.
  if (current.id && id && id !== current.id && at <= current.focusedAt) {
    return { accept: false, leader: current, reason: 'stale-focus' }
  }

  return {
    accept: true,
    leader: { id: id || current.id, focusedAt: Math.max(at, current.focusedAt) },
    reason: 'takeover',
  }
}

export const ACTIVITY_TYPE = {
  playing: 0,
  listening: 2,
  watching: 3,
  competing: 5,
}

/** Discord status_display_type: which field appears in the member-list status text. */
export const STATUS_DISPLAY_TYPE = {
  name: 0,
  state: 1,
  details: 2,
}

/**
 * Map our payload type → Discord Activity Type integer.
 * AnimeEnigma is a streaming site: default Watching (TV), not Playing (gamepad).
 * Games/gacha use Competing (swords). Do NOT default assets.large_text to the
 * app name — for Competing/Watching/Listening Discord often surfaces large_text
 * as an extra body line under state.
 */
export function discordActivityType(payload) {
  const key = String(payload?.type || 'watching').toLowerCase()
  if (key === 'competing') return ACTIVITY_TYPE.competing
  if (key === 'listening') return ACTIVITY_TYPE.listening
  if (key === 'playing') {
    const hay = `${payload?.details || ''} ${payload?.state || ''}`.toLowerCase()
    if (/guess|game|anidle|gacha|lobby|room/.test(hay)) return ACTIVITY_TYPE.competing
    return ACTIVITY_TYPE.watching
  }
  return ACTIVITY_TYPE[key] ?? ACTIVITY_TYPE.watching
}

/**
 * Keep "Watching AnimeEnigma" as the activity title (Application name).
 * Never use `state` here — Discord then appends the app name onto the playful
 * line (e.g. "Ну ещё один круток… AnimeEnigma").
 */
export function discordStatusDisplayType(_payload) {
  return STATUS_DISPLAY_TYPE.name
}

export function isAnimePageUrl(url) {
  if (!url || !isAnimeEnigmaUrl(url)) return false
  try {
    return /^\/anime\/[^/]+/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

export function resolvePresence(apiActivity, pageContext, apiBase) {
  const locale = pageContext?.locale || 'en'
  // Focused anime page beats the activity API: episode switches in the player
  // update the URL immediately, while /activity/stream can lag for a long time.
  if (pageContext && isAnimePageUrl(pageContext.url)) {
    return pageContext
  }
  const fromApi = presenceFromApi(apiActivity, apiBase, locale)
  if (fromApi) return fromApi
  if (pageContext) return pageContext
  return null
}

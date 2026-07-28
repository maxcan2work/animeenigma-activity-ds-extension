/** Pure helpers used by the Discord presence bridge (unit-tested). */

export function unwrapEnvelope(json) {
  if (json && typeof json === 'object' && 'data' in json) return json.data
  return json
}

export function animeTitle(anime) {
  if (!anime) return 'Anime'
  return anime.name || anime.name_ru || anime.name_jp || anime.title || 'Anime'
}

export function formatWatchState(snap) {
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

/**
 * @param {object | null | undefined} snap
 * @param {string} apiBase
 */
export function presenceFromApi(snap, apiBase = 'https://animeenigma.org') {
  if (!snap || snap.state !== 'watching' || !snap.is_live) return null
  const title = animeTitle(snap.anime)
  const animeId = snap.anime?.id
  const base = String(apiBase || 'https://animeenigma.org').replace(/\/$/, '')
  return {
    type: 'watching',
    details: title,
    state: formatWatchState(snap),
    url: animeId ? `${base}/anime/${animeId}` : base,
    largeImageText: title,
    startTimestamp: snap.updated_at ? Date.parse(snap.updated_at) || Date.now() : Date.now(),
    source: 'api',
  }
}

export function isAnimeEnigmaUrl(url) {
  return /^https:\/\/([a-z0-9-]+\.)?animeenigma\.org([/:?]|$)/i.test(String(url || ''))
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

export const ACTIVITY_TYPE = {
  playing: 0,
  watching: 3,
  competing: 5,
}

export function resolvePresence(apiActivity, pageContext, apiBase) {
  const fromApi = presenceFromApi(apiActivity, apiBase)
  if (fromApi) return fromApi
  if (pageContext) return pageContext
  return null
}

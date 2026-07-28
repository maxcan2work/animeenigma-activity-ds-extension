import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  animeTitle,
  formatWatchState,
  isAnimeEnigmaUrl,
  parseSseChunk,
  presenceFromApi,
  resolvePresence,
  unwrapEnvelope,
} from './activity.js'

describe('unwrapEnvelope', () => {
  it('unwraps data envelopes', () => {
    assert.deepEqual(unwrapEnvelope({ success: true, data: { state: 'idle' } }), { state: 'idle' })
  })

  it('passes through bare payloads', () => {
    assert.deepEqual(unwrapEnvelope({ state: 'idle' }), { state: 'idle' })
  })
})

describe('animeTitle', () => {
  it('prefers name then locales', () => {
    assert.equal(animeTitle({ name: 'A', name_ru: 'Б' }), 'A')
    assert.equal(animeTitle({ name_ru: 'Б' }), 'Б')
    assert.equal(animeTitle(null), 'Anime')
  })
})

describe('formatWatchState', () => {
  it('includes episode and percent', () => {
    assert.equal(
      formatWatchState({ episode_number: 3, position_seconds: 600, duration_seconds: 1200 }),
      'Episode 3 · 50%',
    )
  })

  it('falls back to Watching', () => {
    assert.equal(formatWatchState({}), 'Watching')
  })
})

describe('presenceFromApi', () => {
  it('returns null when idle', () => {
    assert.equal(presenceFromApi({ state: 'idle', is_live: false }), null)
  })

  it('maps a live watching snapshot', () => {
    const presence = presenceFromApi({
      state: 'watching',
      is_live: true,
      episode_number: 2,
      anime: { id: 'abc', name: 'Bocchi' },
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(presence.type, 'watching')
    assert.equal(presence.details, 'Bocchi')
    assert.equal(presence.state, 'Episode 2')
    assert.equal(presence.url, 'https://animeenigma.org/anime/abc')
    assert.equal(presence.source, 'api')
  })
})

describe('resolvePresence', () => {
  it('prefers API watching over page context', () => {
    const resolved = resolvePresence(
      { state: 'watching', is_live: true, anime: { id: '1', name: 'API' }, episode_number: 1 },
      { type: 'playing', details: 'Browsing', source: 'extension' },
    )
    assert.equal(resolved.source, 'api')
    assert.equal(resolved.details, 'API')
  })

  it('falls back to page context', () => {
    const page = { type: 'playing', details: 'Game lobby', source: 'extension' }
    assert.equal(resolvePresence({ state: 'idle', is_live: false }, page), page)
  })
})

describe('parseSseChunk', () => {
  it('parses activity frames and keeps remainder', () => {
    const events = []
    const rest = parseSseChunk(
      'event: activity\ndata: {"state":"idle","is_live":false}\n\ndata: {"partial":',
      (event, data) => events.push({ event, data }),
    )
    assert.equal(events.length, 1)
    assert.equal(events[0].event, 'activity')
    assert.equal(events[0].data.state, 'idle')
    assert.equal(rest, 'data: {"partial":')
  })
})

describe('isAnimeEnigmaUrl', () => {
  it('accepts product host only', () => {
    assert.equal(isAnimeEnigmaUrl('https://animeenigma.org/anime/1'), true)
    assert.equal(isAnimeEnigmaUrl('https://evil.com'), false)
  })
})

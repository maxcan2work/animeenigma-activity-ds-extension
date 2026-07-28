import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  animeTitle,
  buildPresenceButtons,
  discordActivityType,
  discordStatusDisplayType,
  formatWatchState,
  isAnimeEnigmaUrl,
  parseSseChunk,
  presenceFromApi,
  resolvePresence,
  unwrapEnvelope,
  acceptPageActivity,
  ACTIVITY_TYPE,
  STATUS_DISPLAY_TYPE,
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

describe('discordActivityType', () => {
  it('defaults streaming site activity to Watching (not Playing/gamepad)', () => {
    assert.equal(discordActivityType({ type: 'watching', details: 'Bocchi' }), ACTIVITY_TYPE.watching)
    assert.equal(discordActivityType({ type: 'playing', details: 'Browsing catalog' }), ACTIVITY_TYPE.watching)
  })

  it('maps games to Competing', () => {
    assert.equal(discordActivityType({ type: 'competing', details: 'Guess the opening' }), ACTIVITY_TYPE.competing)
    assert.equal(discordActivityType({ type: 'playing', details: 'Game lobby' }), ACTIVITY_TYPE.competing)
  })

  it('keeps Listening for themes', () => {
    assert.equal(discordActivityType({ type: 'listening', details: 'Themes' }), ACTIVITY_TYPE.listening)
  })
})

describe('discordStatusDisplayType', () => {
  it('keeps Application name (AnimeEnigma) in Watching/Competing line', () => {
    assert.equal(
      discordStatusDisplayType({
        url: 'https://animeenigma.org/gacha',
        details: 'В гаче',
        state: 'Ну ещё один круток…',
      }),
      STATUS_DISPLAY_TYPE.name,
    )
    assert.equal(
      discordStatusDisplayType({ source: 'api', details: 'Bocchi', state: 'Episode 1' }),
      STATUS_DISPLAY_TYPE.name,
    )
  })
})

describe('buildPresenceButtons', () => {
  it('always includes the site home button', () => {
    const buttons = buildPresenceButtons({ url: 'https://animeenigma.org/browse' })
    assert.equal(buttons.length, 1)
    assert.equal(buttons[0].label, 'Open website')
    assert.equal(buttons[0].url, 'https://animeenigma.org/')
  })

  it('adds a second button on anime/watch pages', () => {
    const buttons = buildPresenceButtons({
      url: 'https://animeenigma.org/anime/abc-123?episode=3',
    })
    assert.equal(buttons.length, 2)
    assert.equal(buttons[1].label, 'Watch too')
    assert.equal(buttons[1].url, 'https://animeenigma.org/anime/abc-123')
  })

  it('localizes button labels', () => {
    const buttons = buildPresenceButtons({
      url: 'https://animeenigma.org/anime/abc',
      locale: 'ru',
    })
    assert.equal(buttons[0].label, 'Открыть веб-сайт')
    assert.equal(buttons[1].label, 'Смотреть тоже')
  })

  it('adds profile button when enabled (non-anime page)', () => {
    const buttons = buildPresenceButtons({
      url: 'https://animeenigma.org/gacha',
      showProfileButton: true,
      profileUrl: 'https://animeenigma.org/user/pub-1',
      locale: 'ru',
    })
    assert.equal(buttons.length, 2)
    assert.equal(buttons[0].label, 'Открыть веб-сайт')
    assert.equal(buttons[1].label, 'Открыть профиль')
    assert.equal(buttons[1].url, 'https://animeenigma.org/user/pub-1')
  })

  it('prefers anime + profile over website when both available', () => {
    const buttons = buildPresenceButtons({
      url: 'https://animeenigma.org/anime/abc',
      showProfileButton: true,
      profileUrl: 'https://animeenigma.org/user/pub-1',
      locale: 'en',
    })
    assert.equal(buttons.length, 2)
    assert.equal(buttons[0].label, 'Watch too')
    assert.equal(buttons[0].url, 'https://animeenigma.org/anime/abc')
    assert.equal(buttons[1].label, 'Open profile')
    assert.equal(buttons[1].url, 'https://animeenigma.org/user/pub-1')
  })

  it('ignores profile button when toggled off', () => {
    const buttons = buildPresenceButtons({
      url: 'https://animeenigma.org/browse',
      showProfileButton: false,
      profileUrl: 'https://animeenigma.org/user/pub-1',
    })
    assert.equal(buttons.length, 1)
    assert.equal(buttons[0].label, 'Open website')
  })
})

describe('acceptPageActivity', () => {
  it('lets the first tab claim leadership', () => {
    const verdict = acceptPageActivity({ id: null, focusedAt: 0 }, {
      tabInstanceId: 'a',
      focusedAt: 100,
    })
    assert.equal(verdict.accept, true)
    assert.equal(verdict.leader.id, 'a')
  })

  it('ignores an older focus from another tab', () => {
    const verdict = acceptPageActivity({ id: 'a', focusedAt: 200 }, {
      tabInstanceId: 'b',
      focusedAt: 150,
    })
    assert.equal(verdict.accept, false)
    assert.equal(verdict.reason, 'stale-focus')
  })

  it('allows a newer focus to take over', () => {
    const verdict = acceptPageActivity({ id: 'a', focusedAt: 200 }, {
      tabInstanceId: 'b',
      focusedAt: 250,
    })
    assert.equal(verdict.accept, true)
    assert.equal(verdict.leader.id, 'b')
  })

  it('always accepts heartbeats from the same tab', () => {
    const verdict = acceptPageActivity({ id: 'a', focusedAt: 200 }, {
      tabInstanceId: 'a',
      focusedAt: 200,
    })
    assert.equal(verdict.accept, true)
  })

  it('ignores clear from a non-leader tab', () => {
    const verdict = acceptPageActivity({ id: 'a', focusedAt: 200 }, {
      clear: true,
      tabInstanceId: 'b',
      focusedAt: 300,
    })
    assert.equal(verdict.accept, false)
  })
})

describe('isAnimeEnigmaUrl', () => {
  it('accepts product host only', () => {
    assert.equal(isAnimeEnigmaUrl('https://animeenigma.org/anime/1'), true)
    assert.equal(isAnimeEnigmaUrl('https://evil.com'), false)
  })
})

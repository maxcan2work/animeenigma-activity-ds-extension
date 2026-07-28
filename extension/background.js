const DEFAULTS = {
  enabled: true,
  showProfileButton: false,
  bridgeUrl: 'http://127.0.0.1:3847',
  locale: 'en',
}

/** Tab id currently allowed to drive Discord presence (focused AnimeEnigma tab). */
let presenceTabId = null

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  return { ...DEFAULTS, ...stored }
}

async function postActivity(payload) {
  const { enabled, bridgeUrl } = await getSettings()
  if (!enabled) return { ok: false, error: 'disabled' }

  const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

function askTabTakeover(tabId) {
  if (tabId == null) return
  chrome.tabs.sendMessage(tabId, { type: 'ae-takeover' }).catch(() => {})
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ae-activity') {
    const tabId = sender.tab?.id ?? null
    const payload = message.payload || {}
    const claim = message.claim !== false

    if (payload.clear) {
      // Background tabs must not wipe the focused tab's presence.
      if (tabId != null && presenceTabId != null && tabId !== presenceTabId) {
        sendResponse({ ok: true, skipped: 'not-leader' })
        return true
      }
      if (tabId != null && tabId === presenceTabId) presenceTabId = null
      postActivity(payload)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }))
      return true
    }

    // Only the focused AnimeEnigma tab may update presence.
    if (!claim) {
      sendResponse({ ok: true, skipped: 'inactive-tab' })
      return true
    }

    // Another AnimeEnigma tab is the Chrome-focused leader — ignore this one.
    if (tabId != null && presenceTabId != null && tabId !== presenceTabId) {
      sendResponse({ ok: true, skipped: 'not-leader' })
      return true
    }

    if (tabId != null) presenceTabId = tabId

    postActivity(payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message?.type === 'ae-health') {
    getSettings()
      .then(async ({ bridgeUrl }) => {
        const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/health`)
        const data = await res.json()
        sendResponse({ ok: true, data })
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  return false
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  presenceTabId = tabId
  askTabTakeover(tabId)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === presenceTabId) presenceTabId = null
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    const tab = tabs?.[0]
    if (!tab?.id) return
    presenceTabId = tab.id
    askTabTakeover(tab.id)
  })
})

// Keep service worker alive lightly while tabs may be active
chrome.alarms.create('ae-keepalive', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener(() => {})

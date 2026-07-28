const DEFAULTS = {
  enabled: true,
  showProfileButton: false,
  bridgeUrl: 'http://127.0.0.1:3847',
  locale: 'en',
}

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ae-activity') {
    postActivity(message.payload)
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

// Keep service worker alive lightly while tabs may be active
chrome.alarms.create('ae-keepalive', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener(() => {})
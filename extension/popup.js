const enabledEl = document.getElementById('enabled')
const showProfileEl = document.getElementById('showProfileButton')
const bridgeUrlEl = document.getElementById('bridgeUrl')
const statusEl = document.getElementById('status')
const saveBtn = document.getElementById('save')
const localeBtns = [...document.querySelectorAll('.locale-btn')]

let locale = 'en'

function applyPopupI18n() {
  const { t } = globalThis.AeI18n
  document.getElementById('subtitle').textContent = t(locale, 'popup.subtitle')
  document.getElementById('labelEnabled').textContent = t(locale, 'popup.enabled')
  document.getElementById('labelShowProfile').textContent = t(locale, 'popup.showProfileButton')
  document.getElementById('labelLocale').textContent = t(locale, 'popup.locale')
  document.getElementById('labelBridge').textContent = t(locale, 'popup.bridgeUrl')
  saveBtn.textContent = t(locale, 'popup.save')
  for (const btn of localeBtns) {
    btn.setAttribute('aria-pressed', btn.dataset.locale === locale ? 'true' : 'false')
  }
}

async function load() {
  const stored = await chrome.storage.sync.get({
    enabled: true,
    showProfileButton: false,
    bridgeUrl: 'http://127.0.0.1:3847',
    locale: 'en',
  })
  enabledEl.checked = stored.enabled
  showProfileEl.checked = Boolean(stored.showProfileButton)
  bridgeUrlEl.value = stored.bridgeUrl
  locale = globalThis.AeI18n.normalizeLocale(stored.locale)
  applyPopupI18n()
  await refreshHealth()
}

async function refreshHealth() {
  const { t } = globalThis.AeI18n
  statusEl.className = 'status'
  statusEl.textContent = t(locale, 'popup.checking')
  chrome.runtime.sendMessage({ type: 'ae-health' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      statusEl.className = 'status bad'
      statusEl.textContent = t(locale, 'popup.bridgeOffline')
      return
    }
    const d = res.data || {}
    if (!d.discord) {
      statusEl.className = 'status bad'
      statusEl.textContent = t(locale, 'popup.discordNotReady')
      return
    }
    const bits = [t(locale, 'popup.ok')]
    if (d.apiKey) bits.push(d.apiWatching ? t(locale, 'popup.apiWatching') : t(locale, 'popup.apiIdle'))
    else bits.push(t(locale, 'popup.apiMissing'))
    statusEl.className = 'status ok'
    statusEl.textContent = bits.join(' · ')
  })
}

for (const btn of localeBtns) {
  btn.addEventListener('click', () => {
    locale = globalThis.AeI18n.normalizeLocale(btn.dataset.locale)
    applyPopupI18n()
  })
}

saveBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({
    enabled: enabledEl.checked,
    showProfileButton: showProfileEl.checked,
    bridgeUrl: bridgeUrlEl.value.trim() || 'http://127.0.0.1:3847',
    locale,
  })
  statusEl.className = 'status ok'
  statusEl.textContent = globalThis.AeI18n.t(locale, 'popup.saved')
  setTimeout(refreshHealth, 400)
})

load()

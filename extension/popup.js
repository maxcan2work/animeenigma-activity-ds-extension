const DEFAULT_BRIDGE = 'http://127.0.0.1:3847'
const SAVE_DEBOUNCE_MS = 2000

const enabledEl = document.getElementById('enabled')
const showProfileEl = document.getElementById('showProfileButton')
const bridgeUrlEl = document.getElementById('bridgeUrl')
const statusEl = document.getElementById('status')
const saveHintEl = document.getElementById('saveHint')
const localeBtns = [...document.querySelectorAll('.locale-btn')]

let locale = 'en'
let saveTimer = null
let saveHintTimer = null
let loaded = false

function t(key) {
  return globalThis.AeI18n.t(locale, key)
}

function applyPopupI18n() {
  document.getElementById('subtitle').textContent = t('popup.subtitle')
  document.getElementById('labelEnabled').textContent = t('popup.enabled')
  document.getElementById('labelShowProfile').textContent = t('popup.showProfileButton')
  document.getElementById('labelLocale').textContent = t('popup.locale')
  document.getElementById('labelAdvanced').textContent = t('popup.advanced')
  document.getElementById('labelBridge').textContent = t('popup.bridgeUrl')
  document.getElementById('bridgeHint').textContent = t('popup.bridgeHint')
  for (const btn of localeBtns) {
    btn.setAttribute('aria-pressed', btn.dataset.locale === locale ? 'true' : 'false')
  }
}

function showSaveHint(kind) {
  clearTimeout(saveHintTimer)
  saveHintEl.hidden = false
  saveHintEl.classList.toggle('on', kind === 'saved')
  saveHintEl.textContent = kind === 'saving' ? t('popup.saving') : t('popup.saved')
  if (kind === 'saved') {
    saveHintTimer = setTimeout(() => {
      saveHintEl.hidden = true
      saveHintEl.textContent = ''
    }, 1600)
  }
}

function currentSettings() {
  return {
    enabled: enabledEl.checked,
    showProfileButton: showProfileEl.checked,
    bridgeUrl: bridgeUrlEl.value.trim() || DEFAULT_BRIDGE,
    locale,
  }
}

async function persist() {
  showSaveHint('saving')
  await chrome.storage.sync.set(currentSettings())
  showSaveHint('saved')
  await refreshHealth()
}

function scheduleSave() {
  if (!loaded) return
  clearTimeout(saveTimer)
  showSaveHint('saving')
  saveTimer = setTimeout(() => {
    persist().catch(() => {})
  }, SAVE_DEBOUNCE_MS)
}

async function flushSave() {
  if (!loaded) return
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  await persist()
}

async function load() {
  const stored = await chrome.storage.sync.get({
    enabled: true,
    showProfileButton: false,
    bridgeUrl: DEFAULT_BRIDGE,
    locale: 'en',
  })
  enabledEl.checked = stored.enabled
  showProfileEl.checked = Boolean(stored.showProfileButton)
  bridgeUrlEl.value = stored.bridgeUrl || DEFAULT_BRIDGE
  locale = globalThis.AeI18n.normalizeLocale(stored.locale)
  applyPopupI18n()
  loaded = true
  await refreshHealth()
}

async function refreshHealth() {
  statusEl.className = 'status'
  statusEl.textContent = t('popup.checking')
  chrome.runtime.sendMessage({ type: 'ae-health' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      statusEl.className = 'status bad'
      statusEl.textContent = t('popup.bridgeOffline')
      return
    }
    const d = res.data || {}
    if (!d.discord) {
      statusEl.className = 'status bad'
      statusEl.textContent = t('popup.discordNotReady')
      return
    }
    const bits = [t('popup.ok')]
    if (d.apiKey) bits.push(d.apiWatching ? t('popup.apiWatching') : t('popup.apiIdle'))
    else bits.push(t('popup.apiMissing'))
    statusEl.className = 'status ok'
    statusEl.textContent = bits.join(' · ')
  })
}

enabledEl.addEventListener('change', scheduleSave)
showProfileEl.addEventListener('change', scheduleSave)
bridgeUrlEl.addEventListener('input', scheduleSave)

for (const btn of localeBtns) {
  btn.addEventListener('click', () => {
    locale = globalThis.AeI18n.normalizeLocale(btn.dataset.locale)
    applyPopupI18n()
    scheduleSave()
  })
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave().catch(() => {})
})

window.addEventListener('pagehide', () => {
  flushSave().catch(() => {})
})

load()

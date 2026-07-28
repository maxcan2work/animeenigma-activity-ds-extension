const enabledEl = document.getElementById('enabled')
const bridgeUrlEl = document.getElementById('bridgeUrl')
const statusEl = document.getElementById('status')
const saveBtn = document.getElementById('save')

async function load() {
  const { enabled = true, bridgeUrl = 'http://127.0.0.1:3847' } =
    await chrome.storage.sync.get({
      enabled: true,
      bridgeUrl: 'http://127.0.0.1:3847',
    })
  enabledEl.checked = enabled
  bridgeUrlEl.value = bridgeUrl
  await refreshHealth()
}

async function refreshHealth() {
  statusEl.className = 'status'
  statusEl.textContent = 'Checking bridge…'
  chrome.runtime.sendMessage({ type: 'ae-health' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      statusEl.className = 'status bad'
      statusEl.textContent =
        'Bridge offline. Run bridge (npm start) with Discord Desktop open.'
      return
    }
    const d = res.data || {}
    if (!d.discord) {
      statusEl.className = 'status bad'
      statusEl.textContent = 'Bridge up, Discord RPC not ready — open Discord Desktop.'
      return
    }
    const bits = ['Bridge + Discord OK']
    if (d.apiKey) bits.push(d.apiWatching ? 'API: watching' : 'API: idle')
    else bits.push('API key not set in bridge .env')
    statusEl.className = 'status ok'
    statusEl.textContent = bits.join(' · ')
  })
}

saveBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({
    enabled: enabledEl.checked,
    bridgeUrl: bridgeUrlEl.value.trim() || 'http://127.0.0.1:3847',
  })
  statusEl.className = 'status ok'
  statusEl.textContent = 'Saved.'
  setTimeout(refreshHealth, 400)
})

load()

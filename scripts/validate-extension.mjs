import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extDir = path.join(root, 'extension')
const manifestPath = path.join(extDir, 'manifest.json')

function fail(msg) {
  console.error(`[validate-extension] ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(manifestPath)) fail('extension/manifest.json missing')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

if (manifest.manifest_version !== 3) fail('manifest_version must be 3')
if (!manifest.name) fail('name is required')
if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) fail('version must be semver x.y.z')
if (!manifest.background?.service_worker) fail('background.service_worker is required')
if (!Array.isArray(manifest.content_scripts) || !manifest.content_scripts.length) {
  fail('content_scripts required')
}

const requiredFiles = [
  'background.js',
  'content.js',
  'i18n.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
]

for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(extDir, rel))) fail(`missing file: ${rel}`)
}

const sw = path.join(extDir, manifest.background.service_worker)
if (!fs.existsSync(sw)) fail(`service_worker not found: ${manifest.background.service_worker}`)

console.log(`[validate-extension] ok — ${manifest.name} v${manifest.version}`)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extDir = path.join(root, 'extension')
const distDir = path.join(root, 'dist')
const outZip = path.join(distDir, 'animeenigma-discord-presence.zip')
const stageName = 'animeenigma-discord-presence'
const stageDir = path.join(distDir, stageName)

fs.mkdirSync(distDir, { recursive: true })
if (fs.existsSync(outZip)) fs.unlinkSync(outZip)
fs.rmSync(stageDir, { recursive: true, force: true })

const versionOverride = process.env.EXTENSION_VERSION?.trim()
if (versionOverride) {
  const manifestPath = path.join(extDir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!/^\d+\.\d+\.\d+$/.test(versionOverride)) {
    console.error(`[package-extension] invalid EXTENSION_VERSION: ${versionOverride}`)
    process.exit(1)
  }
  manifest.version = versionOverride
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`[package-extension] version set to ${versionOverride}`)
}

// Stage into a single folder so unzip → Load unpacked is obvious:
// select animeenigma-discord-presence/ (it must contain manifest.json).
fs.cpSync(extDir, stageDir, { recursive: true })
execFileSync('zip', ['-r', '-q', outZip, stageName], { cwd: distDir, stdio: 'inherit' })
fs.rmSync(stageDir, { recursive: true, force: true })

const stat = fs.statSync(outZip)
console.log(`[package-extension] wrote ${outZip} (${stat.size} bytes)`)

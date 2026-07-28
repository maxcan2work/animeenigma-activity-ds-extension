# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project

Chrome extension + local Node bridge that shows AnimeEnigma activity as Discord Rich Presence.

| Piece | Path | Role |
|---|---|---|
| Extension | `extension/` | Detects page context on animeenigma.org, POSTs to bridge |
| Bridge | `bridge/` | Discord RPC + AnimeEnigma activity API (SSE/poll); library: `startBridge` / `stopBridge` |
| Companion | `companion/` | Electron tray app embedding the bridge (macOS `.app`) |
| Secrets template | `.env.example` | Copy to `.env` locally — **never commit `.env`** |

Architecture constraint: Discord Rich Presence needs a local process next to Discord Desktop. A Chrome extension alone cannot set profile status.

## Secrets

- Commit `.env.example` only.
- Never commit `.env`, API keys (`ak_…`), Discord tokens, or user tokens.
- Required local env: `DISCORD_CLIENT_ID`, recommended `ANIMEENIGMA_API_KEY`.
- Discord bot/user tokens are **not** used for Rich Presence RPC.

## Runtime

- Discord **Desktop** must be running (not web-only).
- Companion (preferred): release `.app` / `.exe`, or `cd companion && npm install && npm start`
- Bridge CLI: `cd bridge && npm install && npm start` → same HTTP API
- Extension: Chrome → Load unpacked → `extension/`
- Health: `GET http://127.0.0.1:3847/health` → expect `"discord": true`
- CI companion packs need GitHub secret **`DISCORD_CLIENT_ID`** (not the AnimeEnigma API key).

Presence priority:

1. AnimeEnigma API `watching` (`/api/users/me/activity/*`)
2. Else extension page context (browse / game / profile / …)
3. Else clear

API docs: https://animeenigma.org/api-docs/

## Git & GitHub (owner rules)

- Commit subjects **must** start with `feat:`, `fix:`, or `refactor:` (Conventional Commits style).
- **Never commit or push on your own.** When the user asks to commit / split commits / push:
  1. Inspect changes (`git status`, `git diff`, recent log style).
  2. **Propose** the commit plan: one or more subjects (`feat:` / `fix:` / `refactor:`) and which files/hunks each covers. Keep proposals short.
  3. **Wait** for the user to confirm, edit a title, or suggest a different split.
  4. Only after explicit confirmation (e.g. «ок», «да», «пушь», or a revised title they approve) — create the commit(s) and **push** to the tracked remote.
- If the user only confirms the message but says not to push, commit locally and skip push.
- Never commit `.env` or secrets. Prefer `git status` / `git check-ignore` before staging.
- Do not amend commits unless the user asks and amend safety rules are met.
- Do not force-push `main`/`master`.

## After writing code

After every non-trivial code change, run a short self-review before finishing:

1. **Visual / syntax** — naming, dead code, duplication, noisy comments, inconsistent style with nearby files.
2. **Technical** — error paths, retries, leaks (timers/sockets), security (secrets, CORS, localhost bind), unnecessary work, MV3 / Discord RPC pitfalls.
3. Fix clear issues in the same turn when cheap; call out larger follow-ups instead of silent scope creep.

## Coding norms

- Match existing structure; do not drive-by refactor unrelated files.
- Keep the bridge bound to `127.0.0.1` only.
- Prefer small, focused diffs.
- README is for humans; keep AGENTS.md actionable for agents.
- Future product direction: companion tray app packages the bridge (no `npm start` for end users). Do not pretend a pure-extension Rich Presence is possible.

## Useful paths

- Bridge library: `bridge/src/server.js` (`startBridge` / `stopBridge`)
- Bridge CLI: `bridge/src/cli.js` (also `bridge/src/index.js`)
- Bridge helpers (tested): `bridge/src/lib/activity.js`
- Companion Electron main: `companion/src/main.js`
- Companion config: `companion/src/config.js`, `companion/config.example.json`
- Extension content script: `extension/content.js`
- Extension SW: `extension/background.js`
- Manifest MV3: `extension/manifest.json`
- Brand art: `assets/logo.png`, `assets/discord/logo.png` (upload to Discord Art Assets as `logo`)
- CI workflow: `.github/workflows/ci.yml`

## CI / deploy

- CI runs on GitHub Actions (cloud) for `main` PRs/pushes — no load on the owner’s laptop.
- Jobs: test → build extension zip → (push to `main`) pack companion mac+win → GitHub Release with extension zip + companion assets (`v1.0.<run_number>`).
- Companion bake uses secret `DISCORD_CLIENT_ID` only. Never store `ANIMEENIGMA_API_KEY` in Actions secrets for shipping builds.
- Do **not** wire Chrome Web Store publishing unless the owner explicitly asks later (paid developer account).
- **Do not** try to host the Discord RPC bridge in the cloud for end-user Rich Presence; it must be local.
- Releases use the default `GITHUB_TOKEN` — no extra secrets required for zip distribution.

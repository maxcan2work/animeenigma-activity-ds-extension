# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project

Chrome extension + local Node bridge that shows AnimeEnigma activity as Discord Rich Presence.

| Piece | Path | Role |
|---|---|---|
| Extension | `extension/` | Detects page context on animeenigma.org, POSTs to bridge |
| Bridge | `bridge/` | Discord RPC + AnimeEnigma activity API (SSE/poll) |
| Secrets template | `.env.example` | Copy to `.env` locally — **never commit `.env`** |

Architecture constraint: Discord Rich Presence needs a local process next to Discord Desktop. A Chrome extension alone cannot set profile status.

## Secrets

- Commit `.env.example` only.
- Never commit `.env`, API keys (`ak_…`), Discord tokens, or user tokens.
- Required local env: `DISCORD_CLIENT_ID`, recommended `ANIMEENIGMA_API_KEY`.
- Discord bot/user tokens are **not** used for Rich Presence RPC.

## Runtime

- Discord **Desktop** must be running (not web-only).
- Bridge: `cd bridge && npm install && npm start` → `http://127.0.0.1:3847`
- Extension: Chrome → Load unpacked → `extension/`
- Health: `GET http://127.0.0.1:3847/health` → expect `"discord": true`

Presence priority:

1. AnimeEnigma API `watching` (`/api/users/me/activity/*`)
2. Else extension page context (browse / game / profile / …)
3. Else clear

API docs: https://animeenigma.org/api-docs/

## Git & GitHub (owner rules)

- Commit subjects **must** start with `feat:`, `fix:`, or `refactor:` (Conventional Commits style).
- **Do not** invent/propose commit messages and **do not** push unless the user explicitly asks in the current message.
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
- Future product direction: package the bridge as a click-to-run companion (no `npm start` for end users). Do not pretend a pure-extension Rich Presence is possible.

## Useful paths

- Bridge entry: `bridge/src/index.js`
- Extension content script: `extension/content.js`
- Extension SW: `extension/background.js`
- Manifest MV3: `extension/manifest.json`

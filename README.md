# AnimeEnigma → Discord Rich Presence

Chrome extension + local bridge. Shows what you’re doing on [animeenigma.org](https://animeenigma.org) in your Discord status.

## What you need from Discord

Only one value: **Application ID (Client ID)**.  
No bot token. No user token. No OAuth client secret.

### Steps

1. Open **[Discord Developer Portal](https://discord.com/developers/applications)** and sign in.
2. **New Application** → name it e.g. `AnimeEnigma` (this name appears in the status line).
3. Open the app → **General Information** → copy **Application ID**.
4. (Optional) Left sidebar → **Rich Presence** → **Art Assets** → upload a logo. Remember the asset name (e.g. `logo`) for `DISCORD_LARGE_IMAGE_KEY`.

Docs: [Setting Rich Presence](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence) (RPC needs Discord Desktop).

## What you need from AnimeEnigma

Optional but recommended: **personal API key** (`ak_…`).

- Profile settings on the site → generate API key  
- API reference: **[https://animeenigma.org/api-docs/](https://animeenigma.org/api-docs/)**  
- Spec: [/openapi.json](https://animeenigma.org/openapi.json)

Used by the bridge for:

- `GET /api/users/me/activity/current`
- `GET /api/users/me/activity/stream` (SSE)

That is the authoritative “watching right now” signal (title, episode, live flag).  
Without the key, presence still works from the open tab (URL + DOM + public `GET /api/anime/{id}`).

## Setup

```bash
cd animeenigma-activity-ds-extension
cp .env.example .env
# edit .env → DISCORD_CLIENT_ID=... and ANIMEENIGMA_API_KEY=ak_...

cd bridge
npm install
npm start
```

Leave **Discord Desktop** running.

### Load the extension (Chrome / Edge / Brave)

1. `chrome://extensions` → Developer mode → **Load unpacked**
2. Select the `extension/` folder
3. Open animeenigma.org — popup should show bridge health

## How priority works

1. **API watching** (`state: watching`) → Discord “Watching …” with anime + episode  
2. Else **current tab** (catalog, game, profile, anime page, …)  
3. Else clear presence (no tab heartbeat / idle)

## `.env` fields

| Variable | Required | Where from |
|---|---|---|
| `DISCORD_CLIENT_ID` | yes | Developer Portal → Application ID |
| `ANIMEENIGMA_API_KEY` | recommended | Site profile → API key (`ak_…`) |
| `BRIDGE_PORT` | no | default `3847` |
| `DISCORD_LARGE_IMAGE_KEY` | no | Art asset name |
| `ANIMEENIGMA_API_BASE` | no | default `https://animeenigma.org` |

## Requirements

- Discord **Desktop** (not only browser)
- Node.js 18+
- Bridge process running locally

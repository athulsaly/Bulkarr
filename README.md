# Bulkarr

Bulk-add movies and TV series to Radarr and Sonarr. Paste a list of titles, review the matches, and add them all at once.

## Quick Start (Docker)

```bash
cp .env.example .env
# edit .env with your Radarr/Sonarr URLs and API keys
docker compose up -d
```

Open http://localhost:3000.

## Features

- Paste any number of titles (one per line)
- Batch lookup via Radarr/Sonarr search APIs
- Review table with match picker for ambiguous results
- Per-row quality profile and root folder overrides
- In-library detection (already-added titles highlighted)
- Session persists across page refresh and container restart
- All API keys stay server-side — never sent to the browser

## Configuration

Settings can be provided via environment variables (seeded on first boot) or through the in-app Settings drawer.

| Variable | Purpose |
|---|---|
| `RADARR_URL` | Radarr base URL, e.g. `http://radarr:7878` |
| `RADARR_API_KEY` | Radarr API key |
| `SONARR_URL` | Sonarr base URL, e.g. `http://sonarr:8989` |
| `SONARR_API_KEY` | Sonarr API key |
| `DATA_DIR` | Where `store.json` lives (default: `./data`) |
| `PORT` | Listen port (default: `3000`) |

## Joining an Existing Docker Network

If Radarr and Sonarr are in a Docker network called `media`, uncomment the `networks` block in `docker-compose.yml` and use container names in the URL fields.

## Development

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # Jest test suite
pnpm tsc --noEmit  # type check
```

## Security Note

This is a LAN-internal tool with no authentication. Do not expose it to the public internet.

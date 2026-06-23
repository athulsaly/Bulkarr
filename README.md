# Bulkarr

Bulk-add movies and TV series to Radarr and Sonarr. Paste or upload a list of titles, review the matches, and submit them all at once.

## Quick Start (Docker)

```bash
docker compose up -d
```

Open http://localhost:1947. On first run you'll be taken through a setup screen to enter your Radarr/Sonarr URLs and API keys — no `.env` editing needed.

## Features

- **Input** — paste titles one per line or comma-separated, or upload a txt/csv file with any delimiter
- **Lookup** — batch search via Radarr/Sonarr APIs with throttled concurrency
- **Review table** — match picker for ambiguous results, per-row quality profile and root folder overrides
- **Poster card view** — grid layout with posters when a TMDB API key is configured
- **Select / deselect all** — with indeterminate checkbox state; no-match and in-library rows are always excluded
- **In-library detection** — already-added titles are flagged and skipped automatically
- **No-matches drawer** — lists unmatched titles from both tabs; retry or clear them
- **History** — server-persisted log of everything added, filterable by movies/series, with per-item and bulk removal
- **Per-target sessions** — movies and series tabs have independent state that survives refresh and container restart
- **Security** — all API keys stay server-side; never sent to the browser

## Configuration

Service URLs and API keys are entered through the in-app setup screen and Settings drawer. The only environment variables are:

| Variable   | Default  | Purpose                                   |
| ---------- | -------- | ----------------------------------------- |
| `DATA_DIR` | `./data` | Directory where `store.json` is persisted |
| `PORT`     | `1947`   | Listen port                               |

## Docker

```bash
docker compose up -d        # start
docker compose down         # stop (data volume is preserved)
docker compose pull && docker compose up -d  # update
```

Data is stored in the named volume `bulkarr-data`. To back it up:

```bash
docker run --rm -v bulkarr-data:/data -v $(pwd):/out alpine \
  tar czf /out/bulkarr-backup.tar.gz /data
```

### Joining an existing Docker network

If Radarr and Sonarr run in a Docker network (e.g. `media`), uncomment the `networks` block in `docker-compose.yml` and use container names as the service URLs.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:1947
pnpm build        # production build
pnpm lint         # ESLint
pnpm tsc --noEmit # type check
```

## Security

This is a LAN-internal tool with no authentication. Do not expose it to the public internet.

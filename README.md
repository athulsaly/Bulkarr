# Bulkarr

Bulk-add and manage movies and TV series in Radarr and Sonarr. Paste a list of titles, review matches, and submit them all at once — then automate cleanup with watched-media rules.

## Quick Start (Docker)

```bash
docker compose up -d
```

Open http://localhost:1947. On first run you'll be taken through a setup screen to enter your Radarr/Sonarr and Jellyfin/Plex URLs and API keys — no `.env` editing needed.

## Features

### Bulk Add
- **Input** — paste titles one per line or comma-separated, or upload a txt/csv file with any delimiter
- **Lookup** — batch search via Radarr/Sonarr APIs with throttled concurrency
- **Review table** — match picker for ambiguous results, per-row quality profile and root folder overrides
- **Select / deselect all** — indeterminate checkbox state; no-match and in-library rows are excluded automatically
- **In-library detection** — already-added titles are flagged and skipped
- **No-matches drawer** — lists unmatched titles from both tabs; retry or clear them
- **History** — server-persisted log of everything added, filterable by movies/series, with per-item and bulk removal
- **Per-target sessions** — movies and series tabs have independent state that survives refresh and restart

### Manage
- **Batch actions** — paste or type titles, parse and match against your library, then remove or unmonitor in bulk with a single request to Radarr/Sonarr
- **Select all / batch footer** — checkbox select with indeterminate state; sticky action bar shows matched item count

### Library
- **Full library view** — browse all movies and series from Radarr/Sonarr with sort and filter options (monitored status, files, assigned rules, quality profile, arr status)
- **Poster card view** — grid layout with posters pulled from Radarr/Sonarr; cached locally so they don't reload on every visit
- **List and card views** — toggle between table and poster grid
- **Rule assignment** — assign auto-delete rules to individual titles or batch-assign to multiple selected items

### Auto-Delete Rules
- **Reusable rules** — create a rule once (name, action, delay) and assign it to as many titles as you want; no duplication
- **Assignable targets** — each rule holds a list of assigned titles (`arrId` + arr instance); only fires for titles explicitly assigned to it
- **Multiple rules per title** — a title can have several rules (e.g. "Unmonitor after 7 days" and "Delete after 30 days")
- **Granularity** — act at the movie, episode, or season level
- **Actions** — delete (with or without files) or unmonitor
- **Configurable delay** — days, weeks, months, or 1 year after watched
- **Deletion queue** — pending actions are visible and can be triggered manually, cancelled, or re-evaluated
- **Watched events** — populated by polling Jellyfin/Plex or via webhook

### General
- **Security** — all API keys stay server-side; never sent to the browser
- **Data persistence** — everything stored in a single `store.json` file; mount a volume to survive container restarts

## Configuration

Service URLs and API keys are entered through the in-app setup screen and Settings drawer. The only environment variables are:

| Variable   | Default  | Purpose                                   |
| ---------- | -------- | ----------------------------------------- |
| `DATA_DIR` | `./data` | Directory where `store.json` is persisted |
| `PORT`     | `1947`   | Listen port                               |

## Docker

```bash
docker compose up -d                          # start
docker compose down                           # stop (data volume preserved)
docker compose pull && docker compose up -d   # update
```

Data is stored in the named volume `bulkarr-data`. To back it up:

```bash
docker run --rm -v bulkarr-data:/data -v $(pwd):/out alpine \
  tar czf /out/bulkarr-backup.tar.gz /data
```

### Persistent storage on TrueNAS / NAS

Mount a host path into the container so data survives upgrades:

```yaml
volumes:
  - /mnt/pool/bulkarr:/app/data
```

### Joining an existing Docker network

If Radarr and Sonarr run in a Docker network (e.g. `media`), uncomment the `networks` block in `docker-compose.yml` and use container names as the service URLs.

## Development

```bash
pnpm install
pnpm dev               # http://localhost:1947
pnpm build             # production build
pnpm test              # Jest test suite
pnpm exec tsc --noEmit # type check
pnpm lint              # ESLint
```

## Security

This is a LAN-internal tool with no authentication. Do not expose it to the public internet.

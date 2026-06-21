# Bulkarr — Design Spec
**Date:** 2026-06-22
**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, pnpm, Docker (standalone)

---

## 1. Purpose

A LAN-internal power-user web tool that takes a pasted list of movie or TV series titles, resolves each via the Radarr/Sonarr lookup APIs, lets the user review and correct matches, then adds them in bulk. All state survives page refresh and container restart. Runs as a Docker container alongside an existing self-hosted media stack.

---

## 2. Project Structure

```
bulkarr/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/
│       ├── health/route.ts
│       ├── settings/route.ts
│       ├── settings/test/route.ts
│       ├── cache/route.ts
│       ├── lookup/route.ts
│       └── submit/route.ts
├── components/
│   ├── SettingsDrawer.tsx
│   ├── DefaultsBar.tsx
│   ├── InputPanel.tsx
│   ├── ReviewTable.tsx
│   ├── ReviewRow.tsx
│   └── MatchPicker.tsx
├── hooks/
│   ├── useSettings.ts
│   ├── useSession.ts
│   ├── useLookup.ts
│   └── useSubmit.ts
├── lib/
│   ├── store.ts
│   ├── arr-client.ts
│   └── types.ts
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .dockerignore
└── next.config.js
```

**Data flow:** Browser → Next.js route handlers → *arr APIs. API keys never reach the browser. No CORS issues.

---

## 3. Data Model

### Server-side store (`$DATA_DIR/store.json`)

```typescript
interface Store {
  settings: {
    radarr: { url: string; apiKey: string } | null;
    sonarr: { url: string; apiKey: string } | null;
  };
  cache: {
    radarr: {
      profiles: QualityProfile[];
      rootFolders: RootFolder[];
      library: LibraryItem[];
      fetchedAt: number;
    } | null;
    sonarr: {
      profiles: QualityProfile[];
      rootFolders: RootFolder[];
      langProfiles: LangProfile[];
      library: LibraryItem[];
      fetchedAt: number;
    } | null;
  };
  sessions: {
    movies: Session | null;
    series: Session | null;
  };
}

interface Session {
  target: 'movies' | 'series';
  defaults: DefaultsConfig;
  rawInput: string;
  rows: ReviewRow[];
  updatedAt: number;
}

interface ReviewRow {
  id: string;                        // stable uuid assigned at parse time
  inputText: string;
  candidates: ArrItem[];             // full lookup results for MatchPicker
  selectedIndex: number;             // which candidate is active
  overrides: Partial<DefaultsConfig>;
  included: boolean;
  status: 'pending' | 'matched' | 'no_match' | 'in_library' | 'added' | 'failed';
  errorMessage?: string;
}

interface DefaultsConfig {
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  minimumAvailability?: 'announced' | 'inCinemas' | 'released'; // Radarr only
  searchOnAdd: boolean;
  seriesType?: 'standard' | 'anime' | 'daily';                  // Sonarr only
  seasonFolder?: boolean;                                         // Sonarr only
  monitorOption?: string;                                         // Sonarr only
}
```

### Persistence rules

- `settings` and `cache` — written to store immediately on change (small, infrequent).
- `sessions` — written to store debounced at 800ms after any change (survives container restart).
- `rawInput`, `target`, `defaults` — also mirrored to `localStorage` for instant hydration on refresh before server response arrives.
- API keys — server store only; `GET /api/settings` returns masked keys (`sk-...••••••••`).

---

## 4. API Route Handlers

All route handlers read config from the server-side store. No secrets in request parameters.

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | `{ status: "ok", version: string }` — used by Docker HEALTHCHECK |
| `/api/settings` | GET | Config (masked keys) + cached profiles/folders/sessions |
| `/api/settings` | POST | Save config; seeds from env vars on first boot if present |
| `/api/settings/test` | POST | `{ service: 'radarr'|'sonarr' }` → hits `/api/v3/system/status` → `{ ok, version, error? }` |
| `/api/cache` | POST | `{ service }` → fetches profiles, root folders, library; saves to store |
| `/api/lookup` | POST | `{ target, terms: string[] }` → throttled lookups → `{ results: ArrItem[][] }` |
| `/api/submit` | POST | `{ target, rows: ReviewRow[] }` → throttled POSTs → `{ results: SubmitResult[] }` |

### `lib/arr-client.ts`

Typed fetch wrapper used by all route handlers:
- Reads URL + API key from store (never from request params)
- Prepends configured base path for reverse proxy support
- Attaches `X-Api-Key` header
- Throws `ArrError` with structured `{ code, status, message }` on failure

### Error taxonomy

| Code | Meaning |
|---|---|
| `UNREACHABLE` | fetch threw — ECONNREFUSED, timeout |
| `AUTH_FAILED` | arr returned 401 |
| `BAD_REQUEST` | arr returned 400 (e.g. already exists) |
| `NOT_FOUND` | arr returned 404 |
| `UNKNOWN` | anything else, includes raw HTTP status |

### Throttling

`/api/lookup` and `/api/submit` use an in-process async queue: max 3 concurrent requests, 300ms minimum gap between dispatches. No external dependency — implemented with `async/await` + a concurrency counter.

### Radarr POST body

```json
{
  "tmdbId": 12345,
  "title": "...",
  "qualityProfileId": 1,
  "rootFolderPath": "/movies",
  "monitored": true,
  "minimumAvailability": "released",
  "addOptions": { "searchForMovie": true }
}
```

### Sonarr POST body

```json
{
  "tvdbId": 12345,
  "title": "...",
  "qualityProfileId": 1,
  "languageProfileId": 1,
  "rootFolderPath": "/tv",
  "monitored": true,
  "seasonFolder": true,
  "seriesType": "standard",
  "addOptions": { "searchForMissingEpisodes": true, "monitor": "all" }
}
```

---

## 5. Custom Hooks

### `useSettings`
- Mount: `GET /api/settings`
- Exposes: `settings`, `cache`, `saveSettings(config)`, `testConnection(service)`, `refreshCache(service)`
- Drives SettingsDrawer and all profile/folder dropdowns

### `useSession`
- Mount: `GET /api/settings` for persisted session + `localStorage` for instant paint
- Manages: `target`, `defaults`, `rawInput`, `rows`
- Debounced effect (800ms): POSTs session to server
- Mirrors non-secret fields to `localStorage` synchronously
- Exposes: `setTarget`, `setDefaults`, `setRawInput`, `setRows`, `updateRow`, `clearSession`

### `useLookup`
- `lookup()`: parses non-empty lines → `POST /api/lookup` → populates rows
- Tracks `progress: { done: number, total: number }`
- One failing line → that row's status = `no_match`; batch never aborts
- On complete: cross-references `cache.library` to mark `in_library` rows

### `useSubmit`
- `submit(rows)`: filters to `included` + `matched` rows → `POST /api/submit`
- Updates each row's status live as results arrive
- Tracks `summary: { added, skipped, failed }` for post-submit banner

---

## 6. UI Components

**Theme:** `bg-slate-900` background, `text-slate-100`, warm orange accent (`orange-500`). Dense, utility-feel.

### Layout
Single-page app. Slim top bar (app name, settings gear, cache refresh). Stacked sections below: DefaultsBar → InputPanel → ReviewTable → (fixed) Submit bar.

### `SettingsDrawer`
Slides in from right. Two sections (Radarr / Sonarr):
- URL input, API key input (masked after save)
- Test Connection button → inline version badge or error
- Save button
Bottom: data directory path (read-only), Refresh Cache button per service.

### `DefaultsBar`
Compact horizontal strip:
- Left: Movies / Series radio toggle
- Right: Quality Profile dropdown, Root Folder dropdown, Monitored toggle, Minimum Availability (Radarr), Search on Add toggle
- Sonarr extras (Series Type, Season Folder) appear when Series is active

### `InputPanel`
- Full-width monospace textarea (`bg-slate-800`, `h-40`)
- Live non-empty line count badge
- `Parse & Look Up` button (disabled when empty or lookup running)
- Progress bar during lookup (`progress.done / progress.total`)

### `ReviewTable`
- Appears after first lookup
- Sticky header
- Virtualised when row count > 100 (via `@tanstack/react-virtual`)
- Columns: `☐ | Input | Match | Status | Overrides | Actions`

### `ReviewRow`
- Checkbox (include/exclude)
- Truncated input text (full on hover)
- Match block: 32×48px poster, title + year + id, or "No match" in red
- `MatchPicker`: `<select>` of other candidates (title + year)
- Status badge: colour-coded pill
  - Pending = slate, Matched = blue, No Match = red, In Library = yellow, Added = green, Failed = red
- Override dropdowns (Quality Profile, Root Folder) — collapsed by default, expand on click
- Actions: re-search button, delete row button

### `MatchPicker`
Compact `<select>` populated from `row.candidates` (already fetched — no new API call). Selecting updates `row.selectedIndex`.

### Toasts
`useToast` hook + `<ToastStack>` fixed bottom-right. No library. Covers: connection test, cache refresh, submit summary, any global error.

### Submit bar
Fixed bottom strip when rows exist:
- `Add Selected (N)` button (orange, disabled during submission)
- Post-submit summary banner: "X added · Y skipped · Z failed"

---

## 7. Docker & Deployment

### `next.config.js`
```js
output: 'standalone'
```

### Dockerfile (multi-stage)

- **Stage 1 `deps`:** `node:20-alpine`, install with `pnpm install --frozen-lockfile`
- **Stage 2 `builder`:** copy source + node_modules, run `pnpm build`
- **Stage 3 `runner`:** `node:20-alpine`, non-root user `nextjs`, copy standalone output + static + public, `EXPOSE $PORT`, HEALTHCHECK on `/api/health`, `CMD ["node", "server.js"]`

### `docker-compose.yml`
- Single service, builds from Dockerfile
- Named volume mounted to `DATA_DIR` (`/app/data`)
- `env_file: .env`
- `restart: unless-stopped`
- HEALTHCHECK: curl `/api/health`, 30s interval, 5s timeout, 3 retries
- Commented example for joining an external Docker network (e.g. `media`) so Radarr/Sonarr are reachable by container name

### `.env.example`
```
RADARR_URL=
RADARR_API_KEY=
SONARR_URL=
SONARR_API_KEY=
DATA_DIR=./data
PORT=3000
```

### `.dockerignore`
Excludes: `node_modules`, `.next`, `.git`, `data`, `.env`, `docs`

---

## 8. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `RADARR_URL` | — | Seeds Radarr base URL on first boot |
| `RADARR_API_KEY` | — | Seeds Radarr API key on first boot |
| `SONARR_URL` | — | Seeds Sonarr base URL on first boot |
| `SONARR_API_KEY` | — | Seeds Sonarr API key on first boot |
| `DATA_DIR` | `./data` | Where `store.json` lives |
| `PORT` | `3000` | Container listen port |

Env vars are seed-only: if `store.json` already contains settings, env vars are ignored (Settings panel takes precedence).

---

## 9. Error Handling

- Every route handler catches `ArrError` and returns `{ error: { code, message } }` with appropriate HTTP status.
- Route handlers never throw uncaught errors — all paths return valid JSON.
- Lookup and submit batch errors are per-row: one failure never aborts the batch.
- UI surfaces per-row errors in the status badge + tooltip; global errors go to the toast stack.
- "Service unreachable", "auth failed", and "bad request" are distinguished by error code, not just HTTP status.
- Root folder mismatch (chosen path not in fetched list) shows a yellow warning in the row.

---

## 10. Security Note

This is a LAN-internal tool with no authentication. Do not expose it to the public internet. If remote access is needed, place it behind an existing reverse proxy or VPN. API keys are stored in the server-side JSON store and are never sent to the browser in plain text.

# Auto-Delete Rules Engine (Subsystem B) — Design Spec

**Date:** 2026-07-03
**Status:** Approved
**Subsystem:** B of 2 (consumes Subsystem A: Media Server Integration)

## Summary

Add a configurable auto-delete rules engine to Bulkarr. Rules fire against watched events stored by Subsystem A and schedule deletions in Radarr/Sonarr with a configurable delay. Supports movie deletion, per-episode deletion, and whole-season file deletion. A durable queue in `store.json` survives server restarts. A background executor runs every 5 minutes to fire overdue items. A "Rules" tab in the main UI manages rules and the queue. A manual trigger in the Watched Events drawer fires immediately.

---

## New Types (`lib/types.ts`)

```ts
export interface AutoDeleteRule {
  id: string
  name: string
  enabled: boolean
  mediaType: 'movie' | 'series'
  granularity: 'movie' | 'episode' | 'season'  // 'movie' only when mediaType='movie'
  action: 'delete' | 'unmonitor'
  deleteFiles: boolean   // only relevant when action='delete'
  delayAmount: number    // >= 1
  delayUnit: 'days' | 'weeks' | 'months' | 'year'
  scope: 'global' | 'specific'
  arrId?: number         // required when scope='specific'
  arrTarget?: 'movies' | 'series'
  scopeTitle?: string    // display name for the specific title
}

export type DeletionQueueStatus = 'pending' | 'done' | 'failed' | 'cancelled'

export interface DeletionQueueItem {
  id: string
  ruleId: string
  ruleName: string
  watchedEventId: string
  arrId: number
  arrTarget: 'movies' | 'series'
  action: 'delete' | 'unmonitor'
  deleteFiles: boolean
  granularity: 'movie' | 'episode' | 'season'
  title: string
  seriesTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  scheduledAt: number    // ms — watchedAt + delayToMs(rule)
  status: DeletionQueueStatus
  retryCount: number     // incremented on failure; max 3
  executedAt?: number
  errorMessage?: string
}
```

**`Store` additions:**
```ts
rules: AutoDeleteRule[]          // default []
deletionQueue: DeletionQueueItem[]  // default []; capped at 500, oldest done/failed/cancelled trimmed first
```

---

## New File: `lib/rule-engine.ts`

Pure function — no I/O, fully testable:

```ts
export function evaluateRules(
  event: WatchedEvent,
  rules: AutoDeleteRule[],
  existingQueue: DeletionQueueItem[],
  watchedEvents: WatchedEvent[],
): DeletionQueueItem[]
```

**Rule matching logic:**
1. Only `enabled === true` rules are considered
2. `event.mediaType === 'movie'` matches rules with `mediaType: 'movie'`; `event.mediaType === 'episode'` matches `mediaType: 'series'`
3. `scope: 'specific'` rules (matching `arrId === event.arrId`) take priority over `scope: 'global'` — only the most specific matching rule fires per event+granularity
4. For `granularity: 'episode'`: one queue item per episode watched event
5. For `granularity: 'season'`: triggered by any episode event, but only if no non-cancelled queue item already exists for that `ruleId + arrId + seasonNumber`; `scheduledAt = max(watchedAt across all matched watched events for that season) + delay`

**Deduplication:** Before creating a queue item, check `existingQueue` for a non-cancelled item matching `ruleId + arrId + seasonNumber + episodeNumber`. Skip if found.

**`delayToMs(amount, unit)`** helper (exported):
- `days`: `amount * 86_400_000`
- `weeks`: `amount * 7 * 86_400_000`
- `months`: `amount * 30 * 86_400_000`
- `year`: `365 * 86_400_000`

**Called from:** poller and webhook routes (inside `updateStore` after a watched event is stored), and `POST /api/deletion-queue/evaluate`.

---

## New Functions in `lib/arr-client.ts`

Four new functions for episode/season-level Sonarr operations:

```ts
// Delete a single episode's file
export async function deleteEpisodeFile(
  url: string, key: string,
  seriesId: number, seasonNumber: number, episodeNumber: number,
): Promise<void>
// GET /api/v3/episodefile?seriesId={id}&seasonNumber={s}
// Find entry where episodeNumber matches → DELETE /api/v3/episodefile/{fileId}
// No-op if episode file not found (already deleted)

// Delete all episode files in a season
export async function deleteSeasonFiles(
  url: string, key: string,
  seriesId: number, seasonNumber: number,
): Promise<void>
// GET /api/v3/episodefile?seriesId={id}&seasonNumber={s}
// DELETE all returned fileIds in parallel

// Unmonitor a single episode
export async function unmonitorEpisode(
  url: string, key: string,
  seriesId: number, seasonNumber: number, episodeNumber: number,
): Promise<void>
// GET /api/v3/episode?seriesId={id}&seasonNumber={s}
// Find episode by episodeNumber → PUT /api/v3/episode/{id} with monitored: false

// Unmonitor an entire season
export async function unmonitorSeason(
  url: string, key: string,
  seriesId: number, seasonNumber: number,
): Promise<void>
// GET /api/v3/series/{id}
// Set seasons[n].monitored = false → PUT /api/v3/series/{id}
```

---

## New File: `lib/deletion-executor.ts`

```ts
export function startDeletionExecutor(): void
```

Recursive `setTimeout`, interval: 5 minutes (fixed, not configurable).

**Each tick:**
1. Read `store.deletionQueue` — find items where `status === 'pending'` AND `scheduledAt <= now`
2. For `granularity: 'season'` items: check episode completion before firing:
   - Count distinct `episodeNumber` values in `store.watchedEvents` where `arrId` and `seasonNumber` match
   - `GET /api/v3/episodefile?seriesId={id}&seasonNumber={n}` — count downloaded files
   - If watched count < downloaded count: reschedule `scheduledAt = now + 24h`, continue to next item
3. Execute based on `granularity + action` dispatch table:

| granularity | action | function |
|---|---|---|
| `movie` | `delete` | `deleteMovie(url, key, arrId, deleteFiles)` |
| `movie` | `unmonitor` | `unmonitorMovie(url, key, arrId)` |
| `episode` | `delete` | `deleteEpisodeFile(url, key, arrId, season, episode)` |
| `episode` | `unmonitor` | `unmonitorEpisode(url, key, arrId, season, episode)` |
| `season` | `delete` | `deleteSeasonFiles(url, key, arrId, season)` |
| `season` | `unmonitor` | `unmonitorSeason(url, key, arrId, season)` |

4. On success: `status = 'done'`, `executedAt = now`
5. On error: `retryCount++`; if `retryCount >= 3`: `status = 'failed'`, `errorMessage = e.message`; else leave `pending` for next tick
6. Each item is isolated in its own try/catch — one failure never blocks others

**`instrumentation.ts`** updated to call `startDeletionExecutor()` alongside `startMediaPoller()`.

---

## API Routes

All routes: `export const runtime = 'nodejs'`

### `app/api/rules/route.ts`
- **GET** — returns `{ rules: AutoDeleteRule[] }`
- **POST** — validates body, generates uuid, saves rule; then calls `evaluateRules` against all `matched` watched events and enqueues results; returns `{ rule, enqueued: number }`

### `app/api/rules/[id]/route.ts`
- **PUT** — validate + update rule; re-evaluate and enqueue new matches
- **DELETE** — remove rule; set all `pending` queue items with that `ruleId` to `status: 'cancelled'`

**Validation (POST + PUT):**
- `delayAmount >= 1`
- `delayUnit` ∈ `['days', 'weeks', 'months', 'year']`
- `scope: 'specific'` requires `arrId` and `arrTarget`
- `granularity: 'season' | 'episode'` only when `mediaType: 'series'`
- `granularity: 'movie'` only when `mediaType: 'movie'`

### `app/api/deletion-queue/route.ts`
- **GET** — returns `{ items: DeletionQueueItem[] }`; optional `?status=pending|done|failed|cancelled` filter

### `app/api/deletion-queue/[id]/route.ts`
- **DELETE** — cancel one pending item (`status = 'cancelled'`); 400 if not pending

### `app/api/deletion-queue/[id]/execute/route.ts`
- **POST** — execute one item immediately regardless of `scheduledAt`; same dispatch table as executor; returns `{ ok, errorMessage? }`

### `app/api/deletion-queue/trigger/route.ts`
- **POST** — run one full executor cycle synchronously; returns `{ executed: number, failed: number }`

### `app/api/deletion-queue/evaluate/route.ts`
- **POST** — re-evaluate all `matched` watched events against current rules; enqueues new items; returns `{ enqueued: number }`

### `app/api/deletion-queue/execute-event/route.ts`
- **POST** `{ watchedEventId }` — evaluates rules for that specific event (creating queue items if none exist), then immediately executes all resulting items; returns `{ executed: number, errorMessage?: string }`. Used by the WatchedDrawer "Delete now" button.

---

## UI

### `components/RulesPanel.tsx`

New component rendered when the "Rules" tab is active. Two sections separated by a divider:

**Rules section:**
- "Add Rule" button → inline form expands:
  - Name (text input)
  - Media type: Movie / Series (toggle)
  - Granularity: Movie (movies only) / Episode / Season (series only)
  - Action: Delete / Unmonitor
  - Delete files checkbox (visible only when action=Delete)
  - Delay: number input + unit select (days / weeks / months / year)
  - Scope: Global / Specific title
  - For "Specific": search input filtering `store.cache.radarr.library` or `sonarr.library` — shows matching titles, select one
  - Save / Cancel buttons
- Rules list: one row per rule showing name, delay string (e.g. "7 days"), action badge, scope badge (`⚡ Global` or title name), enabled toggle (PATCH on change), edit (pencil) and delete (×) buttons

**Queue section:**
- Header: "Deletion Queue" + "Run overdue" button (`POST /api/deletion-queue/trigger`) + "Re-evaluate" button (`POST /api/deletion-queue/evaluate`)
- Filter tabs: All / Pending / Done / Failed / Cancelled (with counts)
- Each row: title (+ S01E03 label for episodes/seasons), rule name, relative scheduled time ("in 3 days" / "overdue 2h ago"), status chip; for pending: "Trigger now" button + "Cancel" button

### `components/WatchedDrawer.tsx` (modification)

Each row where `matchStatus === 'matched'` gets a small "⚡" icon button. On click:
1. `POST /api/deletion-queue/execute-event` with `{ watchedEventId }`
2. Show inline result: "Deleted" on success, or error message on failure

If no rule matches this event, the button is disabled with tooltip "No matching rule". The route handles evaluation + execution atomically — the UI does not need to know the queue item ID.

### `app/page.tsx` (modification)

- A top-level "Rules" button added to the page header (alongside the existing "Watched" and "History" buttons)
- New state: `const [rulesOpen, setRulesOpen] = useState(false)`
- When `rulesOpen === true`: render `<RulesPanel />` as a full-width overlay replacing the main content area (DefaultsBar, InputPanel, ReviewTable all hidden); a back button ("← Back") returns to the previous view
- The existing `activeTarget` (`'movies' | 'series'`) state is unchanged and preserved when switching to/from Rules

---

## What is NOT in scope for Subsystem B

- Per-episode retry notifications (email/push)
- Dry-run mode ("show what would be deleted without deleting")
- Rule priority ordering beyond global/specific
- Bulk rule import/export
- Integration with Plex/Jellyfin watchlists for "keep if on watchlist"

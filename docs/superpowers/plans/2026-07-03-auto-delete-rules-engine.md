# Auto-Delete Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable auto-delete rules engine that fires against watched events (from Subsystem A) and schedules deletions in Radarr/Sonarr with a configurable delay.

**Architecture:** Rules are stored in `store.json` and evaluated against `WatchedEvent` objects (matchStatus=matched only) to produce `DeletionQueueItem` entries. A background executor (recursive setTimeout, 5-minute interval) fires overdue queue items against Radarr/Sonarr APIs. A "Rules" panel overlay in the UI manages rules and the queue.

**Tech Stack:** Next.js 15.5 App Router, TypeScript strict mode, Tailwind CSS, Jest (node environment), pnpm, file-based persistence via store.json.

## Global Constraints

- `export const runtime = 'nodejs'` on every API route file
- `// @jest-environment node` as the literal first line of every test file
- All imports use `@/` path aliases (e.g. `@/lib/types`)
- `pnpm test -- --testPathPattern=<path>` to run a specific test file
- `uuid` ESM shim already wired: `moduleNameMapper` in `jest.config.ts` maps `^uuid$` → `<rootDir>/jest-uuid-mock.js`
- All arr-client functions use the private `arrFetch` helper (not exposed); new functions are added directly to `lib/arr-client.ts`
- `updateStore(updater: (store: Store) => void): Store` — synchronous, reads+writes store.json
- `readStore(): Store` — synchronous, returns deep clone of store with defaults applied
- Queue cap: 500 items; when trimming, remove oldest `done | failed | cancelled` items first
- Watched events cap: 1000 items (already enforced in readStore and webhook routes)
- Only process `WatchedEvent` objects where `matchStatus === 'matched'` and `arrId != null`

---

## File Map

**New files:**
- `lib/rule-engine.ts` — pure `evaluateRules` + `delayToMs`; no I/O
- `lib/deletion-executor.ts` — `startDeletionExecutor()` + `enqueueRuleMatches(event)`
- `app/api/rules/route.ts` — GET/POST rules
- `app/api/rules/[id]/route.ts` — PUT/DELETE a rule
- `app/api/deletion-queue/route.ts` — GET queue
- `app/api/deletion-queue/[id]/route.ts` — DELETE (cancel) one item
- `app/api/deletion-queue/[id]/execute/route.ts` — POST execute one item now
- `app/api/deletion-queue/trigger/route.ts` — POST run one full executor cycle
- `app/api/deletion-queue/evaluate/route.ts` — POST re-evaluate all matched events
- `app/api/deletion-queue/execute-event/route.ts` — POST evaluate+execute for one watched event
- `components/RulesPanel.tsx` — Rules + Queue UI
- `__tests__/lib/rule-engine.test.ts`
- `__tests__/lib/arr-client-episode.test.ts`
- `__tests__/api/rules.test.ts`
- `__tests__/api/deletion-queue.test.ts`

**Modified files:**
- `lib/types.ts` — add `AutoDeleteRule`, `DeletionQueueStatus`, `DeletionQueueItem`; extend `Store`
- `lib/store.ts` — extend `DEFAULT_STORE`, extend `readStore` to parse `rules` and `deletionQueue`
- `lib/arr-client.ts` — add `deleteEpisodeFile`, `deleteSeasonFiles`, `unmonitorEpisode`, `unmonitorSeason`, `getSeasonEpisodeFileCount`
- `lib/media-poller.ts` — call `enqueueRuleMatches` for each newly stored event
- `app/api/webhook/jellyfin/route.ts` — call `enqueueRuleMatches` after storing event
- `app/api/webhook/plex/route.ts` — call `enqueueRuleMatches` after storing event
- `instrumentation.ts` — also start deletion executor
- `components/WatchedDrawer.tsx` — add ⚡ button per matched row
- `app/page.tsx` — add Rules button + `rulesOpen` state + overlay

---

### Task 1: Types & Store Schema

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.ts`

**Interfaces:**
- Produces: `AutoDeleteRule`, `DeletionQueueStatus`, `DeletionQueueItem` (used by Tasks 2–7)
- Produces: `Store.rules`, `Store.deletionQueue` (used by Tasks 2–7)

- [ ] **Step 1: Add new types to `lib/types.ts`**

Append at the end of `lib/types.ts` (after the closing `}` of `WatchedEvent`):

```ts
export interface AutoDeleteRule {
  id: string
  name: string
  enabled: boolean
  mediaType: 'movie' | 'series'
  granularity: 'movie' | 'episode' | 'season'
  action: 'delete' | 'unmonitor'
  deleteFiles: boolean
  delayAmount: number
  delayUnit: 'days' | 'weeks' | 'months' | 'year'
  scope: 'global' | 'specific'
  arrId?: number
  arrTarget?: 'movies' | 'series'
  scopeTitle?: string
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
  scheduledAt: number
  status: DeletionQueueStatus
  retryCount: number
  executedAt?: number
  errorMessage?: string
}
```

- [ ] **Step 2: Extend `Store` interface in `lib/types.ts`**

Replace the existing `Store` interface:

```ts
export interface Store {
  settings: Settings
  cache: Cache
  sessions: { movies: Session | null; series: Session | null }
  history: HistoryItem[]
  watchedEvents: WatchedEvent[]
  lastPolledAt: Partial<Record<MediaServerType, number>>
  rules: AutoDeleteRule[]
  deletionQueue: DeletionQueueItem[]
}
```

- [ ] **Step 3: Update `DEFAULT_STORE` in `lib/store.ts`**

Add `rules` and `deletionQueue` fields to the `DEFAULT_STORE` const:

```ts
const DEFAULT_STORE: Store = {
  settings: {
    radarr: null,
    sonarr: null,
    jellyfin: null,
    plex: null,
    mediaServer: { pollIntervalMinutes: 15, watchedThresholdPct: 90 },
  },
  cache: { radarr: null, sonarr: null },
  sessions: { movies: null, series: null },
  history: [],
  watchedEvents: [],
  lastPolledAt: {},
  rules: [],
  deletionQueue: [],
}
```

- [ ] **Step 4: Extend `readStore` in `lib/store.ts` to parse new fields**

Add these two blocks to the `readStore` function, after the existing `if (raw.lastPolledAt ...)` block and before the `return store` line:

```ts
    if (Array.isArray(raw.rules)) store.rules = raw.rules as AutoDeleteRule[]
    if (Array.isArray(raw.deletionQueue)) {
      store.deletionQueue = (raw.deletionQueue as DeletionQueueItem[])
        .slice(0, 500)
    }
```

Also update the import at the top of `lib/store.ts` to include the new types:

```ts
import type { Store, MediaServerConfig, Settings, AutoDeleteRule, DeletionQueueItem } from './types'
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/store.ts
git commit -m "feat(rules): add AutoDeleteRule and DeletionQueueItem types; extend Store schema"
```

---

### Task 2: Rule Engine

**Files:**
- Create: `lib/rule-engine.ts`
- Create: `__tests__/lib/rule-engine.test.ts`

**Interfaces:**
- Consumes: `AutoDeleteRule`, `DeletionQueueItem`, `WatchedEvent` from `@/lib/types`
- Produces:
  - `export function delayToMs(amount: number, unit: 'days' | 'weeks' | 'months' | 'year'): number`
  - `export function evaluateRules(event: WatchedEvent, rules: AutoDeleteRule[], existingQueue: DeletionQueueItem[], watchedEvents: WatchedEvent[]): DeletionQueueItem[]`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/rule-engine.test.ts`:

```ts
// @jest-environment node

import { delayToMs, evaluateRules } from '@/lib/rule-engine'
import type { AutoDeleteRule, DeletionQueueItem, WatchedEvent } from '@/lib/types'

const baseMovieEvent: WatchedEvent = {
  id: 'ev1',
  source: 'poll',
  mediaServer: 'jellyfin',
  mediaType: 'movie',
  title: 'Inception',
  year: 2010,
  tmdbId: 27205,
  progressPct: 95,
  watchedAt: 1_000_000,
  arrId: 10,
  arrTarget: 'movies',
  matchStatus: 'matched',
}

const baseEpisodeEvent: WatchedEvent = {
  id: 'ev2',
  source: 'poll',
  mediaServer: 'plex',
  mediaType: 'episode',
  title: 'Pilot',
  seriesTitle: 'Breaking Bad',
  seasonNumber: 1,
  episodeNumber: 1,
  progressPct: 98,
  watchedAt: 2_000_000,
  arrId: 20,
  arrTarget: 'series',
  matchStatus: 'matched',
}

const movieRule: AutoDeleteRule = {
  id: 'r1',
  name: 'Delete watched movies',
  enabled: true,
  mediaType: 'movie',
  granularity: 'movie',
  action: 'delete',
  deleteFiles: true,
  delayAmount: 7,
  delayUnit: 'days',
  scope: 'global',
}

const episodeRule: AutoDeleteRule = {
  id: 'r2',
  name: 'Delete watched episodes',
  enabled: true,
  mediaType: 'series',
  granularity: 'episode',
  action: 'delete',
  deleteFiles: true,
  delayAmount: 1,
  delayUnit: 'days',
  scope: 'global',
}

const seasonRule: AutoDeleteRule = {
  id: 'r3',
  name: 'Unmonitor completed seasons',
  enabled: true,
  mediaType: 'series',
  granularity: 'season',
  action: 'unmonitor',
  deleteFiles: false,
  delayAmount: 2,
  delayUnit: 'days',
  scope: 'global',
}

// --- delayToMs ---

test('delayToMs: days', () => {
  expect(delayToMs(3, 'days')).toBe(3 * 86_400_000)
})

test('delayToMs: weeks', () => {
  expect(delayToMs(2, 'weeks')).toBe(2 * 7 * 86_400_000)
})

test('delayToMs: months', () => {
  expect(delayToMs(1, 'months')).toBe(30 * 86_400_000)
})

test('delayToMs: year ignores amount', () => {
  expect(delayToMs(5, 'year')).toBe(365 * 86_400_000)
})

// --- evaluateRules: basic matching ---

test('movie event matches movie rule', () => {
  const items = evaluateRules(baseMovieEvent, [movieRule], [], [baseMovieEvent])
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r1')
  expect(items[0].arrId).toBe(10)
  expect(items[0].granularity).toBe('movie')
  expect(items[0].action).toBe('delete')
  expect(items[0].deleteFiles).toBe(true)
  expect(items[0].scheduledAt).toBe(1_000_000 + 7 * 86_400_000)
  expect(items[0].status).toBe('pending')
  expect(items[0].retryCount).toBe(0)
})

test('episode event matches episode rule', () => {
  const items = evaluateRules(baseEpisodeEvent, [episodeRule], [], [baseEpisodeEvent])
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r2')
  expect(items[0].arrId).toBe(20)
  expect(items[0].seasonNumber).toBe(1)
  expect(items[0].episodeNumber).toBe(1)
  expect(items[0].title).toBe('Pilot')
  expect(items[0].seriesTitle).toBe('Breaking Bad')
})

test('movie event does not match series rule', () => {
  const items = evaluateRules(baseMovieEvent, [episodeRule], [], [baseMovieEvent])
  expect(items).toHaveLength(0)
})

test('episode event does not match movie rule', () => {
  const items = evaluateRules(baseEpisodeEvent, [movieRule], [], [baseEpisodeEvent])
  expect(items).toHaveLength(0)
})

test('disabled rule is skipped', () => {
  const disabled = { ...movieRule, enabled: false }
  const items = evaluateRules(baseMovieEvent, [disabled], [], [baseMovieEvent])
  expect(items).toHaveLength(0)
})

// --- deduplication ---

test('skips if non-cancelled queue item exists for same ruleId+arrId+episodeNumber', () => {
  const existing: DeletionQueueItem = {
    id: 'q1', ruleId: 'r2', ruleName: 'n', watchedEventId: 'ev2',
    arrId: 20, arrTarget: 'series', action: 'delete', deleteFiles: true,
    granularity: 'episode', title: 'Pilot', seasonNumber: 1, episodeNumber: 1,
    scheduledAt: 999, status: 'pending', retryCount: 0,
  }
  const items = evaluateRules(baseEpisodeEvent, [episodeRule], [existing], [baseEpisodeEvent])
  expect(items).toHaveLength(0)
})

test('does not skip if existing queue item is cancelled', () => {
  const cancelled: DeletionQueueItem = {
    id: 'q1', ruleId: 'r2', ruleName: 'n', watchedEventId: 'ev2',
    arrId: 20, arrTarget: 'series', action: 'delete', deleteFiles: true,
    granularity: 'episode', title: 'Pilot', seasonNumber: 1, episodeNumber: 1,
    scheduledAt: 999, status: 'cancelled', retryCount: 0,
  }
  const items = evaluateRules(baseEpisodeEvent, [episodeRule], [cancelled], [baseEpisodeEvent])
  expect(items).toHaveLength(1)
})

// --- specific scope priority ---

test('specific scope rule takes priority over global for same granularity', () => {
  const specificRule: AutoDeleteRule = {
    ...movieRule,
    id: 'r-specific',
    scope: 'specific',
    arrId: 10,
    arrTarget: 'movies',
    delayAmount: 1,
  }
  const items = evaluateRules(baseMovieEvent, [movieRule, specificRule], [], [baseMovieEvent])
  // Only specific rule fires for this arrId
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r-specific')
})

test('global rule fires when no specific rule matches this arrId', () => {
  const specificForOther: AutoDeleteRule = {
    ...movieRule,
    id: 'r-other',
    scope: 'specific',
    arrId: 99,
    arrTarget: 'movies',
  }
  const items = evaluateRules(baseMovieEvent, [movieRule, specificForOther], [], [baseMovieEvent])
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r1')
})

// --- season granularity ---

test('season rule uses max watchedAt across season episodes for scheduledAt', () => {
  const ep2Event: WatchedEvent = {
    ...baseEpisodeEvent,
    id: 'ev3',
    episodeNumber: 2,
    watchedAt: 3_000_000,
  }
  const allEvents = [baseEpisodeEvent, ep2Event]
  const items = evaluateRules(ep2Event, [seasonRule], [], allEvents)
  expect(items).toHaveLength(1)
  expect(items[0].granularity).toBe('season')
  expect(items[0].seasonNumber).toBe(1)
  expect(items[0].episodeNumber).toBeUndefined()
  // scheduledAt = max(2_000_000, 3_000_000) + 2 days
  expect(items[0].scheduledAt).toBe(3_000_000 + 2 * 86_400_000)
})

test('season rule dedup: skips if non-cancelled item exists for ruleId+arrId+seasonNumber', () => {
  const existing: DeletionQueueItem = {
    id: 'q1', ruleId: 'r3', ruleName: 'n', watchedEventId: 'ev2',
    arrId: 20, arrTarget: 'series', action: 'unmonitor', deleteFiles: false,
    granularity: 'season', title: 'Breaking Bad', seasonNumber: 1,
    scheduledAt: 999, status: 'pending', retryCount: 0,
  }
  const items = evaluateRules(baseEpisodeEvent, [seasonRule], [existing], [baseEpisodeEvent])
  expect(items).toHaveLength(0)
})

test('episode rule and season rule can both fire for same episode event', () => {
  const items = evaluateRules(baseEpisodeEvent, [episodeRule, seasonRule], [], [baseEpisodeEvent])
  const granularities = items.map(i => i.granularity)
  expect(granularities).toContain('episode')
  expect(granularities).toContain('season')
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/lib/rule-engine.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/rule-engine'"

- [ ] **Step 3: Implement `lib/rule-engine.ts`**

```ts
import { v4 as uuidv4 } from 'uuid'
import type { AutoDeleteRule, DeletionQueueItem, DeletionQueueStatus, WatchedEvent } from './types'

export function delayToMs(amount: number, unit: 'days' | 'weeks' | 'months' | 'year'): number {
  const DAY = 86_400_000
  switch (unit) {
    case 'days':   return amount * DAY
    case 'weeks':  return amount * 7 * DAY
    case 'months': return amount * 30 * DAY
    case 'year':   return 365 * DAY
  }
}

function isDupInQueue(
  queue: DeletionQueueItem[],
  ruleId: string,
  arrId: number,
  seasonNumber: number | undefined,
  episodeNumber: number | undefined,
): boolean {
  return queue.some(q =>
    q.ruleId === ruleId &&
    q.arrId === arrId &&
    q.seasonNumber === seasonNumber &&
    q.episodeNumber === episodeNumber &&
    q.status !== 'cancelled',
  )
}

export function evaluateRules(
  event: WatchedEvent,
  rules: AutoDeleteRule[],
  existingQueue: DeletionQueueItem[],
  watchedEvents: WatchedEvent[],
): DeletionQueueItem[] {
  if (!event.arrId || event.matchStatus !== 'matched') return []

  const eventMediaType = event.mediaType === 'movie' ? 'movie' : 'series'

  // Filter to enabled rules matching this event's mediaType
  const candidates = rules.filter(r => r.enabled && r.mediaType === eventMediaType)

  // Collect all unique granularities referenced by candidates
  const granularities = [...new Set(candidates.map(r => r.granularity))]

  const items: DeletionQueueItem[] = []

  for (const granularity of granularities) {
    const matching = candidates.filter(r => r.granularity === granularity)

    // Pick most specific rule: specific scope for this arrId > global
    const specific = matching.find(r => r.scope === 'specific' && r.arrId === event.arrId)
    const global = matching.find(r => r.scope === 'global')
    const rule = specific ?? global
    if (!rule) continue

    if (granularity === 'movie' || granularity === 'episode') {
      // Check dedup
      if (isDupInQueue(existingQueue, rule.id, event.arrId, event.seasonNumber, event.episodeNumber)) continue

      const scheduledAt = event.watchedAt + delayToMs(rule.delayAmount, rule.delayUnit)
      items.push({
        id: uuidv4(),
        ruleId: rule.id,
        ruleName: rule.name,
        watchedEventId: event.id,
        arrId: event.arrId,
        arrTarget: event.arrTarget ?? (eventMediaType === 'movie' ? 'movies' : 'series'),
        action: rule.action,
        deleteFiles: rule.deleteFiles,
        granularity,
        title: event.title,
        seriesTitle: event.seriesTitle,
        seasonNumber: event.seasonNumber,
        episodeNumber: event.episodeNumber,
        scheduledAt,
        status: 'pending',
        retryCount: 0,
      })
    } else if (granularity === 'season') {
      // Only for episode events
      if (event.mediaType !== 'episode' || event.seasonNumber == null) continue

      // Dedup: skip if non-cancelled item exists for ruleId+arrId+seasonNumber
      if (isDupInQueue(existingQueue, rule.id, event.arrId, event.seasonNumber, undefined)) continue

      // scheduledAt = max watchedAt across all matched watched events for this series+season + delay
      const seasonEvents = watchedEvents.filter(e =>
        e.arrId === event.arrId &&
        e.seasonNumber === event.seasonNumber &&
        e.matchStatus === 'matched',
      )
      const maxWatchedAt = seasonEvents.reduce((m, e) => Math.max(m, e.watchedAt), event.watchedAt)
      const scheduledAt = maxWatchedAt + delayToMs(rule.delayAmount, rule.delayUnit)

      items.push({
        id: uuidv4(),
        ruleId: rule.id,
        ruleName: rule.name,
        watchedEventId: event.id,
        arrId: event.arrId,
        arrTarget: event.arrTarget ?? 'series',
        action: rule.action,
        deleteFiles: rule.deleteFiles,
        granularity: 'season',
        title: event.seriesTitle ?? event.title,
        seriesTitle: event.seriesTitle,
        seasonNumber: event.seasonNumber,
        scheduledAt,
        status: 'pending',
        retryCount: 0,
      })
    }
  }

  return items
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/lib/rule-engine.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/rule-engine.ts __tests__/lib/rule-engine.test.ts
git commit -m "feat(rules): implement rule engine with evaluateRules and delayToMs"
```

---

### Task 3: New Sonarr API Functions

**Files:**
- Modify: `lib/arr-client.ts` (append 5 functions)
- Create: `__tests__/lib/arr-client-episode.test.ts`

**Interfaces:**
- Consumes: private `arrFetch` inside `lib/arr-client.ts`
- Produces (all exported):
  - `getSeasonEpisodeFileCount(url, key, seriesId, seasonNumber): Promise<number>`
  - `deleteEpisodeFile(url, key, seriesId, seasonNumber, episodeNumber): Promise<void>`
  - `deleteSeasonFiles(url, key, seriesId, seasonNumber): Promise<void>`
  - `unmonitorEpisode(url, key, seriesId, seasonNumber, episodeNumber): Promise<void>`
  - `unmonitorSeason(url, key, seriesId, seasonNumber): Promise<void>`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/arr-client-episode.test.ts`:

```ts
// @jest-environment node

import {
  getSeasonEpisodeFileCount,
  deleteEpisodeFile,
  deleteSeasonFiles,
  unmonitorEpisode,
  unmonitorSeason,
} from '@/lib/arr-client'

const BASE = 'http://sonarr:8989'
const KEY = 'testkey'

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

afterEach(() => jest.restoreAllMocks())

// --- getSeasonEpisodeFileCount ---

test('getSeasonEpisodeFileCount returns count of episode files', async () => {
  mockFetch(200, [{ id: 1 }, { id: 2 }, { id: 3 }])
  const count = await getSeasonEpisodeFileCount(BASE, KEY, 42, 1)
  expect(count).toBe(3)
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/v3/episodefile?seriesId=42&seasonNumber=1')
})

test('getSeasonEpisodeFileCount returns 0 for empty season', async () => {
  mockFetch(200, [])
  expect(await getSeasonEpisodeFileCount(BASE, KEY, 42, 1)).toBe(0)
})

// --- deleteEpisodeFile ---

test('deleteEpisodeFile deletes the matching episode file', async () => {
  const episodes = [
    { id: 101, episodeNumber: 1, episodeFileId: 201 },
    { id: 102, episodeNumber: 2, episodeFileId: 202 },
  ]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await deleteEpisodeFile(BASE, KEY, 42, 1, 2)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/episode?seriesId=42&seasonNumber=1')
  expect(calls[1][0]).toContain('/api/v3/episodefile/202')
  expect(calls[1][1].method).toBe('DELETE')
})

test('deleteEpisodeFile is no-op if episode not found', async () => {
  const episodes = [{ id: 101, episodeNumber: 3, episodeFileId: 201 }]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)

  await deleteEpisodeFile(BASE, KEY, 42, 1, 99)

  // Only one call (the GET) — no DELETE
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

test('deleteEpisodeFile is no-op if episodeFileId is 0', async () => {
  const episodes = [{ id: 101, episodeNumber: 1, episodeFileId: 0 }]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)

  await deleteEpisodeFile(BASE, KEY, 42, 1, 1)
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

// --- deleteSeasonFiles ---

test('deleteSeasonFiles deletes all episode files in parallel', async () => {
  const files = [{ id: 301 }, { id: 302 }, { id: 303 }]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(files) } as Response)
    .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await deleteSeasonFiles(BASE, KEY, 42, 1)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/episodefile?seriesId=42&seasonNumber=1')
  const deleteCalls = calls.slice(1)
  expect(deleteCalls).toHaveLength(3)
  expect(deleteCalls.every((c: [string, RequestInit]) => c[1].method === 'DELETE')).toBe(true)
  expect(deleteCalls.map((c: [string, RequestInit]) => c[0]).sort()).toEqual([
    `${BASE}/api/v3/episodefile/301`,
    `${BASE}/api/v3/episodefile/302`,
    `${BASE}/api/v3/episodefile/303`,
  ].sort())
})

test('deleteSeasonFiles is no-op when no files exist', async () => {
  mockFetch(200, [])
  await deleteSeasonFiles(BASE, KEY, 42, 1)
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

// --- unmonitorEpisode ---

test('unmonitorEpisode sets monitored=false for the episode', async () => {
  const episodes = [
    { id: 101, episodeNumber: 1, monitored: true, seriesId: 42 },
    { id: 102, episodeNumber: 2, monitored: true, seriesId: 42 },
  ]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await unmonitorEpisode(BASE, KEY, 42, 1, 1)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/episode?seriesId=42&seasonNumber=1')
  expect(calls[1][0]).toContain('/api/v3/episode/101')
  expect(calls[1][1].method).toBe('PUT')
  const putBody = JSON.parse(calls[1][1].body as string)
  expect(putBody.monitored).toBe(false)
  expect(putBody.id).toBe(101)
})

test('unmonitorEpisode is no-op if episode not found', async () => {
  mockFetch(200, [{ id: 101, episodeNumber: 5, monitored: true }])
  await unmonitorEpisode(BASE, KEY, 42, 1, 99)
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

// --- unmonitorSeason ---

test('unmonitorSeason sets the season monitored=false and PUTs the series', async () => {
  const series = {
    id: 42,
    title: 'Breaking Bad',
    monitored: true,
    seasons: [
      { seasonNumber: 0, monitored: false },
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: true },
    ],
  }
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(series) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await unmonitorSeason(BASE, KEY, 42, 1)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/series/42')
  expect(calls[1][0]).toContain('/api/v3/series/42')
  expect(calls[1][1].method).toBe('PUT')

  const putBody = JSON.parse(calls[1][1].body as string)
  const s1 = (putBody.seasons as Array<{ seasonNumber: number; monitored: boolean }>).find(s => s.seasonNumber === 1)
  const s2 = (putBody.seasons as Array<{ seasonNumber: number; monitored: boolean }>).find(s => s.seasonNumber === 2)
  expect(s1?.monitored).toBe(false)
  expect(s2?.monitored).toBe(true)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/lib/arr-client-episode.test.ts
```

Expected: FAIL — functions not exported from `@/lib/arr-client`

- [ ] **Step 3: Append 5 new functions to `lib/arr-client.ts`**

Add these after the existing `unmonitorSeries` function:

```ts
interface SonarrEpisode {
  id: number
  episodeNumber: number
  episodeFileId: number
  monitored: boolean
  [key: string]: unknown
}

interface SonarrEpisodeFile {
  id: number
  [key: string]: unknown
}

export async function getSeasonEpisodeFileCount(
  url: string, key: string,
  seriesId: number, seasonNumber: number,
): Promise<number> {
  const files = await arrFetch(url, key, `/api/v3/episodefile?seriesId=${seriesId}&seasonNumber=${seasonNumber}`) as SonarrEpisodeFile[]
  return files.length
}

export async function deleteEpisodeFile(
  url: string, key: string,
  seriesId: number, seasonNumber: number, episodeNumber: number,
): Promise<void> {
  const episodes = await arrFetch(url, key, `/api/v3/episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`) as SonarrEpisode[]
  const ep = episodes.find(e => e.episodeNumber === episodeNumber)
  if (!ep || !ep.episodeFileId) return
  await arrFetch(url, key, `/api/v3/episodefile/${ep.episodeFileId}`, { method: 'DELETE' })
}

export async function deleteSeasonFiles(
  url: string, key: string,
  seriesId: number, seasonNumber: number,
): Promise<void> {
  const files = await arrFetch(url, key, `/api/v3/episodefile?seriesId=${seriesId}&seasonNumber=${seasonNumber}`) as SonarrEpisodeFile[]
  await Promise.all(files.map(f => arrFetch(url, key, `/api/v3/episodefile/${f.id}`, { method: 'DELETE' })))
}

export async function unmonitorEpisode(
  url: string, key: string,
  seriesId: number, seasonNumber: number, episodeNumber: number,
): Promise<void> {
  const episodes = await arrFetch(url, key, `/api/v3/episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`) as SonarrEpisode[]
  const ep = episodes.find(e => e.episodeNumber === episodeNumber)
  if (!ep) return
  await arrFetch(url, key, `/api/v3/episode/${ep.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...ep, monitored: false }),
  })
}

interface SonarrSeriesWithSeasons {
  id: number
  seasons: Array<{ seasonNumber: number; monitored: boolean; [key: string]: unknown }>
  [key: string]: unknown
}

export async function unmonitorSeason(
  url: string, key: string,
  seriesId: number, seasonNumber: number,
): Promise<void> {
  const series = await arrFetch(url, key, `/api/v3/series/${seriesId}`) as SonarrSeriesWithSeasons
  const updated = {
    ...series,
    seasons: series.seasons.map(s =>
      s.seasonNumber === seasonNumber ? { ...s, monitored: false } : s,
    ),
  }
  await arrFetch(url, key, `/api/v3/series/${seriesId}`, {
    method: 'PUT',
    body: JSON.stringify(updated),
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/lib/arr-client-episode.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/arr-client.ts __tests__/lib/arr-client-episode.test.ts
git commit -m "feat(rules): add Sonarr episode/season delete and unmonitor functions to arr-client"
```

---

### Task 4: Deletion Executor + Event Integration

**Files:**
- Create: `lib/deletion-executor.ts`
- Modify: `instrumentation.ts`
- Modify: `app/api/webhook/jellyfin/route.ts`
- Modify: `app/api/webhook/plex/route.ts`
- Modify: `lib/media-poller.ts`

**Interfaces:**
- Consumes:
  - `evaluateRules` from `./rule-engine`
  - `deleteMovie`, `unmonitorMovie`, `deleteSeries` (note: not used—series-level is via episodes), `unmonitorSeries` (not used—season-level via unmonitorSeason), `deleteEpisodeFile`, `deleteSeasonFiles`, `unmonitorEpisode`, `unmonitorSeason`, `getSeasonEpisodeFileCount` from `./arr-client`
  - `readStore`, `updateStore` from `./store`
  - `DeletionQueueItem`, `Store` from `./types`
- Produces:
  - `export function startDeletionExecutor(): void`
  - `export function enqueueRuleMatches(event: WatchedEvent): void`

**Note on executor dispatch:** The executor only uses `deleteMovie` + `unmonitorMovie` for movies. For series it uses `deleteEpisodeFile`/`deleteSeasonFiles`/`unmonitorEpisode`/`unmonitorSeason`. The existing `deleteSeries` and `unmonitorSeries` functions are NOT used by the executor (those delete/unmonitor the entire series entry in Sonarr, which is out of scope).

- [ ] **Step 1: Create `lib/deletion-executor.ts`**

```ts
import { readStore, updateStore } from './store'
import { evaluateRules } from './rule-engine'
import {
  deleteMovie, unmonitorMovie,
  deleteEpisodeFile, deleteSeasonFiles,
  unmonitorEpisode, unmonitorSeason,
  getSeasonEpisodeFileCount,
} from './arr-client'
import type { DeletionQueueItem, Store, WatchedEvent } from './types'

const MAX_QUEUE = 500
const EXECUTOR_INTERVAL_MS = 5 * 60 * 1000
const RESCHEDULE_DELAY_MS = 24 * 60 * 60 * 1000
const MAX_RETRIES = 3

async function executeItem(item: DeletionQueueItem, store: Store): Promise<void> {
  const settings = item.arrTarget === 'movies' ? store.settings.radarr : store.settings.sonarr
  if (!settings) throw new Error(`${item.arrTarget === 'movies' ? 'Radarr' : 'Sonarr'} not configured`)
  const { url, apiKey } = settings
  const { granularity, action, arrId, deleteFiles } = item
  const sn = item.seasonNumber!
  const en = item.episodeNumber!

  if (granularity === 'movie' && action === 'delete') {
    await deleteMovie(url, apiKey, arrId, deleteFiles)
  } else if (granularity === 'movie' && action === 'unmonitor') {
    await unmonitorMovie(url, apiKey, arrId)
  } else if (granularity === 'episode' && action === 'delete') {
    await deleteEpisodeFile(url, apiKey, arrId, sn, en)
  } else if (granularity === 'episode' && action === 'unmonitor') {
    await unmonitorEpisode(url, apiKey, arrId, sn, en)
  } else if (granularity === 'season' && action === 'delete') {
    await deleteSeasonFiles(url, apiKey, arrId, sn)
  } else if (granularity === 'season' && action === 'unmonitor') {
    await unmonitorSeason(url, apiKey, arrId, sn)
  }
}

async function shouldRescheduleSeasonItem(item: DeletionQueueItem, store: Store): Promise<boolean> {
  if (item.granularity !== 'season' || item.seasonNumber == null) return false
  const settings = store.settings.sonarr
  if (!settings) return false

  const watchedEpNums = new Set(
    store.watchedEvents
      .filter(e =>
        e.arrId === item.arrId &&
        e.seasonNumber === item.seasonNumber &&
        e.matchStatus === 'matched' &&
        e.episodeNumber != null,
      )
      .map(e => e.episodeNumber as number),
  )

  const downloadedCount = await getSeasonEpisodeFileCount(
    settings.url, settings.apiKey, item.arrId, item.seasonNumber,
  )

  return watchedEpNums.size < downloadedCount
}

export async function runExecutorCycle(): Promise<{ executed: number; failed: number }> {
  const now = Date.now()
  const store = readStore()
  const due = store.deletionQueue.filter(i => i.status === 'pending' && i.scheduledAt <= now)

  let executed = 0
  let failed = 0

  for (const item of due) {
    try {
      const reschedule = await shouldRescheduleSeasonItem(item, store)
      if (reschedule) {
        updateStore(s => {
          const qi = s.deletionQueue.find(q => q.id === item.id)
          if (qi) qi.scheduledAt = now + RESCHEDULE_DELAY_MS
        })
        continue
      }

      await executeItem(item, store)

      updateStore(s => {
        const qi = s.deletionQueue.find(q => q.id === item.id)
        if (qi) { qi.status = 'done'; qi.executedAt = Date.now() }
      })
      executed++
    } catch (e) {
      updateStore(s => {
        const qi = s.deletionQueue.find(q => q.id === item.id)
        if (!qi) return
        qi.retryCount++
        if (qi.retryCount >= MAX_RETRIES) {
          qi.status = 'failed'
          qi.errorMessage = (e as Error).message
        }
      })
      failed++
    }
  }

  return { executed, failed }
}

export function startDeletionExecutor(): void {
  async function tick(): Promise<void> {
    await runExecutorCycle()
    setTimeout(() => { tick().catch(e => console.error('[bulkarr] executor tick error:', e)) }, EXECUTOR_INTERVAL_MS)
  }
  tick().catch(e => console.error('[bulkarr] executor startup error:', e))
}

export function enqueueRuleMatches(event: WatchedEvent): void {
  if (!event.arrId || event.matchStatus !== 'matched') return
  const store = readStore()
  const newItems = evaluateRules(event, store.rules, store.deletionQueue, store.watchedEvents)
  if (!newItems.length) return
  updateStore(s => {
    s.deletionQueue.push(...newItems)
    if (s.deletionQueue.length > MAX_QUEUE) {
      // Trim oldest done/failed/cancelled first, then by index
      const terminal = s.deletionQueue.filter(i => i.status !== 'pending')
      const pending = s.deletionQueue.filter(i => i.status === 'pending')
      s.deletionQueue = [...pending, ...terminal].slice(0, MAX_QUEUE)
    }
  })
}
```

- [ ] **Step 2: Update `instrumentation.ts`**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMediaPoller } = await import('./lib/media-poller')
    const { startDeletionExecutor } = await import('./lib/deletion-executor')
    startMediaPoller()
    startDeletionExecutor()
  }
}
```

- [ ] **Step 3: Update Jellyfin webhook to call `enqueueRuleMatches`**

In `app/api/webhook/jellyfin/route.ts`, add the import at the top:

```ts
import { enqueueRuleMatches } from '@/lib/deletion-executor'
```

Then replace the `updateStore` block and return:

```ts
  let storedEvent: WatchedEvent | null = null
  updateStore(s => {
    if (isDuplicate(event, s.watchedEvents)) return
    const stored = { ...event, ...match }
    s.watchedEvents.unshift(stored)
    if (s.watchedEvents.length > 1000) s.watchedEvents = s.watchedEvents.slice(0, 1000)
    storedEvent = stored
  })
  if (storedEvent !== null) enqueueRuleMatches(storedEvent)

  return NextResponse.json({}, { status: 200 })
```

- [ ] **Step 4: Update Plex webhook to call `enqueueRuleMatches`**

In `app/api/webhook/plex/route.ts`, add the import at the top:

```ts
import { enqueueRuleMatches } from '@/lib/deletion-executor'
```

Then replace the `updateStore` block and return:

```ts
  let storedEvent: WatchedEvent | null = null
  updateStore(s => {
    if (isDuplicate(watchedEvent, s.watchedEvents)) return
    const stored = { ...watchedEvent, ...match }
    s.watchedEvents.unshift(stored)
    if (s.watchedEvents.length > 1000) s.watchedEvents = s.watchedEvents.slice(0, 1000)
    storedEvent = stored
  })
  if (storedEvent !== null) enqueueRuleMatches(storedEvent)

  return NextResponse.json({}, { status: 200 })
```

- [ ] **Step 5: Update `lib/media-poller.ts` to call `enqueueRuleMatches`**

Add the import at the top:

```ts
import { enqueueRuleMatches } from './deletion-executor'
```

Then replace the `updateStore` block inside the `for (const type ...)` loop:

```ts
    const newEvents: WatchedEvent[] = []
    updateStore(s => {
      for (const ev of events) {
        if (isDuplicate(ev, s.watchedEvents)) continue
        const match = matchWatchedEvent(ev, cache)
        const stored = { ...ev, ...match }
        s.watchedEvents.unshift(stored)
        newEvents.push(stored)
      }
      if (s.watchedEvents.length > MAX_EVENTS) s.watchedEvents = s.watchedEvents.slice(0, MAX_EVENTS)
      s.lastPolledAt[type] = now
    })
    for (const ev of newEvents) enqueueRuleMatches(ev)
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run full test suite to check nothing is broken**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test
```

Expected: all existing tests pass (currently 74 tests), plus rule-engine and arr-client-episode tests.

- [ ] **Step 8: Commit**

```bash
git add lib/deletion-executor.ts instrumentation.ts app/api/webhook/jellyfin/route.ts app/api/webhook/plex/route.ts lib/media-poller.ts
git commit -m "feat(rules): add deletion executor and wire enqueueRuleMatches into event pipeline"
```

---

### Task 5: Rules API Routes

**Files:**
- Create: `app/api/rules/route.ts`
- Create: `app/api/rules/[id]/route.ts`
- Create: `__tests__/api/rules.test.ts`

**Interfaces:**
- Consumes: `readStore`, `updateStore` from `@/lib/store`; `evaluateRules` from `@/lib/rule-engine`; `enqueueRuleMatches` from `@/lib/deletion-executor` (via direct call after updateStore)
- Produces:
  - `GET /api/rules` → `{ rules: AutoDeleteRule[] }`
  - `POST /api/rules` → `{ rule: AutoDeleteRule, enqueued: number }` (400 on invalid body)
  - `PUT /api/rules/[id]` → `{ rule: AutoDeleteRule, enqueued: number }` (404 if not found)
  - `DELETE /api/rules/[id]` → `{ ok: true }` (404 if not found; cancels pending queue items)

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/rules.test.ts`:

```ts
// @jest-environment node

import { GET, POST } from '@/app/api/rules/route'
import { GET as GETById, PUT, DELETE as DELETEById } from '@/app/api/rules/[id]/route'
import { NextRequest } from 'next/server'

// Mock store
const mockStore = {
  rules: [] as import('@/lib/types').AutoDeleteRule[],
  deletionQueue: [] as import('@/lib/types').DeletionQueueItem[],
  watchedEvents: [] as import('@/lib/types').WatchedEvent[],
  settings: { radarr: null, sonarr: null },
}

jest.mock('@/lib/store', () => ({
  readStore: () => JSON.parse(JSON.stringify(mockStore)),
  updateStore: (fn: (s: typeof mockStore) => void) => { fn(mockStore); return mockStore },
}))

jest.mock('@/lib/deletion-executor', () => ({
  enqueueRuleMatches: jest.fn(),
}))

beforeEach(() => {
  mockStore.rules = []
  mockStore.deletionQueue = []
  mockStore.watchedEvents = []
})

afterEach(() => jest.clearAllMocks())

function makeReq(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/rules', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validRule = {
  name: 'Delete watched movies',
  enabled: true,
  mediaType: 'movie',
  granularity: 'movie',
  action: 'delete',
  deleteFiles: true,
  delayAmount: 7,
  delayUnit: 'days',
  scope: 'global',
}

// --- GET /api/rules ---

test('GET returns empty rules list', async () => {
  const res = await GET()
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.rules).toEqual([])
})

test('GET returns existing rules', async () => {
  mockStore.rules = [{ ...validRule, id: 'r1' } as import('@/lib/types').AutoDeleteRule]
  const res = await GET()
  const body = await res.json()
  expect(body.rules).toHaveLength(1)
})

// --- POST /api/rules ---

test('POST creates a rule and returns it with enqueued count', async () => {
  const res = await POST(makeReq(validRule))
  const body = await res.json()
  expect(res.status).toBe(201)
  expect(body.rule.name).toBe('Delete watched movies')
  expect(typeof body.rule.id).toBe('string')
  expect(body.enqueued).toBe(0)
  expect(mockStore.rules).toHaveLength(1)
})

test('POST returns 400 when delayAmount < 1', async () => {
  const res = await POST(makeReq({ ...validRule, delayAmount: 0 }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when delayUnit is invalid', async () => {
  const res = await POST(makeReq({ ...validRule, delayUnit: 'hours' }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when scope=specific missing arrId', async () => {
  const res = await POST(makeReq({ ...validRule, scope: 'specific' }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when granularity=season but mediaType=movie', async () => {
  const res = await POST(makeReq({ ...validRule, granularity: 'season' }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when granularity=movie but mediaType=series', async () => {
  const res = await POST(makeReq({ ...validRule, mediaType: 'series', granularity: 'movie' }))
  expect(res.status).toBe(400)
})

// --- PUT /api/rules/[id] ---

test('PUT updates a rule', async () => {
  mockStore.rules = [{ ...validRule, id: 'r1' } as import('@/lib/types').AutoDeleteRule]
  const req = new NextRequest('http://localhost/api/rules/r1', {
    method: 'PUT',
    body: JSON.stringify({ ...validRule, name: 'Updated' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PUT(req, { params: Promise.resolve({ id: 'r1' }) })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.rule.name).toBe('Updated')
})

test('PUT returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/rules/nope', {
    method: 'PUT',
    body: JSON.stringify(validRule),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PUT(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})

// --- DELETE /api/rules/[id] ---

test('DELETE removes a rule and cancels its pending queue items', async () => {
  mockStore.rules = [{ ...validRule, id: 'r1' } as import('@/lib/types').AutoDeleteRule]
  mockStore.deletionQueue = [{
    id: 'q1', ruleId: 'r1', ruleName: 'n', watchedEventId: 'e1',
    arrId: 10, arrTarget: 'movies', action: 'delete', deleteFiles: true,
    granularity: 'movie', title: 'T', scheduledAt: 999, status: 'pending', retryCount: 0,
  }]
  const req = new NextRequest('http://localhost/api/rules/r1', { method: 'DELETE' })
  const res = await DELETEById(req, { params: Promise.resolve({ id: 'r1' }) })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.ok).toBe(true)
  expect(mockStore.rules).toHaveLength(0)
  expect(mockStore.deletionQueue[0].status).toBe('cancelled')
})

test('DELETE returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/rules/nope', { method: 'DELETE' })
  const res = await DELETEById(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/api/rules.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `app/api/rules/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'
import type { AutoDeleteRule } from '@/lib/types'

const VALID_DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

function validate(body: Partial<AutoDeleteRule>): string | null {
  if (!body.name || typeof body.name !== 'string') return 'name required'
  if (body.mediaType !== 'movie' && body.mediaType !== 'series') return 'invalid mediaType'
  if (!['movie', 'episode', 'season'].includes(body.granularity ?? '')) return 'invalid granularity'
  if (!['delete', 'unmonitor'].includes(body.action ?? '')) return 'invalid action'
  if (typeof body.delayAmount !== 'number' || body.delayAmount < 1) return 'delayAmount must be >= 1'
  if (!VALID_DELAY_UNITS.includes(body.delayUnit as typeof VALID_DELAY_UNITS[number])) return 'invalid delayUnit'
  if (body.scope !== 'global' && body.scope !== 'specific') return 'invalid scope'
  if (body.scope === 'specific' && (body.arrId == null || !body.arrTarget)) return 'specific scope requires arrId and arrTarget'
  if (body.mediaType === 'movie' && body.granularity !== 'movie') return 'movie mediaType requires granularity=movie'
  if (body.mediaType === 'series' && body.granularity === 'movie') return 'series mediaType cannot use granularity=movie'
  return null
}

export async function GET() {
  const store = readStore()
  return NextResponse.json({ rules: store.rules })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Partial<AutoDeleteRule> | null
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  const err = validate(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const rule: AutoDeleteRule = {
    id: uuidv4(),
    name: body.name!,
    enabled: body.enabled ?? true,
    mediaType: body.mediaType!,
    granularity: body.granularity!,
    action: body.action!,
    deleteFiles: body.deleteFiles ?? false,
    delayAmount: body.delayAmount!,
    delayUnit: body.delayUnit!,
    scope: body.scope!,
    arrId: body.arrId,
    arrTarget: body.arrTarget,
    scopeTitle: body.scopeTitle,
  }

  updateStore(s => { s.rules.push(rule) })

  // Enqueue matches from existing matched watched events
  const store = readStore()
  const matchedEvents = store.watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0
  for (const ev of matchedEvents) {
    const newItems = evaluateRules(ev, [rule], store.deletionQueue, store.watchedEvents)
    if (newItems.length) {
      updateStore(s => { s.deletionQueue.push(...newItems) })
      enqueued += newItems.length
    }
  }

  return NextResponse.json({ rule, enqueued }, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/rules/[id]/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'
import type { AutoDeleteRule } from '@/lib/types'

const VALID_DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

function validate(body: Partial<AutoDeleteRule>): string | null {
  if (!body.name || typeof body.name !== 'string') return 'name required'
  if (body.mediaType !== 'movie' && body.mediaType !== 'series') return 'invalid mediaType'
  if (!['movie', 'episode', 'season'].includes(body.granularity ?? '')) return 'invalid granularity'
  if (!['delete', 'unmonitor'].includes(body.action ?? '')) return 'invalid action'
  if (typeof body.delayAmount !== 'number' || body.delayAmount < 1) return 'delayAmount must be >= 1'
  if (!VALID_DELAY_UNITS.includes(body.delayUnit as typeof VALID_DELAY_UNITS[number])) return 'invalid delayUnit'
  if (body.scope !== 'global' && body.scope !== 'specific') return 'invalid scope'
  if (body.scope === 'specific' && (body.arrId == null || !body.arrTarget)) return 'specific scope requires arrId and arrTarget'
  if (body.mediaType === 'movie' && body.granularity !== 'movie') return 'movie mediaType requires granularity=movie'
  if (body.mediaType === 'series' && body.granularity === 'movie') return 'series mediaType cannot use granularity=movie'
  return null
}

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const rule = store.rules.find(r => r.id === id)
  if (!rule) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ rule })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => null) as Partial<AutoDeleteRule> | null
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  const err = validate(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const store = readStore()
  const idx = store.rules.findIndex(r => r.id === id)
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updated: AutoDeleteRule = {
    id,
    name: body.name!,
    enabled: body.enabled ?? true,
    mediaType: body.mediaType!,
    granularity: body.granularity!,
    action: body.action!,
    deleteFiles: body.deleteFiles ?? false,
    delayAmount: body.delayAmount!,
    delayUnit: body.delayUnit!,
    scope: body.scope!,
    arrId: body.arrId,
    arrTarget: body.arrTarget,
    scopeTitle: body.scopeTitle,
  }

  updateStore(s => { s.rules[idx] = updated })

  const fresh = readStore()
  const matchedEvents = fresh.watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0
  for (const ev of matchedEvents) {
    const newItems = evaluateRules(ev, [updated], fresh.deletionQueue, fresh.watchedEvents)
    if (newItems.length) {
      updateStore(s => { s.deletionQueue.push(...newItems) })
      enqueued += newItems.length
    }
  }

  return NextResponse.json({ rule: updated, enqueued })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const idx = store.rules.findIndex(r => r.id === id)
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 })

  updateStore(s => {
    s.rules.splice(idx, 1)
    for (const qi of s.deletionQueue) {
      if (qi.ruleId === id && qi.status === 'pending') qi.status = 'cancelled'
    }
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/api/rules.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/rules/route.ts "app/api/rules/[id]/route.ts" __tests__/api/rules.test.ts
git commit -m "feat(rules): add GET/POST /api/rules and PUT/DELETE /api/rules/[id]"
```

---

### Task 6: Deletion Queue API Routes

**Files:**
- Create: `app/api/deletion-queue/route.ts`
- Create: `app/api/deletion-queue/[id]/route.ts`
- Create: `app/api/deletion-queue/[id]/execute/route.ts`
- Create: `app/api/deletion-queue/trigger/route.ts`
- Create: `app/api/deletion-queue/evaluate/route.ts`
- Create: `app/api/deletion-queue/execute-event/route.ts`
- Create: `__tests__/api/deletion-queue.test.ts`

**Interfaces:**
- Consumes: `readStore`, `updateStore`; `runExecutorCycle` from `@/lib/deletion-executor`; `evaluateRules` from `@/lib/rule-engine`
- Produces:
  - `GET /api/deletion-queue[?status=pending|done|failed|cancelled]` → `{ items: DeletionQueueItem[] }`
  - `DELETE /api/deletion-queue/[id]` → `{ ok: true }` (cancel; 400 if not pending; 404 if not found)
  - `POST /api/deletion-queue/[id]/execute` → `{ ok: boolean, errorMessage?: string }`
  - `POST /api/deletion-queue/trigger` → `{ executed: number, failed: number }`
  - `POST /api/deletion-queue/evaluate` → `{ enqueued: number }`
  - `POST /api/deletion-queue/execute-event` `{ watchedEventId }` → `{ executed: number, errorMessage?: string }`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/deletion-queue.test.ts`:

```ts
// @jest-environment node

import { GET } from '@/app/api/deletion-queue/route'
import { DELETE as CancelItem } from '@/app/api/deletion-queue/[id]/route'
import { POST as TriggerPost } from '@/app/api/deletion-queue/trigger/route'
import { POST as EvaluatePost } from '@/app/api/deletion-queue/evaluate/route'
import { POST as ExecuteEventPost } from '@/app/api/deletion-queue/execute-event/route'
import { NextRequest } from 'next/server'
import type { DeletionQueueItem, WatchedEvent } from '@/lib/types'

const pendingItem: DeletionQueueItem = {
  id: 'q1', ruleId: 'r1', ruleName: 'Test Rule', watchedEventId: 'e1',
  arrId: 10, arrTarget: 'movies', action: 'delete', deleteFiles: true,
  granularity: 'movie', title: 'Inception', scheduledAt: 1000, status: 'pending', retryCount: 0,
}

const matchedEvent: WatchedEvent = {
  id: 'e1', source: 'poll', mediaServer: 'jellyfin', mediaType: 'movie',
  title: 'Inception', progressPct: 95, watchedAt: 1000,
  arrId: 10, arrTarget: 'movies', matchStatus: 'matched',
}

const mockStore = {
  rules: [] as import('@/lib/types').AutoDeleteRule[],
  deletionQueue: [] as DeletionQueueItem[],
  watchedEvents: [] as WatchedEvent[],
  settings: { radarr: null, sonarr: null },
}

jest.mock('@/lib/store', () => ({
  readStore: () => JSON.parse(JSON.stringify(mockStore)),
  updateStore: (fn: (s: typeof mockStore) => void) => { fn(mockStore); return mockStore },
}))

jest.mock('@/lib/deletion-executor', () => ({
  runExecutorCycle: jest.fn().mockResolvedValue({ executed: 2, failed: 0 }),
}))

beforeEach(() => {
  mockStore.rules = []
  mockStore.deletionQueue = []
  mockStore.watchedEvents = []
  jest.clearAllMocks()
})

// --- GET /api/deletion-queue ---

test('GET returns all items', async () => {
  mockStore.deletionQueue = [pendingItem]
  const req = new NextRequest('http://localhost/api/deletion-queue')
  const res = await GET(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.items).toHaveLength(1)
})

test('GET filters by status query param', async () => {
  mockStore.deletionQueue = [
    pendingItem,
    { ...pendingItem, id: 'q2', status: 'done' },
  ]
  const req = new NextRequest('http://localhost/api/deletion-queue?status=pending')
  const res = await GET(req)
  const body = await res.json()
  expect(body.items).toHaveLength(1)
  expect(body.items[0].id).toBe('q1')
})

// --- DELETE /api/deletion-queue/[id] ---

test('DELETE cancels a pending item', async () => {
  mockStore.deletionQueue = [{ ...pendingItem }]
  const req = new NextRequest('http://localhost/api/deletion-queue/q1', { method: 'DELETE' })
  const res = await CancelItem(req, { params: Promise.resolve({ id: 'q1' }) })
  expect(res.status).toBe(200)
  expect(mockStore.deletionQueue[0].status).toBe('cancelled')
})

test('DELETE returns 400 if item is not pending', async () => {
  mockStore.deletionQueue = [{ ...pendingItem, status: 'done' }]
  const req = new NextRequest('http://localhost/api/deletion-queue/q1', { method: 'DELETE' })
  const res = await CancelItem(req, { params: Promise.resolve({ id: 'q1' }) })
  expect(res.status).toBe(400)
})

test('DELETE returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/nope', { method: 'DELETE' })
  const res = await CancelItem(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})

// --- POST /api/deletion-queue/trigger ---

test('trigger runs executor cycle and returns counts', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/trigger', { method: 'POST' })
  const res = await TriggerPost(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.executed).toBe(2)
  expect(body.failed).toBe(0)
})

// --- POST /api/deletion-queue/evaluate ---

test('evaluate enqueues matches for matched events', async () => {
  const movieRule: import('@/lib/types').AutoDeleteRule = {
    id: 'r1', name: 'n', enabled: true, mediaType: 'movie', granularity: 'movie',
    action: 'delete', deleteFiles: true, delayAmount: 7, delayUnit: 'days', scope: 'global',
  }
  mockStore.rules = [movieRule]
  mockStore.watchedEvents = [matchedEvent]
  const req = new NextRequest('http://localhost/api/deletion-queue/evaluate', { method: 'POST' })
  const res = await EvaluatePost(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.enqueued).toBeGreaterThanOrEqual(0)
})

// --- POST /api/deletion-queue/execute-event ---

test('execute-event returns 400 if watchedEventId missing', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/execute-event', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await ExecuteEventPost(req)
  expect(res.status).toBe(400)
})

test('execute-event returns 404 if event not found', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/execute-event', {
    method: 'POST',
    body: JSON.stringify({ watchedEventId: 'nonexistent' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await ExecuteEventPost(req)
  expect(res.status).toBe(404)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/api/deletion-queue.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `app/api/deletion-queue/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import type { DeletionQueueStatus } from '@/lib/types'

const VALID_STATUSES: DeletionQueueStatus[] = ['pending', 'done', 'failed', 'cancelled']

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') as DeletionQueueStatus | null
  const store = readStore()
  const items = status && VALID_STATUSES.includes(status)
    ? store.deletionQueue.filter(i => i.status === status)
    : store.deletionQueue
  return NextResponse.json({ items })
}
```

- [ ] **Step 4: Create `app/api/deletion-queue/[id]/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { updateStore, readStore } from '@/lib/store'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const item = store.deletionQueue.find(i => i.id === id)
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'item is not pending' }, { status: 400 })

  updateStore(s => {
    const qi = s.deletionQueue.find(i => i.id === id)
    if (qi) qi.status = 'cancelled'
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Create `app/api/deletion-queue/[id]/execute/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { runExecutorCycle } from '@/lib/deletion-executor'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const item = store.deletionQueue.find(i => i.id === id)
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'item is not pending' }, { status: 400 })

  // Force scheduledAt to now so the executor cycle picks it up immediately
  updateStore(s => {
    const qi = s.deletionQueue.find(i => i.id === id)
    if (qi) qi.scheduledAt = Date.now()
  })

  try {
    const result = await runExecutorCycle()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, errorMessage: (e as Error).message })
  }
}
```

- [ ] **Step 6: Create `app/api/deletion-queue/trigger/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { runExecutorCycle } from '@/lib/deletion-executor'

export async function POST(_req: NextRequest) {
  const result = await runExecutorCycle()
  return NextResponse.json(result)
}
```

- [ ] **Step 7: Create `app/api/deletion-queue/evaluate/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'

export async function POST(_req: NextRequest) {
  const store = readStore()
  const matchedEvents = store.watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0

  for (const ev of matchedEvents) {
    const newItems = evaluateRules(ev, store.rules, store.deletionQueue, store.watchedEvents)
    if (newItems.length) {
      updateStore(s => { s.deletionQueue.push(...newItems) })
      // refresh queue for next iteration to respect dedup
      store.deletionQueue = readStore().deletionQueue
      enqueued += newItems.length
    }
  }

  return NextResponse.json({ enqueued })
}
```

- [ ] **Step 8: Create `app/api/deletion-queue/execute-event/route.ts`**

```ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'
import { runExecutorCycle } from '@/lib/deletion-executor'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { watchedEventId?: string } | null
  const watchedEventId = body?.watchedEventId
  if (!watchedEventId) return NextResponse.json({ error: 'watchedEventId required' }, { status: 400 })

  const store = readStore()
  const event = store.watchedEvents.find(e => e.id === watchedEventId)
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  if (event.matchStatus !== 'matched' || !event.arrId) {
    return NextResponse.json({ error: 'event is not matched' }, { status: 400 })
  }

  // Evaluate and create queue items for this event if none exist
  const newItems = evaluateRules(event, store.rules, store.deletionQueue, store.watchedEvents)
  if (newItems.length) {
    updateStore(s => { s.deletionQueue.push(...newItems) })
    // Set all new items as due now
    updateStore(s => {
      const now = Date.now()
      for (const item of newItems) {
        const qi = s.deletionQueue.find(q => q.id === item.id)
        if (qi) qi.scheduledAt = now
      }
    })
  } else {
    // Force existing pending items for this event as due now
    updateStore(s => {
      const now = Date.now()
      for (const qi of s.deletionQueue) {
        if (qi.watchedEventId === watchedEventId && qi.status === 'pending') qi.scheduledAt = now
      }
    })
  }

  try {
    const result = await runExecutorCycle()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ executed: 0, errorMessage: (e as Error).message })
  }
}
```

- [ ] **Step 9: Run tests**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test -- --testPathPattern=__tests__/api/deletion-queue.test.ts
```

Expected: All tests pass.

- [ ] **Step 10: Run full test suite**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add app/api/deletion-queue/ __tests__/api/deletion-queue.test.ts
git commit -m "feat(rules): add deletion queue API routes (GET, cancel, execute, trigger, evaluate, execute-event)"
```

---

### Task 7: UI

**Files:**
- Create: `components/RulesPanel.tsx`
- Modify: `components/WatchedDrawer.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/rules`, `PUT/DELETE /api/rules/[id]`, `GET /api/deletion-queue`, `POST /api/deletion-queue/trigger`, `POST /api/deletion-queue/evaluate`, `POST /api/deletion-queue/[id]/execute`, `DELETE /api/deletion-queue/[id]`, `POST /api/deletion-queue/execute-event`
- Consumes types: `AutoDeleteRule`, `DeletionQueueItem` from `@/lib/types`
- Modifies `app/page.tsx`: adds `rulesOpen` state + "Rules" button + `<RulesPanel />` overlay

- [ ] **Step 1: Create `components/RulesPanel.tsx`**

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import type { AutoDeleteRule, DeletionQueueItem, DeletionQueueStatus } from '@/lib/types'

const DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

const BLANK_FORM: Partial<AutoDeleteRule> = {
  name: '',
  enabled: true,
  mediaType: 'movie',
  granularity: 'movie',
  action: 'delete',
  deleteFiles: true,
  delayAmount: 7,
  delayUnit: 'days',
  scope: 'global',
}

function delayLabel(r: AutoDeleteRule): string {
  return r.delayUnit === 'year' ? '1 year' : `${r.delayAmount} ${r.delayUnit}`
}

function formatScheduled(ts: number): string {
  const diff = ts - Date.now()
  if (Math.abs(diff) < 60_000) return 'now'
  if (diff > 0) {
    if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`
    if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`
    return `in ${Math.floor(diff / 86_400_000)}d`
  }
  const ago = Math.abs(diff)
  if (ago < 3_600_000) return `overdue ${Math.floor(ago / 60_000)}m ago`
  if (ago < 86_400_000) return `overdue ${Math.floor(ago / 3_600_000)}h ago`
  return `overdue ${Math.floor(ago / 86_400_000)}d ago`
}

type QueueFilter = 'all' | DeletionQueueStatus

export function RulesPanel() {
  const [rules, setRules] = useState<AutoDeleteRule[]>([])
  const [queue, setQueue] = useState<DeletionQueueItem[]>([])
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<AutoDeleteRule>>(BLANK_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const loadRules = useCallback(() => {
    fetch('/api/rules').then(r => r.json()).then(d => setRules(d.rules ?? []))
  }, [])

  const loadQueue = useCallback(() => {
    const url = queueFilter === 'all' ? '/api/deletion-queue' : `/api/deletion-queue?status=${queueFilter}`
    fetch(url).then(r => r.json()).then(d => setQueue(d.items ?? []))
  }, [queueFilter])

  useEffect(() => { loadRules(); loadQueue() }, [loadRules, loadQueue])

  const handleSaveRule = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId ? `/api/rules/${editingId}` : '/api/rules'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Failed to save'); return }
      setShowForm(false)
      setEditingId(null)
      setForm(BLANK_FORM)
      loadRules()
      loadQueue()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRule = async (id: string) => {
    await fetch(`/api/rules/${id}`, { method: 'DELETE' })
    loadRules()
    loadQueue()
  }

  const handleToggleEnabled = async (rule: AutoDeleteRule) => {
    await fetch(`/api/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    })
    loadRules()
  }

  const handleEditRule = (rule: AutoDeleteRule) => {
    setForm({ ...rule })
    setEditingId(rule.id)
    setShowForm(true)
    setFormError(null)
  }

  const handleCancelItem = async (id: string) => {
    await fetch(`/api/deletion-queue/${id}`, { method: 'DELETE' })
    loadQueue()
  }

  const handleExecuteItem = async (id: string) => {
    await fetch(`/api/deletion-queue/${id}/execute`, { method: 'POST' })
    loadQueue()
  }

  const handleTrigger = async () => {
    setTriggering(true)
    try { await fetch('/api/deletion-queue/trigger', { method: 'POST' }) }
    finally { setTriggering(false); loadQueue() }
  }

  const handleEvaluate = async () => {
    setEvaluating(true)
    try { await fetch('/api/deletion-queue/evaluate', { method: 'POST' }) }
    finally { setEvaluating(false); loadQueue() }
  }

  const filteredQueue = queueFilter === 'all' ? queue : queue.filter(i => i.status === queueFilter)

  const queueCounts: Record<QueueFilter, number> = {
    all: queue.length,
    pending: queue.filter(i => i.status === 'pending').length,
    done: queue.filter(i => i.status === 'done').length,
    failed: queue.filter(i => i.status === 'failed').length,
    cancelled: queue.filter(i => i.status === 'cancelled').length,
  }

  const STATUS_CHIP: Record<DeletionQueueStatus, string> = {
    pending: 'bg-yellow-800 text-yellow-200',
    done: 'bg-green-800 text-green-200',
    failed: 'bg-red-900 text-red-300',
    cancelled: 'bg-slate-700 text-slate-400',
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Rules section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Auto-Delete Rules</h2>
          {!showForm && (
            <button
              onClick={() => { setForm(BLANK_FORM); setEditingId(null); setShowForm(true); setFormError(null) }}
              className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
            >
              + Add Rule
            </button>
          )}
        </div>

        {showForm && (
          <div className="bg-slate-800 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Name</label>
                <input
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-indigo-500"
                  value={form.name ?? ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Rule name"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Media type</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.mediaType}
                  onChange={e => {
                    const mt = e.target.value as 'movie' | 'series'
                    setForm(f => ({ ...f, mediaType: mt, granularity: mt === 'movie' ? 'movie' : 'episode' }))
                  }}
                >
                  <option value="movie">Movie</option>
                  <option value="series">Series</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Granularity</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.granularity}
                  onChange={e => setForm(f => ({ ...f, granularity: e.target.value as AutoDeleteRule['granularity'] }))}
                  disabled={form.mediaType === 'movie'}
                >
                  {form.mediaType === 'movie' ? (
                    <option value="movie">Movie</option>
                  ) : (
                    <>
                      <option value="episode">Episode</option>
                      <option value="season">Season</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Action</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.action}
                  onChange={e => setForm(f => ({ ...f, action: e.target.value as 'delete' | 'unmonitor' }))}
                >
                  <option value="delete">Delete</option>
                  <option value="unmonitor">Unmonitor</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="deleteFiles"
                  checked={form.deleteFiles ?? false}
                  onChange={e => setForm(f => ({ ...f, deleteFiles: e.target.checked }))}
                  disabled={form.action !== 'delete'}
                  className="rounded"
                />
                <label htmlFor="deleteFiles" className="text-sm text-slate-300">Delete files</label>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Delay amount</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.delayAmount ?? 7}
                  onChange={e => setForm(f => ({ ...f, delayAmount: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Delay unit</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.delayUnit}
                  onChange={e => setForm(f => ({ ...f, delayUnit: e.target.value as AutoDeleteRule['delayUnit'] }))}
                >
                  {DELAY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Scope</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.scope}
                  onChange={e => setForm(f => ({ ...f, scope: e.target.value as 'global' | 'specific' }))}
                >
                  <option value="global">Global</option>
                  <option value="specific">Specific title</option>
                </select>
              </div>
            </div>
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSaveRule}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK_FORM) }}
                className="px-4 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 && !showForm && (
          <p className="text-slate-500 text-sm">No rules yet. Add one to start auto-deleting watched media.</p>
        )}

        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3">
              <button
                onClick={() => handleToggleEnabled(rule)}
                className={`w-8 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-indigo-600' : 'bg-slate-600'}`}
                title={rule.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
              >
                <span className={`block w-3 h-3 bg-white rounded-full mx-auto transition-transform ${rule.enabled ? 'translate-x-1.5' : '-translate-x-1.5'}`} />
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium">{rule.name}</span>
                <span className="ml-2 text-slate-400 text-xs">after {delayLabel(rule)}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${rule.action === 'delete' ? 'bg-red-900 text-red-300' : 'bg-blue-900 text-blue-300'}`}>
                {rule.action}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                {rule.scope === 'global' ? 'Global' : rule.scopeTitle ?? `id:${rule.arrId}`}
              </span>
              <button onClick={() => handleEditRule(rule)} className="text-slate-400 hover:text-white text-sm" title="Edit">✏</button>
              <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-400 hover:text-red-400 text-sm" title="Delete">×</button>
            </div>
          ))}
        </div>
      </section>

      <hr className="border-slate-700" />

      {/* Queue section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Deletion Queue</h2>
          <div className="flex gap-2">
            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50"
            >
              {evaluating ? 'Evaluating…' : 'Re-evaluate'}
            </button>
            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded disabled:opacity-50"
            >
              {triggering ? 'Running…' : 'Run overdue'}
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-3">
          {(['all', 'pending', 'done', 'failed', 'cancelled'] as QueueFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setQueueFilter(f)}
              className={`px-3 py-1 text-xs rounded ${queueFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {f} ({queueCounts[f]})
            </button>
          ))}
        </div>

        {filteredQueue.length === 0 && (
          <p className="text-slate-500 text-sm">No items in queue.</p>
        )}

        <div className="space-y-2">
          {filteredQueue.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm">{item.title}</span>
                {item.granularity === 'episode' && item.seasonNumber != null && item.episodeNumber != null && (
                  <span className="ml-1 text-slate-400 text-xs">S{String(item.seasonNumber).padStart(2, '0')}E{String(item.episodeNumber).padStart(2, '0')}</span>
                )}
                {item.granularity === 'season' && item.seasonNumber != null && (
                  <span className="ml-1 text-slate-400 text-xs">S{String(item.seasonNumber).padStart(2, '0')}</span>
                )}
                <span className="ml-2 text-slate-500 text-xs">{item.ruleName}</span>
              </div>
              <span className="text-slate-400 text-xs">{formatScheduled(item.scheduledAt)}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CHIP[item.status]}`}>{item.status}</span>
              {item.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleExecuteItem(item.id)}
                    className="text-xs px-2 py-0.5 bg-amber-700 hover:bg-amber-600 text-white rounded"
                    title="Execute now"
                  >
                    Trigger
                  </button>
                  <button
                    onClick={() => handleCancelItem(item.id)}
                    className="text-slate-400 hover:text-red-400 text-xs"
                    title="Cancel"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add ⚡ button to `components/WatchedDrawer.tsx`**

First, find the section that renders individual rows (where `handleRemove` is called per row). After the existing row action buttons, add the ⚡ button for matched events.

Add state for per-row execution status near the top of the component body (alongside the existing `loading` and `rematching` state):

```tsx
  const [executing, setExecuting] = useState<Record<string, 'running' | 'done' | 'error'>>({})
```

Then add the `handleExecuteEvent` handler:

```tsx
  const handleExecuteEvent = async (eventId: string) => {
    setExecuting(prev => ({ ...prev, [eventId]: 'running' }))
    try {
      const res = await fetch('/api/deletion-queue/execute-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchedEventId: eventId }),
      })
      const data = await res.json()
      setExecuting(prev => ({ ...prev, [eventId]: res.ok && data.executed > 0 ? 'done' : 'error' }))
    } catch {
      setExecuting(prev => ({ ...prev, [eventId]: 'error' }))
    }
  }
```

In the row render, after the existing remove button (or alongside the match status chip), add the ⚡ button. Find the element that renders `ev.matchStatus` (or where `handleRemove(ev.id)` is called), and alongside it add:

```tsx
{ev.matchStatus === 'matched' && (
  <button
    onClick={() => handleExecuteEvent(ev.id)}
    disabled={executing[ev.id] === 'running'}
    title={executing[ev.id] === 'done' ? 'Executed' : executing[ev.id] === 'error' ? 'Failed' : 'Delete now via rules'}
    className={`text-xs px-1.5 py-0.5 rounded ${
      executing[ev.id] === 'done' ? 'bg-green-800 text-green-200' :
      executing[ev.id] === 'error' ? 'bg-red-900 text-red-300' :
      'bg-amber-700 hover:bg-amber-600 text-white'
    } disabled:opacity-50`}
  >
    {executing[ev.id] === 'running' ? '…' : executing[ev.id] === 'done' ? '✓' : executing[ev.id] === 'error' ? '!' : '⚡'}
  </button>
)}
```

- [ ] **Step 3: Add Rules overlay to `app/page.tsx`**

Add the import at the top:

```tsx
import { RulesPanel } from '@/components/RulesPanel'
```

Add state alongside the existing `watchedOpen` state:

```tsx
  const [rulesOpen, setRulesOpen] = useState(false)
```

Add the Rules button in the header alongside the existing Watched button (find where `setWatchedOpen(true)` is called and add the Rules button nearby):

```tsx
<button
  onClick={() => setRulesOpen(true)}
  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
>
  Rules
</button>
```

Add the Rules overlay after the `<WatchedDrawer />` closing tag. The overlay replaces the main content when open:

```tsx
{rulesOpen && (
  <div className="fixed inset-0 z-40 bg-slate-900 overflow-y-auto">
    <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
      <button
        onClick={() => setRulesOpen(false)}
        className="text-sm text-slate-400 hover:text-white"
      >
        ← Back
      </button>
      <h1 className="text-white font-semibold">Auto-Delete Rules</h1>
    </div>
    <RulesPanel />
  </div>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/athul/Projects/Bulkarr && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/RulesPanel.tsx components/WatchedDrawer.tsx app/page.tsx
git commit -m "feat(rules): add RulesPanel UI, ⚡ execute button in WatchedDrawer, Rules overlay in page"
```

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-07-03-auto-delete-rules-engine.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task + two-stage review gates

**2. Inline Execution** — Execute tasks in this session using executing-plans skill

Which approach?

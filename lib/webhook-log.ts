// In-memory ring buffer — last 20 raw webhook arrivals, cleared on restart
export interface WebhookLogEntry {
  ts: number
  source: 'jellyfin' | 'plex'
  body: unknown
}

const MAX = 20
const log: WebhookLogEntry[] = []

export function appendWebhookLog(entry: WebhookLogEntry) {
  log.unshift(entry)
  if (log.length > MAX) log.length = MAX
}

export function getWebhookLog(): WebhookLogEntry[] {
  return [...log]
}

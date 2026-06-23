export function isValidServiceUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try { return /^https?:\/\/.+/.test(new URL(url).href) } catch { return false }
}

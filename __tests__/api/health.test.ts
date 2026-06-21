// @jest-environment node

test('GET /api/health returns status ok with version string', async () => {
  const { GET } = await import('@/app/api/health/route')
  const res = await GET()
  const json = await res.json()
  expect(json.status).toBe('ok')
  expect(typeof json.version).toBe('string')
})

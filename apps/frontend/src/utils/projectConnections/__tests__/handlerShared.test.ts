/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const hoisted = vi.hoisted(() => ({
  invalidate: vi.fn(),
}))

vi.mock('~/utils/connectionManager', () => ({
  connectionManager: { invalidate: hoisted.invalidate },
}))

import {
  extractRequestMeta,
  formatZodError,
  invalidateForProject,
} from '../handlerShared'

function req(headers: Record<string, unknown>, remoteAddress?: string) {
  return { headers, socket: { remoteAddress } } as any
}

describe('extractRequestMeta', () => {
  it('takes the first hop of a comma-separated x-forwarded-for', () => {
    expect(
      extractRequestMeta(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))
        .source_ip,
    ).toBe('203.0.113.7')
  })

  it('takes the first entry when x-forwarded-for arrives as an array', () => {
    // Node collapses repeated headers into an array; the proxy nearest the
    // client is still the one we want.
    expect(
      extractRequestMeta(req({ 'x-forwarded-for': ['198.51.100.4', '10.0.0.1'] }))
        .source_ip,
    ).toBe('198.51.100.4')
  })

  it('falls back to the socket address when unproxied', () => {
    expect(extractRequestMeta(req({}, '192.0.2.5')).source_ip).toBe('192.0.2.5')
  })

  it('returns null when there is no address at all', () => {
    expect(extractRequestMeta(req({})).source_ip).toBeNull()
  })

  it('reads user-agent as string or array', () => {
    expect(extractRequestMeta(req({ 'user-agent': 'curl/8' })).user_agent).toBe(
      'curl/8',
    )
    expect(
      extractRequestMeta(req({ 'user-agent': ['curl/8', 'x'] })).user_agent,
    ).toBe('curl/8')
    expect(extractRequestMeta(req({})).user_agent).toBeNull()
  })

  it('prefers x-request-id, then x-correlation-id, then null', () => {
    expect(extractRequestMeta(req({ 'x-request-id': 'rid' })).request_id).toBe(
      'rid',
    )
    expect(
      extractRequestMeta(req({ 'x-correlation-id': 'cid' })).request_id,
    ).toBe('cid')
    expect(
      extractRequestMeta(req({ 'x-request-id': ['a', 'b'] })).request_id,
    ).toBe('a')
    expect(extractRequestMeta(req({})).request_id).toBeNull()
  })
})

describe('formatZodError', () => {
  it('flattens issue paths into dotted strings', () => {
    const schema = z.object({ nested: z.object({ port: z.number() }) })
    const parsed = schema.safeParse({ nested: { port: 'not-a-number' } })
    expect(parsed.success).toBe(false)

    const formatted = formatZodError(parsed.error!)
    expect(formatted.message).toBe('Validation failed')
    expect(formatted.issues[0]?.path).toBe('nested.port')
    expect(formatted.issues[0]?.message).toBeTruthy()
  })
})

describe('invalidateForProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to the connection manager', async () => {
    hoisted.invalidate.mockResolvedValueOnce(undefined)
    await invalidateForProject('cardiology')
    expect(hoisted.invalidate).toHaveBeenCalledWith('cardiology')
  })

  it('warns but does not throw when invalidation fails', async () => {
    // A stale cache entry must never fail the write that preceded it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    hoisted.invalidate.mockRejectedValueOnce(new Error('redis down'))

    await expect(invalidateForProject('cardiology')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('cardiology'),
      expect.any(Error),
    )
    warn.mockRestore()
  })
})

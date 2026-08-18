/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  /** Rows keyed by course_name; `null` means the project row is absent. */
  rows: new Map<string, Record<string, string | null> | null>(),
  selectCalls: 0,
  failNext: false,
}))

vi.mock('~/db/dbClient', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (predicate: { courseName?: string }) => ({
          limit: async () => {
            hoisted.selectCalls += 1
            if (hoisted.failNext) throw new Error('connection refused')
            const row = hoisted.rows.get(predicate.courseName ?? '')
            return row ? [row] : []
          },
        }),
      }),
    }),
  },
}))

// The real `eq` builds a SQL fragment; the fake just carries the value through
// so the mocked `where` above can look the row up.
vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: string) => ({ courseName: value }),
}))

vi.mock('~/db/schema', () => ({
  projects: {
    course_name: 'course_name',
    sim_api_key: 'sim_api_key',
    sim_base_url: 'sim_base_url',
    sim_workspace_id: 'sim_workspace_id',
  },
}))

import {
  invalidateSimConfigCache,
  resolveSimCredentials,
  validateSimBaseUrl,
} from '../simConfig'

beforeEach(() => {
  hoisted.rows.clear()
  hoisted.selectCalls = 0
  hoisted.failNext = false
  invalidateSimConfigCache()
  vi.useRealTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function storeConfig(
  course: string,
  config: Partial<Record<string, string | null>> = {},
) {
  hoisted.rows.set(course, {
    sim_api_key: 'sk-sim-stored',
    sim_base_url: null,
    sim_workspace_id: 'ws-stored',
    ...config,
  })
}

describe('resolveSimCredentials', () => {
  it('resolves from the stored project row', async () => {
    storeConfig('proj', { sim_base_url: 'http://localhost:3010' })

    const result = await resolveSimCredentials('proj')

    expect(result).toEqual({
      ok: true,
      creds: {
        api_key: 'sk-sim-stored',
        workspace_id: 'ws-stored',
        base_url: 'http://localhost:3010',
      },
    })
  })

  it('reports not_configured for a project with no key, and for no project', async () => {
    storeConfig('blank', { sim_api_key: null })

    await expect(resolveSimCredentials('blank')).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
    await expect(resolveSimCredentials('missing')).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
    await expect(resolveSimCredentials()).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
  })

  it('treats an empty stored key as unconfigured rather than resolving it', async () => {
    storeConfig('proj', { sim_api_key: '' })

    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
  })

  it('distinguishes a failed read from an unconfigured project', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    storeConfig('proj')
    hoisted.failNext = true

    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'db_error',
    })
  })

  it('serves repeat reads from cache instead of re-querying', async () => {
    storeConfig('proj')

    await resolveSimCredentials('proj')
    await resolveSimCredentials('proj')
    await resolveSimCredentials('proj')

    expect(hoisted.selectCalls).toBe(1)
  })

  it('caches per project rather than globally', async () => {
    storeConfig('a')
    storeConfig('b', { sim_api_key: 'sk-sim-b' })

    const first = await resolveSimCredentials('a')
    const second = await resolveSimCredentials('b')

    expect(hoisted.selectCalls).toBe(2)
    expect(first.ok && first.creds.api_key).toBe('sk-sim-stored')
    expect(second.ok && second.creds.api_key).toBe('sk-sim-b')
  })

  it('re-reads once the cached entry expires', async () => {
    vi.useFakeTimers()
    storeConfig('proj')

    await resolveSimCredentials('proj')
    vi.advanceTimersByTime(60_001)
    await resolveSimCredentials('proj')

    expect(hoisted.selectCalls).toBe(2)
  })

  it('picks up a saved key immediately after invalidation', async () => {
    storeConfig('proj', { sim_api_key: 'sk-sim-old' })
    const before = await resolveSimCredentials('proj')
    expect(before.ok && before.creds.api_key).toBe('sk-sim-old')

    storeConfig('proj', { sim_api_key: 'sk-sim-new' })
    invalidateSimConfigCache('proj')
    const after = await resolveSimCredentials('proj')

    expect(after.ok && after.creds.api_key).toBe('sk-sim-new')
  })

  it('does not cache a failed read as "no configuration"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    storeConfig('proj')
    hoisted.failNext = true
    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'db_error',
    })

    hoisted.failNext = false
    const retried = await resolveSimCredentials('proj')

    expect(retried.ok).toBe(true)
  })
})

describe('validateSimBaseUrl', () => {
  const cases: Array<[string, string | null]> = [
    ['https://www.sim.ai', 'https://www.sim.ai'],
    ['https://sim.ai', 'https://sim.ai'],
    ['https://api.sim.ai', 'https://api.sim.ai'],
    ['http://localhost:3010', 'http://localhost:3010'],
    ['http://127.0.0.1:3010', 'http://127.0.0.1:3010'],
    ['http://simstudio:3000', 'http://simstudio:3000'],
    // Rejections: wrong scheme, lookalike hosts, and non-URLs.
    ['http://www.sim.ai', null],
    ['https://sim.ai.evil.com', null],
    ['https://evil.com', null],
    ['https://notsim.ai', null],
    ['http://evil.com', null],
    ['file:///etc/passwd', null],
    ['not a url', null],
    ['', null],
  ]

  it.each(cases)('validates %s', (input, expected) => {
    expect(validateSimBaseUrl(input)).toBe(expected)
  })

  it('drops any path, query or fragment from an allowed URL', () => {
    expect(validateSimBaseUrl('https://www.sim.ai/foo?a=1#b')).toBe(
      'https://www.sim.ai',
    )
  })
})

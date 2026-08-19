/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeRes() {
  const res: any = {}
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

const selectRows: any[] = []
const updateCalls: Array<{ set: any; returning: any[] }> = []
let updateReturning: any[] = []
const invalidated: string[] = []

beforeEach(() => {
  selectRows.length = 0
  updateCalls.length = 0
  updateReturning = [{ course_name: 'cs101' }]
  invalidated.length = 0
  vi.resetModules()

  vi.doMock('~/db/dbClient', () => ({
    db: {
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ limit: async () => selectRows }) }),
      })),
      update: vi.fn(() => ({
        set: (values: any) => ({
          where: () => ({
            returning: async () => {
              updateCalls.push({ set: values, returning: updateReturning })
              return updateReturning
            },
          }),
        }),
      })),
    },
  }))
  vi.doMock('~/utils/simConfig', async (importOriginal) => {
    const actual: any = await importOriginal()
    return {
      ...actual,
      invalidateSimConfigCache: vi.fn((name: string) => {
        invalidated.push(name)
      }),
    }
  })
})

afterEach(() => {
  vi.doUnmock('~/db/dbClient')
  vi.doUnmock('~/utils/simConfig')
})

describe('getSimConfig handler', () => {
  it('never returns the API key — only a mask and a presence flag', async () => {
    selectRows.push({
      sim_api_key: 'sk-sim-super-secret-value-12345678',
      sim_base_url: null,
      sim_workspace_id: 'ws-1',
    })
    const { handler } = await import('../getSimConfig')
    const res = makeRes()
    await handler(
      { method: 'GET', courseName: 'cs101', user: {} } as any,
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      has_api_key: true,
      sim_api_key_masked: 'sk-s' + '*'.repeat(26) + '5678',
      sim_base_url: null,
      sim_workspace_id: 'ws-1',
    })
    expect(JSON.stringify(res.body)).not.toContain('super-secret')
  })

  it('reports an unconfigured project without inventing values', async () => {
    const { handler } = await import('../getSimConfig')
    const res = makeRes()
    await handler(
      { method: 'GET', courseName: 'cs101', user: {} } as any,
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      has_api_key: false,
      sim_api_key_masked: null,
      sim_base_url: null,
      sim_workspace_id: null,
    })
  })
})

describe('upsertSimConfig handler', () => {
  const req = (body: any) =>
    ({ method: 'POST', courseName: 'cs101', user: {}, body }) as any

  it('leaves the stored key alone when the body omits it', async () => {
    const { handler } = await import('../upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_workspace_id: 'ws-2' }), res)

    expect(res.statusCode).toBe(200)
    expect(updateCalls[0]?.set).toEqual({ sim_workspace_id: 'ws-2' })
    expect(invalidated).toEqual(['cs101'])
  })

  it('accepts an allowed base URL and stores it trimmed', async () => {
    const { handler } = await import('../upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_base_url: '  https://www.sim.ai  ' }), res)

    expect(res.statusCode).toBe(200)
    expect(updateCalls[0]?.set).toEqual({ sim_base_url: 'https://www.sim.ai' })
  })

  it('rejects a base URL outside the allowlist at save time', async () => {
    const { handler } = await import('../upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_base_url: 'https://evil.example.com' }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/base URL/i)
    expect(updateCalls).toHaveLength(0)
    expect(invalidated).toEqual([])
  })

  it('clears the base URL when given blank or null', async () => {
    const { handler } = await import('../upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_base_url: '   ' }), res)

    expect(res.statusCode).toBe(200)
    expect(updateCalls[0]?.set).toEqual({ sim_base_url: null })
  })

  it('404s when no project row matched', async () => {
    updateReturning = []
    const { handler } = await import('../upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_api_key: 'sk-sim-x' }), res)

    expect(res.statusCode).toBe(404)
    expect(invalidated).toEqual([])
  })
})

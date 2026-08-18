import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn((options: any) => options),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: useQueryMock }))

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}))

function workflowsResponse(workflows: unknown[]) {
  return new Response(JSON.stringify({ workflows }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('useFetchAllWorkflows', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('wires queryKey + queryFn to fetchSimTools', async () => {
    const { useFetchAllWorkflows } = await import('../handleFunctionCalling')

    // Simulate localStorage credentials so fetchSimTools makes a fetch call
    localStorage.setItem('sim_api_key_proj', 'sk-sim-test')
    localStorage.setItem('sim_workspace_id_proj', 'ws-123')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workflows: [
            {
              id: 'w1',
              name: 'My Workflow',
              description: 'desc',
              inputFields: [],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const query = useFetchAllWorkflows('proj') as any
    expect(query.queryKey).toEqual(['tools', 'proj'])

    const data = await query.queryFn()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('sim_my_workflow')
  })

  it('throws when course_name is not provided', async () => {
    const { useFetchAllWorkflows } = await import('../handleFunctionCalling')
    expect(() => useFetchAllWorkflows()).toThrow(/course_name is required/i)
  })

  it('queryFn propagates failures so callers can report the real cause', async () => {
    const { useFetchAllWorkflows } = await import('../handleFunctionCalling')

    localStorage.setItem('sim_api_key_proj', 'sk-sim-test')
    localStorage.setItem('sim_workspace_id_proj', 'ws-123')

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'))

    const query = useFetchAllWorkflows('proj') as any
    await expect(query.queryFn()).rejects.toThrow(/network/)
  })

  it('persists the discovered tools so a reload can skip discovery', async () => {
    const { useFetchAllWorkflows, readCachedSimTools } = await import(
      '../handleFunctionCalling'
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      workflowsResponse([
        { id: 'w1', name: 'My Workflow', description: 'desc', inputFields: [] },
      ]),
    )

    await (useFetchAllWorkflows('proj') as any).queryFn()

    const cached = readCachedSimTools('proj')
    expect(cached?.tools).toHaveLength(1)
    expect(cached?.tools[0]?.name).toBe('sim_my_workflow')
  })

  it('seeds the query from a fresh cache, stamped with when it was taken', async () => {
    const { useFetchAllWorkflows } = await import('../handleFunctionCalling')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      workflowsResponse([
        { id: 'w1', name: 'My Workflow', description: 'desc', inputFields: [] },
      ]),
    )
    await (useFetchAllWorkflows('proj') as any).queryFn()

    const query = useFetchAllWorkflows('proj') as any
    expect(query.initialData).toHaveLength(1)
    // Without the timestamp React Query would treat the seed as fetched now and
    // never refresh it; with it, staleTime is measured from the real read.
    expect(typeof query.initialDataUpdatedAt).toBe('number')
  })

  it('ignores an expired cache so the next mount rediscovers', async () => {
    vi.useFakeTimers()
    const { useFetchAllWorkflows, readCachedSimTools } = await import(
      '../handleFunctionCalling'
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      workflowsResponse([
        { id: 'w1', name: 'My Workflow', description: 'desc', inputFields: [] },
      ]),
    )
    await (useFetchAllWorkflows('proj') as any).queryFn()

    vi.advanceTimersByTime(60_001)

    expect(readCachedSimTools('proj')).toBeNull()
    expect((useFetchAllWorkflows('proj') as any).initialData).toBeUndefined()
  })

  it('treats an unparseable cache entry as a miss', async () => {
    const { useFetchAllWorkflows, readCachedSimTools } = await import(
      '../handleFunctionCalling'
    )
    localStorage.setItem('sim_tools_proj', 'not json')

    expect(readCachedSimTools('proj')).toBeNull()
    expect((useFetchAllWorkflows('proj') as any).initialData).toBeUndefined()
  })

  it('clearCachedSimTools drops the entry so new credentials rediscover', async () => {
    const { useFetchAllWorkflows, readCachedSimTools, clearCachedSimTools } =
      await import('../handleFunctionCalling')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      workflowsResponse([
        { id: 'w1', name: 'My Workflow', description: 'desc', inputFields: [] },
      ]),
    )
    await (useFetchAllWorkflows('proj') as any).queryFn()
    expect(readCachedSimTools('proj')).not.toBeNull()

    clearCachedSimTools('proj')
    expect(readCachedSimTools('proj')).toBeNull()
  })

  it('caches per project', async () => {
    const { useFetchAllWorkflows, readCachedSimTools } = await import(
      '../handleFunctionCalling'
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      workflowsResponse([
        { id: 'w1', name: 'My Workflow', description: 'desc', inputFields: [] },
      ]),
    )
    await (useFetchAllWorkflows('proj') as any).queryFn()

    expect(readCachedSimTools('proj')).not.toBeNull()
    expect(readCachedSimTools('other-proj')).toBeNull()
  })
})

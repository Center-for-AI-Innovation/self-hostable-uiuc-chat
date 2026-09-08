/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertWorkflowInWorkspace,
  clearWorkspaceMembershipCache,
  discoverSimWorkflows,
  extractInputFields,
  parseSimErrorMessage,
  sanitizeSimWorkflowInput,
  SimListError,
  simUpstreamErrorResponse,
} from '../simDiscovery'

const BASE = 'https://www.sim.ai'

function listResponse(items: Array<{ id: string; name: string }>) {
  return new Response(JSON.stringify({ data: items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function detailResponse(inputs: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ data: { inputs } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function discover(signal?: AbortSignal) {
  return discoverSimWorkflows({
    simBaseUrl: BASE,
    apiKey: 'k',
    workspaceId: 'ws',
    signal,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('discoverSimWorkflows', () => {
  it('describes each listed workflow from its detail response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) =>
      url.includes('/workflows/w1')
        ? Promise.resolve(
            detailResponse([
              { name: 'state', type: 'string', description: 'A state' },
            ]),
          )
        : Promise.resolve(listResponse([{ id: 'w1', name: 'MRTN' }]))) as any)

    const { workflows, failed } = await discover()

    expect(failed).toEqual([])
    expect(workflows).toEqual([
      {
        id: 'w1',
        name: 'MRTN',
        description: '',
        inputFields: [
          { name: 'state', type: 'string', description: 'A state' },
        ],
      },
    ])
  })

  it('omits a workflow whose detail request fails rather than publishing an empty schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) => {
      if (url.includes('/workflows/bad')) {
        return Promise.resolve(new Response('nope', { status: 500 }))
      }
      if (url.includes('/workflows/good')) {
        return Promise.resolve(detailResponse([{ name: 'q', type: 'string' }]))
      }
      return Promise.resolve(
        listResponse([
          { id: 'good', name: 'Good' },
          { id: 'bad', name: 'Bad' },
        ]),
      )
    }) as any)

    const { workflows, failed } = await discover()

    expect(workflows.map((w) => w.id)).toEqual(['good'])
    expect(failed).toEqual([
      { id: 'bad', name: 'Bad', reason: 'detail request returned 500' },
    ])
    // The failed one must not appear with a fabricated empty field list.
    expect(workflows.find((w) => w.id === 'bad')).toBeUndefined()
  })

  it('omits a workflow whose detail request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) =>
      url.includes('/workflows/w1')
        ? Promise.reject(new Error('socket hang up'))
        : Promise.resolve(listResponse([{ id: 'w1', name: 'Flaky' }]))) as any)

    const { workflows, failed } = await discover()

    expect(workflows).toEqual([])
    expect(failed).toEqual([
      { id: 'w1', name: 'Flaky', reason: 'socket hang up' },
    ])
  })

  it('keeps a genuinely input-less workflow, distinct from a failed one', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) =>
      url.includes('/workflows/w1')
        ? Promise.resolve(detailResponse([]))
        : Promise.resolve(
            listResponse([{ id: 'w1', name: 'NoInputs' }]),
          )) as any)

    const { workflows, failed } = await discover()

    expect(failed).toEqual([])
    expect(workflows[0]?.inputFields).toEqual([])
  })

  it('caps concurrent detail requests', async () => {
    let inFlight = 0
    let peak = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) => {
      if (!url.includes('/workflows/w')) {
        return Promise.resolve(
          listResponse(
            Array.from({ length: 20 }, (_, i) => ({
              id: `w${i}`,
              name: `W${i}`,
            })),
          ),
        )
      }
      inFlight++
      peak = Math.max(peak, inFlight)
      return new Promise((resolve) =>
        setTimeout(() => {
          inFlight--
          resolve(detailResponse([]))
        }, 5),
      )
    }) as any)

    const { workflows } = await discover()

    expect(workflows).toHaveLength(20)
    expect(peak).toBeLessThanOrEqual(5)
    expect(peak).toBeGreaterThan(1)
  })

  it('records a timeout as a failure instead of hanging', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((
      url: string,
      init?: RequestInit,
    ) => {
      if (!url.includes('/workflows/w1')) {
        return Promise.resolve(listResponse([{ id: 'w1', name: 'Slow' }]))
      }
      // Never settles on its own; only the abort signal ends it.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    }) as any)

    vi.useFakeTimers()
    const promise = discover()
    await vi.advanceTimersByTimeAsync(15_000)
    const { workflows, failed } = await promise

    expect(workflows).toEqual([])
    expect(failed).toEqual([
      { id: 'w1', name: 'Slow', reason: 'detail request timed out' },
    ])
  })

  it('throws SimListError carrying the upstream status when listing fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 401 }) as any,
    )

    await expect(discover()).rejects.toBeInstanceOf(SimListError)
    await expect(discover()).rejects.toMatchObject({ status: 401 })
  })
})

describe('discovery of reserved input names', () => {
  it('drops input fields that collide with Sim execute control fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) =>
      url.includes('/workflows/w1')
        ? Promise.resolve(
            detailResponse([
              { name: 'state', type: 'string' },
              // Sim consumes these from the execute body before the workflow
              // runs, so they can never be delivered as inputs.
              { name: 'stream', type: 'string' },
              { name: 'workflowStateOverride', type: 'string' },
            ]),
          )
        : Promise.resolve(listResponse([{ id: 'w1', name: 'WF' }]))) as any)

    const { workflows, failed } = await discover()

    expect(failed).toEqual([])
    expect(workflows[0]?.inputFields.map((f) => f.name)).toEqual(['state'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('collide'), [
      'stream',
      'workflowStateOverride',
    ])
  })
})

describe('sanitizeSimWorkflowInput', () => {
  it('returns the input untouched when nothing collides', () => {
    const input = { state: 'IL', corn_price: '4.5' }
    const result = sanitizeSimWorkflowInput(input)
    expect(result.input).toBe(input)
    expect(result.stripped).toEqual([])
  })

  it('strips reserved control fields and reports them', () => {
    const result = sanitizeSimWorkflowInput({
      state: 'IL',
      stream: true,
      workflowStateOverride: { blocks: [] },
      runFromBlock: 'b1',
    })
    expect(result.input).toEqual({ state: 'IL' })
    expect(result.stripped).toEqual([
      'stream',
      'workflowStateOverride',
      'runFromBlock',
    ])
  })

  it('does not strip dual-read fields a workflow may legitimately declare', () => {
    const result = sanitizeSimWorkflowInput({ input: 'text', executionId: 'x' })
    expect(result.input).toEqual({ input: 'text', executionId: 'x' })
    expect(result.stripped).toEqual([])
  })
})

describe('parseSimErrorMessage', () => {
  const FALLBACK = 'Sim API returned 401: Unauthorized'

  it('reads the v1 string envelope', () => {
    expect(
      parseSimErrorMessage('{"error": "API key required"}', FALLBACK),
    ).toBe('API key required')
  })

  it('reads the v2 object envelope without surfacing [object Object]', () => {
    expect(
      parseSimErrorMessage(
        '{"error": {"code": "UNAUTHORIZED", "message": "API key required"}}',
        FALLBACK,
      ),
    ).toBe('API key required (UNAUTHORIZED)')
  })

  it('falls back to the code when the v2 envelope has no message', () => {
    expect(
      parseSimErrorMessage('{"error": {"code": "UNAUTHORIZED"}}', FALLBACK),
    ).toBe('UNAUTHORIZED')
  })

  it('falls back for non-JSON bodies', () => {
    expect(parseSimErrorMessage('<html>Bad Gateway</html>', FALLBACK)).toBe(
      FALLBACK,
    )
  })

  it('falls back for JSON without a usable error', () => {
    expect(parseSimErrorMessage('{"error": null}', FALLBACK)).toBe(FALLBACK)
    expect(parseSimErrorMessage('{"error": {"nested": true}}', FALLBACK)).toBe(
      FALLBACK,
    )
    expect(parseSimErrorMessage('{}', FALLBACK)).toBe(FALLBACK)
  })
})

describe('simUpstreamErrorResponse', () => {
  it('never reflects an upstream auth failure as our own 401/403', () => {
    expect(simUpstreamErrorResponse(401).status).toBe(502)
    expect(simUpstreamErrorResponse(403).status).toBe(502)
    expect(simUpstreamErrorResponse(401).error).toMatch(/rejected the API key/i)
  })

  it('passes rate limiting through, since the caller should back off', () => {
    expect(simUpstreamErrorResponse(429)).toMatchObject({ status: 429 })
  })

  it('maps anything else to 502', () => {
    expect(simUpstreamErrorResponse(404).status).toBe(502)
    expect(simUpstreamErrorResponse(500).status).toBe(502)
    expect(simUpstreamErrorResponse(500).error).toMatch(/500/)
  })
})

describe('extractInputFields', () => {
  it('unwraps the data envelope', () => {
    expect(extractInputFields({ data: { inputs: [{ name: 'a' }] } })).toEqual([
      { name: 'a', type: 'string', description: undefined },
    ])
  })

  it('returns [] when inputs are absent', () => {
    expect(extractInputFields({ data: {} })).toEqual([])
  })
})

describe('assertWorkflowInWorkspace', () => {
  beforeEach(() => {
    clearWorkspaceMembershipCache()
  })

  function check(workflowId: string) {
    return assertWorkflowInWorkspace({
      simBaseUrl: BASE,
      apiKey: 'k',
      workspaceId: 'ws-1',
      workflowId,
    })
  }

  it('authorizes a workflow the workspace listing contains', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      listResponse([
        { id: 'wf-1', name: 'One' },
        { id: 'wf-2', name: 'Two' },
      ]),
    )

    await expect(check('wf-2')).resolves.toBe(true)
  })

  it('refuses a workflow outside the listing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      listResponse([{ id: 'wf-1', name: 'One' }]),
    )

    await expect(check('wf-other')).resolves.toBe(false)
  })

  it('scopes the listing to the project workspace and deployed workflows', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(listResponse([{ id: 'wf-1', name: 'One' }]))

    await check('wf-1')

    const [url] = fetchSpy.mock.calls[0] as [string]
    expect(url).toContain('workspaceId=ws-1')
    expect(url).toContain('deployedOnly=true')
  })

  it('answers repeat checks from one listing, including refusals', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(listResponse([{ id: 'wf-1', name: 'One' }]))

    await expect(check('wf-1')).resolves.toBe(true)
    // A caller guessing ids must not be able to drive one upstream request per
    // attempt, so a miss is answered from the same cached listing.
    await expect(check('nope-1')).resolves.toBe(false)
    await expect(check('nope-2')).resolves.toBe(false)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('is already warm after discovery, so the check costs no extra request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(listResponse([{ id: 'wf-1', name: 'One' }]))
      .mockResolvedValueOnce(detailResponse([]))

    await discoverSimWorkflows({
      simBaseUrl: BASE,
      apiKey: 'k',
      workspaceId: 'ws-1',
    })
    const callsAfterDiscovery = fetchSpy.mock.calls.length

    await expect(check('wf-1')).resolves.toBe(true)
    await expect(check('wf-nope')).resolves.toBe(false)

    expect(fetchSpy.mock.calls.length).toBe(callsAfterDiscovery)
  })

  it('propagates an upstream listing failure rather than refusing silently', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 401 }),
    )

    // A refusal here would read as "this workflow is not yours"; the caller
    // needs to know Sim rejected the key instead.
    await expect(check('wf-1')).rejects.toBeInstanceOf(SimListError)
  })
})

describe('parseSimErrorMessage v2 envelope without a code', () => {
  it('returns the bare message when the envelope carries no string code', () => {
    expect(
      parseSimErrorMessage(
        '{"error": {"message": "Workflow not deployed"}}',
        'x',
      ),
    ).toBe('Workflow not deployed')
    expect(
      parseSimErrorMessage(
        '{"error": {"code": 42, "message": "Workflow not deployed"}}',
        'x',
      ),
    ).toBe('Workflow not deployed')
  })
})

describe('discoverSimWorkflows detail failures that are not Errors', () => {
  afterEach(() => {
    clearWorkspaceMembershipCache()
  })

  it('stringifies a non-Error rejection into the failure reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) =>
      url.includes('/workflows/w1')
        ? Promise.reject('kaput')
        : Promise.resolve(listResponse([{ id: 'w1', name: 'Odd' }]))) as any)

    const { workflows, failed } = await discover()

    expect(workflows).toEqual([])
    expect(failed).toEqual([{ id: 'w1', name: 'Odd', reason: 'kaput' }])
  })
})

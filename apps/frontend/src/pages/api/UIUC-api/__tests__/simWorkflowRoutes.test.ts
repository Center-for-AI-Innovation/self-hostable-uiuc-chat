/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  getCourseMetadata: vi.fn(),
  hasCourseAccess: vi.fn(),
  resolveSimCredentials: vi.fn(),
  assertWorkflowInWorkspace: vi.fn(),
  discoverSimWorkflows: vi.fn(),
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (handler: any) => handler,
}))

vi.mock('~/pages/api/authorization', () => ({
  getCourseMetadata: hoisted.getCourseMetadata,
  hasCourseAccess: hoisted.hasCourseAccess,
}))

// The routes never touch the database directly; the credential lookup is
// mocked below. Stub the client so importing simConfig has no side effects.
vi.mock('~/db/dbClient', () => ({ db: {} }))

vi.mock('~/utils/simConfig', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, resolveSimCredentials: hoisted.resolveSimCredentials }
})

vi.mock('~/utils/simDiscovery', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    assertWorkflowInWorkspace: hoisted.assertWorkflowInWorkspace,
    discoverSimWorkflows: hoisted.discoverSimWorkflows,
  }
})

import { SimListError } from '~/utils/simDiscovery'
import getSimWorkflows from '../getSimWorkflows'
import runSimWorkflow from '../runSimWorkflow'

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

const CREDS = {
  ok: true,
  creds: { api_key: 'sk-sim-1', workspace_id: 'ws-1', base_url: null },
}

function runReq(body: Record<string, unknown>, overrides: any = {}) {
  return { method: 'POST', body, user: { email: 'a@b.c' }, ...overrides } as any
}

function listReq(query: Record<string, unknown>, overrides: any = {}) {
  return { method: 'GET', query, user: { email: 'a@b.c' }, ...overrides } as any
}

beforeEach(() => {
  hoisted.getCourseMetadata.mockResolvedValue({ course_owner: 'a@b.c' })
  hoisted.hasCourseAccess.mockReturnValue(true)
  hoisted.resolveSimCredentials.mockResolvedValue(CREDS)
  hoisted.assertWorkflowInWorkspace.mockResolvedValue(true)
  hoisted.discoverSimWorkflows.mockResolvedValue({ workflows: [], failed: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('runSimWorkflow handler', () => {
  const BODY = {
    workflow_id: 'wf-1',
    input: { name: 'Ada' },
    course_name: 'cs101',
  }

  function simOk(body: unknown) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('rejects non-POST methods', async () => {
    const res = makeRes()
    await runSimWorkflow(runReq(BODY, { method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('requires workflow_id and input', async () => {
    for (const body of [
      { input: {}, course_name: 'cs101' },
      { workflow_id: 'wf-1', course_name: 'cs101' },
    ]) {
      const res = makeRes()
      await runSimWorkflow(runReq(body), res)
      expect(res.statusCode).toBe(400)
      expect(res.body.error).toMatch(/workflow_id and input/)
    }
  })

  it('requires course_name', async () => {
    const res = makeRes()
    await runSimWorkflow(runReq({ workflow_id: 'wf-1', input: {} }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/course_name/)
  })

  it('reports an unknown project', async () => {
    hoisted.getCourseMetadata.mockResolvedValue(null)
    const res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(404)
  })

  it('denies callers without project access, and unauthenticated callers', async () => {
    hoisted.hasCourseAccess.mockReturnValue(false)
    let res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(403)

    hoisted.hasCourseAccess.mockReturnValue(true)
    res = makeRes()
    await runSimWorkflow(runReq(BODY, { user: undefined }), res)
    expect(res.statusCode).toBe(403)
    expect(hoisted.resolveSimCredentials).not.toHaveBeenCalled()
  })

  it('maps credential resolution failures to their status', async () => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: false,
      reason: 'not_configured',
    })
    let res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/not configured/)

    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: false,
      reason: 'db_error',
    })
    res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(503)
  })

  it('refuses a stored base URL outside the trusted set', async () => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: true,
      creds: { ...CREDS.creds, base_url: 'https://evil.example.com/' },
    })
    const res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/Invalid Sim base URL/)
    expect(hoisted.assertWorkflowInWorkspace).not.toHaveBeenCalled()
  })

  it('requires a workspace id before checking the workflow', async () => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: true,
      creds: { ...CREDS.creds, workspace_id: null },
    })
    const res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/workspace ID/)
    expect(hoisted.assertWorkflowInWorkspace).not.toHaveBeenCalled()
  })

  it('refuses a workflow outside the project workspace without spending the key', async () => {
    hoisted.assertWorkflowInWorkspace.mockResolvedValue(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toMatch(/not available for this project/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps an upstream listing failure and a generic check failure', async () => {
    hoisted.assertWorkflowInWorkspace.mockRejectedValue(
      new SimListError(401, 'Sim API returned 401'),
    )
    let res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/rejected the API key/)

    hoisted.assertWorkflowInWorkspace.mockRejectedValue(new Error('boom'))
    res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/Could not verify/)
  })

  it('executes the workflow with the project key and strips reserved control fields', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        simOk({ success: true, output: { greeting: 'hi' } }),
      )
    const res = makeRes()
    await runSimWorkflow(
      runReq({
        ...BODY,
        input: { name: 'Ada', stream: true, useDraftState: true },
      }),
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, output: { greeting: 'hi' } })
    expect(hoisted.assertWorkflowInWorkspace).toHaveBeenCalledWith({
      simBaseUrl: 'https://www.sim.ai',
      apiKey: 'sk-sim-1',
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
    })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://www.sim.ai/api/workflows/wf-1/execute')
    expect(init.headers).toMatchObject({ 'X-API-Key': 'sk-sim-1' })
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Ada',
      stream: false,
    })
    expect(console.warn).toHaveBeenCalledWith(
      '[runSimWorkflow] dropped reserved Sim control fields',
      expect.objectContaining({ stripped: ['stream', 'useDraftState'] }),
    )
  })

  it('uses the stored base URL when it is trusted', async () => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: true,
      creds: { ...CREDS.creds, base_url: 'http://localhost:3010/' },
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(simOk({ success: true }))
    const res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(200)
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'http://localhost:3010/api/workflows/wf-1/execute',
    )
  })

  it('forwards Sim execution errors with the parsed message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'NOT_DEPLOYED', message: 'Deploy it' },
        }),
        { status: 400, statusText: 'Bad Request' },
      ),
    )
    const res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Deploy it (NOT_DEPLOYED)' })
  })

  it('reports a timeout as 408', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    )
    const res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(408)
    expect(res.body.error).toMatch(/timed out/)
  })

  it('reports other execution failures as 500, with a fallback for non-Errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNRESET'))
    let res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'ECONNRESET' })

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce('kaput')
    res = makeRes()
    await runSimWorkflow(runReq(BODY), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })
})

describe('getSimWorkflows handler', () => {
  const QUERY = { course_name: 'cs101' }

  it('rejects non-GET methods', async () => {
    const res = makeRes()
    await getSimWorkflows(listReq(QUERY, { method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('requires course_name', async () => {
    const res = makeRes()
    await getSimWorkflows(listReq({}), res)
    expect(res.statusCode).toBe(400)
  })

  it('reports an unknown project and denies callers without access', async () => {
    hoisted.getCourseMetadata.mockResolvedValue(null)
    let res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(404)

    hoisted.getCourseMetadata.mockResolvedValue({ course_owner: 'x' })
    hoisted.hasCourseAccess.mockReturnValue(false)
    res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(403)

    hoisted.hasCourseAccess.mockReturnValue(true)
    res = makeRes()
    await getSimWorkflows(listReq(QUERY, { user: undefined }), res)
    expect(res.statusCode).toBe(403)
  })

  it('answers an unconfigured project with an empty list, not an error', async () => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: false,
      reason: 'not_configured',
    })
    const res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ workflows: [], failed: [] })
    expect(hoisted.discoverSimWorkflows).not.toHaveBeenCalled()
  })

  it('reports a failed credential read rather than an empty list', async () => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: false,
      reason: 'db_error',
    })
    const res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(503)
  })

  it('requires a workspace id and a trusted base URL', async () => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: true,
      creds: { ...CREDS.creds, workspace_id: '' },
    })
    let res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/workspace ID/)

    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: true,
      creds: { ...CREDS.creds, base_url: 'https://evil.example.com' },
    })
    res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/Invalid Sim base URL/)
    expect(hoisted.discoverSimWorkflows).not.toHaveBeenCalled()
  })

  it('returns discovered workflows and logs partial failures', async () => {
    const workflows = [
      { id: 'w1', name: 'Greet', description: 'd', inputFields: [] },
    ]
    const failed = [{ id: 'w2', name: 'Flaky', reason: 'timed out' }]
    hoisted.discoverSimWorkflows.mockResolvedValue({ workflows, failed })
    const res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ workflows, failed })
    expect(hoisted.discoverSimWorkflows).toHaveBeenCalledWith({
      simBaseUrl: 'https://www.sim.ai',
      apiKey: 'sk-sim-1',
      workspaceId: 'ws-1',
    })
    expect(console.error).toHaveBeenCalledWith(
      '[getSimWorkflows] could not describe workflows',
      failed,
    )
  })

  it('reports it when every workflow failed to describe', async () => {
    const failed = [{ id: 'w1', name: 'A', reason: 'x' }]
    hoisted.discoverSimWorkflows.mockResolvedValue({ workflows: [], failed })
    const res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({
      error: 'Could not read input fields for any Sim workflow (1 failed)',
      failed,
    })
  })

  it('maps an upstream listing failure and a generic failure', async () => {
    hoisted.discoverSimWorkflows.mockRejectedValue(
      new SimListError(404, 'Sim API returned 404'),
    )
    let res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/could not find the workspace/)

    hoisted.discoverSimWorkflows.mockRejectedValue('kaput')
    res = makeRes()
    await getSimWorkflows(listReq(QUERY), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to fetch Sim workflows' })
  })
})

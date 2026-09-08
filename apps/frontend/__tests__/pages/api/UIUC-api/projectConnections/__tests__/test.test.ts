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
  res.setHeader = vi.fn()
  return res
}

const auditEntries: any[] = []

function mockTesterAndRepo(opts: {
  qdrant?: () => any
  s3?: () => any
  database?: () => any
  // Stored-mode fixtures: the row returned by getConnectionByProject and the
  // config decryptProjectConfig resolves for its encrypted column.
  row?: any
  decrypted?: any
}) {
  vi.doMock('~/utils/projectConnections/tester', () => ({
    testQdrant: vi.fn(async () => opts.qdrant?.() ?? { ok: true }),
    testS3: vi.fn(async () => opts.s3?.() ?? { ok: true }),
    testDatabase: vi.fn(async () => opts.database?.() ?? { ok: true }),
    testEmbedding: vi.fn(async () => ({ ok: true })),
  }))
  vi.doMock('~/db/projectConnectionsRepo', () => ({
    writeAuditEntry: vi.fn(async (e: any) => {
      auditEntries.push(e)
    }),
    getConnectionByProject: vi.fn(async () => opts.row ?? null),
  }))
  vi.doMock('~/utils/crypto', () => ({
    decryptProjectConfig: vi.fn(async () => opts.decrypted ?? null),
  }))
}

beforeEach(() => {
  auditEntries.length = 0
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock('~/utils/projectConnections/tester')
  vi.doUnmock('~/db/projectConnectionsRepo')
  vi.doUnmock('~/utils/crypto')
})

describe('projectConnections/test handler', () => {
  it('rejects non-POST methods with 405', async () => {
    mockTesterAndRepo({})
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/test')
    const res = makeRes()
    await handler(
      {
        method: 'GET',
        headers: {},
        body: {},
        user: { email: 'admin@example.com' },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST')
  })

  it('returns 400 on invalid body', async () => {
    mockTesterAndRepo({})
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/test')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { kind: 'redis', config: {} }, // unknown discriminant
        user: { email: 'admin@example.com' },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
  })

  it('success path: 200 ok + audit success + project_name null', async () => {
    mockTesterAndRepo({ qdrant: () => ({ ok: true }) })
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/test')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          kind: 'qdrant',
          config: {
            url: 'https://qdrant.example.com',
            api_key: 'k',
            port: 6333,
            default_collection: 'c',
          },
        },
        user: { email: 'admin@example.com' },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(auditEntries[0]).toMatchObject({
      action: 'test',
      kind: 'qdrant',
      outcome: 'success',
      project_name: null,
      failure_reason: null,
      changed_fields: null,
    })
  })

  it('failure path: probe returns ok:false → audit failure with code', async () => {
    mockTesterAndRepo({
      qdrant: () => ({
        ok: false,
        code: 'auth',
        message: 'Authentication rejected',
      }),
    })
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/test')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          kind: 'qdrant',
          config: {
            url: 'https://qdrant.example.com',
            api_key: 'wrong',
            port: 6333,
            default_collection: 'c',
          },
        },
        user: { email: 'admin@example.com' },
      } as any,
      res,
    )
    // The endpoint returns 200 with the result body — the probe's failure
    // is not an HTTP error, it's a structured result.
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.code).toBe('auth')
    expect(auditEntries[0]).toMatchObject({
      action: 'test',
      kind: 'qdrant',
      outcome: 'failure',
      failure_reason: 'auth',
      project_name: null,
    })
  })

  it('stored mode: probes the saved config and audits with project_name', async () => {
    mockTesterAndRepo({
      database: () => ({ ok: true }),
      row: { database_config: { encrypted: 'blob' } },
      decrypted: { connection_uri: 'postgres://u:p@h:5432/db' },
    })
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/test')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { kind: 'database', project_name: 'demo' },
        user: { email: 'admin@example.com' },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(auditEntries[0]).toMatchObject({
      action: 'test',
      kind: 'database',
      outcome: 'success',
      project_name: 'demo',
    })
  })

  it('stored mode: no stored config → ok:false not_found, audited', async () => {
    mockTesterAndRepo({ row: null })
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/test')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { kind: 'database', project_name: 'demo' },
        user: { email: 'admin@example.com' },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.code).toBe('not_found')
    expect(auditEntries[0]).toMatchObject({
      action: 'test',
      kind: 'database',
      outcome: 'failure',
      failure_reason: 'not_found',
      project_name: 'demo',
    })
  })

  it('audit never contains the secret config value', async () => {
    mockTesterAndRepo({ s3: () => ({ ok: true }) })
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/test')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          kind: 's3',
          config: {
            aws_access_key_id: 'AKIA',
            aws_secret_access_key: 'super-secret-do-not-leak',
          },
        },
        user: { email: 'admin@example.com' },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(200)
    const serialized = JSON.stringify(auditEntries[0])
    expect(serialized).not.toContain('super-secret-do-not-leak')
    expect(serialized).not.toContain('AKIA')
  })
})

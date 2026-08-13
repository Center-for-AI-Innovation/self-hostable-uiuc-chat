/* @vitest-environment node */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const MASTER_KEY = 'test-master-key-do-not-use-in-prod'

// Helpers --------------------------------------------------------------------

interface Row {
  is_active: boolean
  s3_config: { encrypted: string } | null
  database_config: { encrypted: string } | null
  qdrant_config: { encrypted: string } | null
  embedding_config?: { encrypted: string } | null
}

function makeHostDbStub(rows: Row[]) {
  // drizzle's chain: db.select().from(table).where(...).limit(1)
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return {
    db: { select, query: { docGroups: { findMany: vi.fn() } } },
    select,
    from,
    where,
    limit,
  }
}

async function encryptJson(obj: unknown) {
  const { encrypt } = await import('../crypto')
  const ct = await encrypt(JSON.stringify(obj), MASTER_KEY)
  return { encrypted: ct as string }
}

function setupRedisFake() {
  const store = new Map()
  const redisFake = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
      return 'OK'
    }),
    del: vi.fn(async (k: string) => {
      const had = store.delete(k)
      return had ? 1 : 0
    }),
    isOpen: true,
  }
  vi.doMock('~/utils/redisClient', () => ({
    ensureRedisConnected: vi.fn(async () => redisFake),
  }))
  return { store, redisFake }
}

beforeEach(() => {
  // The manager is cached on globalThis (survives vi.resetModules()); drop it
  // so every test gets a fresh instance wired to that test's mocks.
  delete (
    globalThis as { __illinoisChatConnectionManager?: unknown }
  ).__illinoisChatConnectionManager
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY)
  vi.stubEnv('S3_BUCKET_NAME', 'default-bucket')
  vi.stubEnv('AWS_REGION', 'us-east-2')
  vi.stubEnv('QDRANT_COLLECTION_NAME', 'default-collection')
  vi.stubEnv('QDRANT_URL', 'http://qdrant.local:6333')
  vi.stubEnv('QDRANT_API_KEY', 'default-qkey')
})

afterEach(() => {
  vi.doUnmock('~/db/dbClient')
  vi.doUnmock('~/utils/s3Client')
  vi.doUnmock('~/utils/qdrantClient')
  vi.doUnmock('~/utils/redisClient')
  vi.doUnmock('@aws-sdk/client-s3')
  vi.doUnmock('@qdrant/js-client-rest')
  vi.doUnmock('postgres')
  vi.doUnmock('drizzle-orm/postgres-js')
})

// Tests ----------------------------------------------------------------------

describe('ConnectionManager — defaults (no row)', () => {
  it('getS3Client returns the default singleton + env bucket when no row exists', async () => {
    const hostDb = makeHostDbStub([])
    vi.doMock('~/db/dbClient', () => ({ db: hostDb.db }))
    const defaultS3 = { kind: 'default-s3' }
    vi.doMock('~/utils/s3Client', () => ({ s3Client: defaultS3 }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: { kind: 'default-q' } }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getS3Client('cs101')
    expect(got.client).toBe(defaultS3)
    expect(got.bucket).toBe('default-bucket')
  })

  it('resolveVectorEngine returns pgvector when no row exists', async () => {
    vi.doMock('~/db/dbClient', () => ({ db: makeHostDbStub([]).db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.resolveVectorEngine('cs101')
    expect(got.kind).toBe('pgvector')
  })

  it('resolveVectorEngine ignores VECTOR_ENGINE=qdrant (no shared fallback)', async () => {
    vi.doMock('~/db/dbClient', () => ({ db: makeHostDbStub([]).db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.stubEnv('VECTOR_ENGINE', 'qdrant')
    vi.stubEnv('QDRANT_URL', 'http://qdrant.local:6333')
    vi.stubEnv('QDRANT_API_KEY', 'shared-key')
    vi.stubEnv('QDRANT_COLLECTION_NAME', 'shared-coll')
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.resolveVectorEngine('cs101')
    expect(got.kind).toBe('pgvector')
  })

  it('getDocumentsDb returns the host db when no row exists', async () => {
    const hostStub = makeHostDbStub([])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    const docsDb = await connectionManager.getDocumentsDb('cs101')
    expect(docsDb).toBe(hostStub.db)
  })

  it('falls back to defaults when row exists but is_active=false', async () => {
    const s3OverrideField = await encryptJson({
      aws_access_key_id: 'AKIA',
      aws_secret_access_key: 'sek',
      bucket_name: 'override-bucket',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: false,
        s3_config: s3OverrideField,
        database_config: null,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    const defaultS3 = { kind: 'default-s3' }
    vi.doMock('~/utils/s3Client', () => ({ s3Client: defaultS3 }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getS3Client('inactive-proj')
    expect(got.client).toBe(defaultS3)
    expect(got.bucket).toBe('default-bucket')
  })
})

describe('ConnectionManager — overrides', () => {
  it('builds an S3 client from a project s3_config row', async () => {
    const s3OverrideField = await encryptJson({
      aws_access_key_id: 'AKIA-OVERRIDE',
      aws_secret_access_key: 'sek-override',
      bucket_name: 'override-bucket',
      endpoint_url: 'https://minio.example.com',
      region: 'eu-west-1',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: s3OverrideField,
        database_config: null,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const ctor = vi.fn()
    vi.doMock('@aws-sdk/client-s3', () => ({ S3Client: ctor }))

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getS3Client('override-proj')
    expect(got.bucket).toBe('override-bucket')
    expect(got.endpoint).toBe('https://minio.example.com')
    expect(got.region).toBe('eu-west-1')
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'eu-west-1',
        endpoint: 'https://minio.example.com',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'AKIA-OVERRIDE',
          secretAccessKey: 'sek-override',
        },
      }),
    )
  })

  it("defaults s3 region to 'us-east-1' when override omits it", async () => {
    const s3Field = await encryptJson({
      aws_access_key_id: 'k',
      aws_secret_access_key: 's',
      bucket_name: 'b',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: s3Field,
        database_config: null,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()
    const ctor = vi.fn()
    vi.doMock('@aws-sdk/client-s3', () => ({ S3Client: ctor }))

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getS3Client('p')
    expect(got.region).toBe('us-east-1')
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'us-east-1' }),
    )
  })

  it('builds a Qdrant client from a project qdrant_config row', async () => {
    const qField = await encryptJson({
      url: 'https://qdrant.override.com:6333',
      api_key: 'override-qkey',
      default_collection: 'override-coll',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: null,
        qdrant_config: qField,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()
    const ctor = vi.fn()
    vi.doMock('@qdrant/js-client-rest', () => ({ QdrantClient: ctor }))

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getQdrantClient('p')
    expect(got.collection).toBe('override-coll')
    expect(ctor).toHaveBeenCalledWith({
      url: 'https://qdrant.override.com:6333',
      apiKey: 'override-qkey',
    })
  })

  it('resolveVectorEngine returns pgvector when only database_config is set (embeddings follow docs db)', async () => {
    const dbField = await encryptJson({
      connection_uri: 'postgres://u:p@host:5432/db',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: dbField,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    setupRedisFake()

    const pgFn = vi.fn(() => ({ end: vi.fn() }))
    vi.doMock('postgres', () => ({ default: pgFn }))
    const perProjectDrizzle = { kind: 'per-project-drizzle' }
    vi.doMock('drizzle-orm/postgres-js', () => ({
      drizzle: vi.fn(() => perProjectDrizzle),
    }))

    const { connectionManager } = await import('../connectionManager')
    const engine = await connectionManager.resolveVectorEngine('p')
    expect(engine.kind).toBe('pgvector')

    const docsDb = await connectionManager.getDocumentsDb('p')
    expect(docsDb).toBe(perProjectDrizzle)
    expect(docsDb).not.toBe(hostStub.db)
  })

  it('builds a documents drizzle instance from a database_config row', async () => {
    const dbField = await encryptJson({
      connection_uri: 'postgres://u:p@host:5432/db',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: dbField,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const pgEnd = vi.fn()
    const pgFn = vi.fn(() => ({ end: pgEnd }))
    vi.doMock('postgres', () => ({ default: pgFn }))
    const drizzleFn = vi.fn(() => ({ kind: 'external-drizzle' }))
    vi.doMock('drizzle-orm/postgres-js', () => ({ drizzle: drizzleFn }))

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getDocumentsDb('p')
    expect(pgFn).toHaveBeenCalledWith(
      'postgres://u:p@host:5432/db',
      expect.objectContaining({ max: 3, idle_timeout: 20, prepare: false }),
    )
    expect(got).toEqual({ kind: 'external-drizzle' })
  })
})

describe('ConnectionManager — caching and invalidation', () => {
  it('caches the resolved config after the first lookup', async () => {
    const hostStub = makeHostDbStub([])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    await connectionManager.getS3Client('p1')
    await connectionManager.getS3Client('p1')
    await connectionManager.getS3Client('p1')
    expect(hostStub.select).toHaveBeenCalledTimes(1)
  })

  it('serves the second project independently', async () => {
    const hostStub = makeHostDbStub([])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    await connectionManager.getS3Client('p1')
    await connectionManager.getS3Client('p2')
    expect(hostStub.select).toHaveBeenCalledTimes(2)
  })

  it('invalidate() drops in-process + Redis cache and disposes pg pool', async () => {
    const dbField = await encryptJson({
      connection_uri: 'postgres://u:p@host:5432/db',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: dbField,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    const { redisFake } = setupRedisFake()

    const pgEnd = vi.fn()
    const pgFn = vi.fn(() => ({ end: pgEnd }))
    vi.doMock('postgres', () => ({ default: pgFn }))
    vi.doMock('drizzle-orm/postgres-js', () => ({
      drizzle: vi.fn(() => ({ kind: 'external' })),
    }))

    const { connectionManager } = await import('../connectionManager')
    await connectionManager.getDocumentsDb('p')
    await connectionManager.invalidate('p')
    expect(redisFake.del).toHaveBeenCalledWith('pec:config:p')
    expect(pgEnd).toHaveBeenCalled()

    // Next call hits the host DB again
    await connectionManager.getDocumentsDb('p')
    expect(hostStub.select).toHaveBeenCalledTimes(2)
  })

  it('disposes a TTL-expired external pool after the grace period', async () => {
    const dbField = await encryptJson({
      connection_uri: 'postgres://u:p@host:5432/db',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: dbField,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    // Each postgres() call yields a distinct pool whose end() resolves (the
    // disposal path chains .catch() on it).
    const pools: Array<{ end: ReturnType<typeof vi.fn> }> = []
    const pgFn = vi.fn(() => {
      const pool = { end: vi.fn().mockResolvedValue(undefined) }
      pools.push(pool)
      return pool
    })
    vi.doMock('postgres', () => ({ default: pgFn }))
    vi.doMock('drizzle-orm/postgres-js', () => ({
      drizzle: vi.fn(() => ({ kind: 'external' })),
    }))

    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    try {
      const { connectionManager, DISPOSE_GRACE_MS } = await import(
        '../connectionManager'
      )
      await connectionManager.getDocumentsDb('p')
      expect(pgFn).toHaveBeenCalledTimes(1)

      // Past the 30-min client TTL (also expires the 5-min config cache).
      vi.setSystemTime(Date.now() + 31 * 60 * 1000)
      await connectionManager.getDocumentsDb('p')
      expect(pgFn).toHaveBeenCalledTimes(2)

      // The replaced pool is disposed only after the grace period elapses.
      expect(pools[0]!.end).not.toHaveBeenCalled()
      vi.advanceTimersByTime(DISPOSE_GRACE_MS + 1)
      expect(pools[0]!.end).toHaveBeenCalledWith({ timeout: 5 })
      expect(pools[1]!.end).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ConnectionManager — getEmbeddingClient', () => {
  it('returns env-default openai client when no row exists', async () => {
    vi.doMock('~/db/dbClient', () => ({ db: makeHostDbStub([]).db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    setupRedisFake()
    vi.stubEnv('OPENAI_API_KEY', 'sk-env')
    vi.stubEnv('EMBEDDING_API_BASE', 'https://env.example/v1')
    vi.stubEnv('EMBEDDING_MODEL', 'text-embedding-3-small')

    const openaiCtor = vi.fn()
    vi.doMock('openai', () => ({
      default: class {
        constructor(opts: unknown) {
          openaiCtor(opts)
        }
      },
    }))

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getEmbeddingClient('cs101')
    expect(got.kind).toBe('openai')
    if (got.kind === 'openai') {
      expect(got.model).toBe('text-embedding-3-small')
      expect(got.applyQwenInstruction).toBe(false)
    }
    expect(openaiCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-env',
        baseURL: 'https://env.example/v1',
      }),
    )
  })

  it('returns an OpenAI client built from the row when embedding_config.provider="openai"', async () => {
    const embeddingField = await encryptJson({
      provider: 'openai',
      model: 'voyage-3',
      api_key: 'sk-row',
      api_base: 'https://row.example/v1',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: null,
        qdrant_config: null,
        embedding_config: embeddingField,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    setupRedisFake()

    const openaiCtor = vi.fn()
    vi.doMock('openai', () => ({
      default: class {
        constructor(opts: unknown) {
          openaiCtor(opts)
        }
      },
    }))

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getEmbeddingClient('p')
    expect(got.kind).toBe('openai')
    if (got.kind === 'openai') expect(got.model).toBe('voyage-3')
    expect(openaiCtor).toHaveBeenCalledWith({
      apiKey: 'sk-row',
      baseURL: 'https://row.example/v1',
    })
  })

  it('returns ollama discriminant when embedding_config.provider="ollama" with base_url', async () => {
    const embeddingField = await encryptJson({
      provider: 'ollama',
      model: 'nomic-embed-text',
      base_url: 'http://ollama.row',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: null,
        qdrant_config: null,
        embedding_config: embeddingField,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    setupRedisFake()
    vi.doMock('openai', () => ({ default: class {} }))

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getEmbeddingClient('p')
    expect(got.kind).toBe('ollama')
    if (got.kind === 'ollama') {
      expect(got.baseUrl).toBe('http://ollama.row')
      expect(got.model).toBe('nomic-embed-text')
    }
  })

  it('falls back to OLLAMA_SERVER_URL when row.base_url is missing', async () => {
    const embeddingField = await encryptJson({
      provider: 'ollama',
      model: 'nomic-embed-text',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: null,
        qdrant_config: null,
        embedding_config: embeddingField,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    setupRedisFake()
    vi.doMock('openai', () => ({ default: class {} }))
    vi.stubEnv('OLLAMA_SERVER_URL', 'http://env-ollama:11434')

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getEmbeddingClient('p')
    expect(got.kind).toBe('ollama')
    if (got.kind === 'ollama') {
      expect(got.baseUrl).toBe('http://env-ollama:11434')
    }
  })

  it("throws when provider='ollama' has no base_url and no env fallback (same message-shape as backend)", async () => {
    const embeddingField = await encryptJson({
      provider: 'ollama',
      model: 'nomic-embed-text',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: null,
        qdrant_config: null,
        embedding_config: embeddingField,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    setupRedisFake()
    vi.doMock('openai', () => ({ default: class {} }))
    // No OLLAMA_BASE_URL / OLLAMA_SERVER_URL — assert vi.stubEnv unset state.
    vi.stubEnv('OLLAMA_BASE_URL', '')
    vi.stubEnv('OLLAMA_SERVER_URL', '')

    const { connectionManager } = await import('../connectionManager')
    await expect(connectionManager.getEmbeddingClient('p')).rejects.toThrow(
      /provider='ollama' requires base_url/,
    )
  })
})

describe('ConnectionManager — preserved lock test', () => {
  it('coalesces concurrent lookups into a single DB read (lock)', async () => {
    let resolveLimit: (rows: Row[]) => void
    const limitPromise = new Promise((r) => {
      resolveLimit = r
    })
    const limit = vi.fn().mockReturnValue(limitPromise)
    const where = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ where }))
    const select = vi.fn(() => ({ from }))
    vi.doMock('~/db/dbClient', () => ({
      db: { select, query: {} },
    }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    const a = connectionManager.getS3Client('p')
    const b = connectionManager.getS3Client('p')
    const c = connectionManager.getS3Client('p')
    resolveLimit!([])
    await Promise.all([a, b, c])
    expect(select).toHaveBeenCalledTimes(1)
  })
})

describe('ConnectionManager — error and degraded paths', () => {
  it('getHostDb exposes the host drizzle instance', async () => {
    const hostStub = makeHostDbStub([])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    expect(connectionManager.getHostDb()).toBe(hostStub.db)
  })

  it('resolveVectorEngine returns the qdrant client when qdrant_config is set', async () => {
    const qField = await encryptJson({
      url: 'https://qdrant.example.com',
      api_key: 'qkey',
      default_collection: 'proj-coll',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: null,
        qdrant_config: qField,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    const qdrantCtor = vi.fn(function (this: any) {
      this.kind = 'project-qdrant'
    })
    vi.doMock('@qdrant/js-client-rest', () => ({ QdrantClient: qdrantCtor }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.resolveVectorEngine('p')
    expect(got.kind).toBe('qdrant')
    expect(got).toMatchObject({ collection: 'proj-coll' })
    expect(qdrantCtor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'qkey' }),
    )
  })

  it('throws when a project has no S3 override and no default client is configured', async () => {
    vi.doMock('~/db/dbClient', () => ({ db: makeHostDbStub([]).db }))
    // AWS_REGION/KEY/SECRET unset in the deployment → s3Client is undefined.
    vi.doMock('~/utils/s3Client', () => ({ s3Client: undefined }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    await expect(connectionManager.getS3Client('p')).rejects.toThrow(
      /default S3 client is not configured/,
    )
  })

  it('getQdrantClient throws when the project has no qdrant_config', async () => {
    // Callers must route through resolveVectorEngine(); reaching here means
    // a pgvector project was handed to the Qdrant path.
    vi.doMock('~/db/dbClient', () => ({ db: makeHostDbStub([]).db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    await expect(connectionManager.getQdrantClient('p')).rejects.toThrow(
      /use resolveVectorEngine\(\)/,
    )
  })

  it('throws when the qdrant override has no collection and no env default', async () => {
    const qField = await encryptJson({
      url: 'https://qdrant.example.com',
      api_key: 'qkey',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: null,
        qdrant_config: qField,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    vi.doMock('@qdrant/js-client-rest', () => ({ QdrantClient: vi.fn() }))
    vi.stubEnv('QDRANT_COLLECTION_NAME', '')
    setupRedisFake()

    const { connectionManager } = await import('../connectionManager')
    await expect(connectionManager.getQdrantClient('p')).rejects.toThrow(
      /no default_collection/,
    )
  })

  it('serves a cached config straight from Redis without touching the host DB', async () => {
    const hostStub = makeHostDbStub([])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: { kind: 'default' } }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    const { store } = setupRedisFake()
    store.set(
      'pec:config:p',
      JSON.stringify({ s3: null, pg: null, qdrant: null, embedding: null }),
    )

    const { connectionManager } = await import('../connectionManager')
    const got = await connectionManager.getS3Client('p')
    expect(got.bucket).toBe('default-bucket')
    expect(hostStub.select).not.toHaveBeenCalled()
  })

  it('continues with the in-process cache when the Redis write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.doMock('~/db/dbClient', () => ({ db: makeHostDbStub([]).db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    vi.doMock('~/utils/redisClient', () => ({
      ensureRedisConnected: vi.fn(async () => ({
        get: vi.fn(async () => null),
        set: vi.fn(async () => {
          throw new Error('redis write failed')
        }),
        del: vi.fn(async () => 1),
      })),
    }))

    const { connectionManager } = await import('../connectionManager')
    await expect(connectionManager.getS3Client('p')).resolves.toBeTruthy()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis write failed'),
      expect.any(Error),
    )
    warn.mockRestore()
  })

  it('falls through to the host DB when the Redis read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hostStub = makeHostDbStub([])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    vi.doMock('~/utils/redisClient', () => ({
      ensureRedisConnected: vi.fn(async () => {
        throw new Error('redis unreachable')
      }),
    }))

    const { connectionManager } = await import('../connectionManager')
    await expect(connectionManager.getS3Client('p')).resolves.toBeTruthy()
    expect(hostStub.select).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis read failed'),
      expect.any(Error),
    )
    warn.mockRestore()
  })

  it('invalidate() warns but completes when pool disposal and Redis del fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dbField = await encryptJson({
      connection_uri: 'postgres://u:p@host:5432/db',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: dbField,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    vi.doMock('~/utils/redisClient', () => ({
      ensureRedisConnected: vi.fn(async () => ({
        get: vi.fn(async () => null),
        set: vi.fn(async () => 'OK'),
        del: vi.fn(async () => {
          throw new Error('redis del failed')
        }),
      })),
    }))
    vi.doMock('postgres', () => ({
      default: vi.fn(() => ({
        end: vi.fn().mockRejectedValue(new Error('pool stuck')),
      })),
    }))
    vi.doMock('drizzle-orm/postgres-js', () => ({
      drizzle: vi.fn(() => ({ kind: 'external' })),
    }))

    const { connectionManager } = await import('../connectionManager')
    await connectionManager.getDocumentsDb('p')

    // Neither failure may propagate: the in-process cache was already dropped.
    await expect(connectionManager.invalidate('p')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to dispose pg pool for p'),
      expect.any(Error),
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('redis invalidation failed for p'),
      expect.any(Error),
    )
    warn.mockRestore()
  })

  it('warns when disposing a TTL-expired pool fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dbField = await encryptJson({
      connection_uri: 'postgres://u:p@host:5432/db',
    })
    const hostStub = makeHostDbStub([
      {
        is_active: true,
        s3_config: null,
        database_config: dbField,
        qdrant_config: null,
      },
    ])
    vi.doMock('~/db/dbClient', () => ({ db: hostStub.db }))
    vi.doMock('~/utils/s3Client', () => ({ s3Client: {} }))
    vi.doMock('~/utils/qdrantClient', () => ({ qdrant: {} }))
    setupRedisFake()

    const pools: Array<{ end: ReturnType<typeof vi.fn> }> = []
    vi.doMock('postgres', () => ({
      default: vi.fn(() => {
        const pool = { end: vi.fn().mockRejectedValue(new Error('stuck')) }
        pools.push(pool)
        return pool
      }),
    }))
    vi.doMock('drizzle-orm/postgres-js', () => ({
      drizzle: vi.fn(() => ({ kind: 'external' })),
    }))

    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    try {
      const { connectionManager, DISPOSE_GRACE_MS } = await import(
        '../connectionManager'
      )
      await connectionManager.getDocumentsDb('p')
      vi.setSystemTime(Date.now() + 31 * 60 * 1000)
      await connectionManager.getDocumentsDb('p')

      vi.advanceTimersByTime(DISPOSE_GRACE_MS + 1)
      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('failed to dispose expired pg pool for p'),
          expect.any(Error),
        ),
      )
    } finally {
      vi.useRealTimers()
      warn.mockRestore()
    }
  })
})

describe('buildQdrantUrl', () => {
  it('returns the URL untouched when no port is configured', async () => {
    const { buildQdrantUrl } = await import('../connectionManager')
    expect(buildQdrantUrl({ url: 'https://qdrant.example.com' } as any)).toBe(
      'https://qdrant.example.com',
    )
  })

  it('grafts the configured port only when the URL lacks one', async () => {
    const { buildQdrantUrl } = await import('../connectionManager')
    expect(
      buildQdrantUrl({ url: 'https://qdrant.example.com', port: 6333 } as any),
    ).toBe('https://qdrant.example.com:6333')
    // An explicit port in the URL wins — matching qdrant-client's
    // `parsed_url.port or port`.
    expect(
      buildQdrantUrl({
        url: 'https://qdrant.example.com:7000',
        port: 6333,
      } as any),
    ).toBe('https://qdrant.example.com:7000')
  })

  it('falls back to the raw string when the URL will not parse', async () => {
    const { buildQdrantUrl } = await import('../connectionManager')
    expect(buildQdrantUrl({ url: 'not a url', port: 6333 } as any)).toBe(
      'not a url',
    )
  })
})

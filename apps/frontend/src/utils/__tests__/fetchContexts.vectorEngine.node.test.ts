/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  fetchContextsViaDrizzleVectorSearch: vi.fn(),
  getBackendUrl: vi.fn(() => 'https://backend.example'),
  resolveVectorEngine: vi.fn(),
}))

vi.mock('~/server/fetchContextsForVectorSearch', () => ({
  fetchContextsViaDrizzleVectorSearch:
    hoisted.fetchContextsViaDrizzleVectorSearch,
}))

vi.mock('~/utils/apiUtils', () => ({
  getBackendUrl: hoisted.getBackendUrl,
}))

vi.mock('~/utils/connectionManager', () => ({
  connectionManager: {
    resolveVectorEngine: hoisted.resolveVectorEngine,
  },
}))

import {
  fetchContexts,
  fetchContextsByVectorEngine,
} from '~/utils/fetchContexts'

describe('fetchContextsByVectorEngine / per-project engine routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.resolveVectorEngine.mockResolvedValue({ kind: 'pgvector' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to Drizzle/pgvector when the project has no qdrant_config', async () => {
    const data = [{ id: 1 }]
    hoisted.fetchContextsViaDrizzleVectorSearch.mockResolvedValueOnce(data)

    const result = await fetchContextsByVectorEngine(
      'cardiology',
      'FAI cutoff',
      4000,
      [],
      undefined,
      100,
    )

    expect(hoisted.resolveVectorEngine).toHaveBeenCalledWith('cardiology')
    expect(hoisted.fetchContextsViaDrizzleVectorSearch).toHaveBeenCalledWith(
      'cardiology',
      'FAI cutoff',
      [],
      undefined,
      100,
    )
    expect(result).toEqual(data)
  })

  it('calls the Python backend when the project resolves to Qdrant', async () => {
    hoisted.resolveVectorEngine.mockResolvedValueOnce({
      kind: 'qdrant',
      client: {},
      collection: 'proj-collection',
    })
    const data = [{ id: 2 }]
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(data), { status: 200 }),
      )

    const result = await fetchContextsByVectorEngine(
      'cardiology',
      'FAI cutoff',
      4000,
      ['g1'],
      'conv-1',
      50,
    )

    expect(hoisted.fetchContextsViaDrizzleVectorSearch).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example/getTopContexts',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual(data)
  })

  it('falls back to Drizzle/pgvector when engine resolution fails', async () => {
    hoisted.resolveVectorEngine.mockRejectedValueOnce(
      new Error('host db unreachable'),
    )
    const data = [{ id: 4 }]
    hoisted.fetchContextsViaDrizzleVectorSearch.mockResolvedValueOnce(data)

    const result = await fetchContextsByVectorEngine('cardiology', 'FAI cutoff')

    expect(hoisted.fetchContextsViaDrizzleVectorSearch).toHaveBeenCalled()
    expect(result).toEqual(data)
  })

  it('server-side fetchContexts uses per-project routing (pgvector by default)', async () => {
    const data = [{ id: 3 }]
    hoisted.fetchContextsViaDrizzleVectorSearch.mockResolvedValueOnce(data)

    const result = await fetchContexts('cardiology', 'query', 4000, [], 'c1')

    expect(hoisted.fetchContextsViaDrizzleVectorSearch).toHaveBeenCalled()
    expect(result).toEqual(data)
  })
})

/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchIngestStatus, type IngestStatusDoc } from '../ingestStatusClient'
import { MAX_FILTER_ITEMS } from '../ingestStatusFilters'

const doc = (name: string): IngestStatusDoc => ({
  readable_filename: name,
  base_url: '',
  url: `https://example.com/${name}`,
})

const okResponse = (documents?: IngestStatusDoc[]) =>
  ({
    ok: true,
    json: async () => (documents === undefined ? {} : { documents }),
  }) as unknown as Response

const errorResponse = () =>
  ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response

const fetchMock = vi.fn<typeof fetch>()

const requestBodies = () =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))

const requestEndpoints = () => fetchMock.mock.calls.map(([url]) => String(url))

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchIngestStatus', () => {
  it('returns null without calling fetch when no filters are provided', async () => {
    expect(await fetchIngestStatus('course', {})).toBeNull()
    expect(
      await fetchIngestStatus('course', { filenames: [], base_urls: [] }),
    ).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops empty filter entries and returns null when nothing remains', async () => {
    expect(
      await fetchIngestStatus('course', { filenames: [''], base_urls: [''] }),
    ).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts filenames and base_urls in separate bodies, in-progress before completed', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse([doc('a.pdf')]))
      .mockResolvedValueOnce(okResponse([doc('b.pdf')]))
      .mockResolvedValueOnce(okResponse([]))
      .mockResolvedValueOnce(okResponse([doc('site')]))

    const result = await fetchIngestStatus('course', {
      filenames: ['a.pdf', '', 'b.pdf'],
      base_urls: ['https://example.com', ''],
    })

    expect(result).toEqual({
      inProgress: [doc('a.pdf')],
      completed: [doc('b.pdf'), doc('site')],
    })

    expect(requestEndpoints()).toEqual([
      '/api/materialsTable/docsInProgress',
      '/api/materialsTable/successDocs',
      '/api/materialsTable/docsInProgress',
      '/api/materialsTable/successDocs',
    ])
    expect(requestBodies()).toEqual([
      { course_name: 'course', filenames: ['a.pdf', 'b.pdf'] },
      { course_name: 'course', filenames: ['a.pdf', 'b.pdf'] },
      { course_name: 'course', base_urls: ['https://example.com'] },
      { course_name: 'course', base_urls: ['https://example.com'] },
    ])
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('chunks oversized filter lists so no request exceeds MAX_FILTER_ITEMS', async () => {
    const filenames = Array.from(
      { length: MAX_FILTER_ITEMS + 1 },
      (_, i) => `file-${i}.pdf`,
    )
    fetchMock.mockResolvedValue(okResponse([]))

    const result = await fetchIngestStatus('course', { filenames })

    expect(result).toEqual({ inProgress: [], completed: [] })
    // Two chunks, each queried for in-progress and completed docs.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const bodies = requestBodies()
    expect(bodies[0].filenames).toHaveLength(MAX_FILTER_ITEMS)
    expect(bodies[2].filenames).toEqual([`file-${MAX_FILTER_ITEMS}.pdf`])
  })

  it('treats a response without a documents array as empty', async () => {
    fetchMock.mockResolvedValue(okResponse(undefined))

    expect(await fetchIngestStatus('course', { filenames: ['a.pdf'] })).toEqual(
      { inProgress: [], completed: [] },
    )
  })

  it('returns null and stops when the in-progress request is not ok', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse())

    expect(
      await fetchIngestStatus('course', { filenames: ['a.pdf'] }),
    ).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when the completed request is not ok', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse([doc('a.pdf')]))
      .mockResolvedValueOnce(errorResponse())

    expect(
      await fetchIngestStatus('course', { filenames: ['a.pdf'] }),
    ).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns null and logs instead of throwing when fetch rejects', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const failure = new Error('network down')
    fetchMock.mockRejectedValueOnce(failure)

    await expect(
      fetchIngestStatus('course', { filenames: ['a.pdf'] }),
    ).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to fetch docsInProgress:',
      failure,
    )
  })

  it('returns null when the response body is not valid JSON', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    } as unknown as Response)

    await expect(
      fetchIngestStatus('course', { base_urls: ['https://example.com'] }),
    ).resolves.toBeNull()
  })
})

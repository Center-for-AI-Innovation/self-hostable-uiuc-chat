import { describe, expect, it } from 'vitest'

import {
  MAX_FILTER_ITEMS,
  parseIngestStatusFilters,
} from '../ingestStatusFilters'

describe('parseIngestStatusFilters', () => {
  it('strips trailing slashes so a user-entered URL matches the stored base_url', () => {
    const parsed = parseIngestStatusFilters({
      course_name: 'CS101',
      base_urls: ['https://a.com/', 'https://b.com///', 'https://c.com'],
    })

    expect(parsed).toEqual({
      course_name: 'CS101',
      filenames: [],
      // Must mirror the routes' rtrim(base_url, '/') — otherwise a crawl
      // entered with a trailing slash never matches its own rows.
      base_urls: ['https://a.com', 'https://b.com', 'https://c.com'],
    })
  })

  it('keeps filenames verbatim, including ones that look like paths', () => {
    const parsed = parseIngestStatusFilters({
      course_name: 'CS101',
      filenames: ['notes/', 'a,b.pdf'],
    })

    expect(parsed).toMatchObject({ filenames: ['notes/', 'a,b.pdf'] })
  })

  it('drops entries that cannot match instead of failing the request', () => {
    expect(
      parseIngestStatusFilters({
        course_name: 'CS101',
        filenames: ['', 'Doc A'],
        base_urls: ['/'],
      }),
    ).toEqual({ course_name: 'CS101', filenames: ['Doc A'], base_urls: [] })
  })

  it('rejects a request whose filters all drop out', () => {
    // Freezing the caller's statuses would be worse, but there is nothing to
    // query, so the client is expected to skip the tick rather than send this.
    expect(
      parseIngestStatusFilters({ course_name: 'CS101', base_urls: ['/'] }),
    ).toEqual({
      error: 'At least one filter (filenames or base_urls) is required',
    })
  })

  it.each([
    ['missing course_name', { filenames: ['a.pdf'] }],
    ['blank course_name', { course_name: '', filenames: ['a.pdf'] }],
    ['non-array filenames', { course_name: 'CS101', filenames: 'a.pdf' }],
    ['non-string entries', { course_name: 'CS101', base_urls: [42] }],
    ['no filters at all', { course_name: 'CS101' }],
  ])('rejects %s', (_label, body) => {
    expect(parseIngestStatusFilters(body)).toHaveProperty('error')
  })

  it('caps the combined filter size', () => {
    const names = Array.from({ length: MAX_FILTER_ITEMS }, (_, i) => `f${i}`)

    expect(
      parseIngestStatusFilters({ course_name: 'CS101', filenames: names }),
    ).not.toHaveProperty('error')

    expect(
      parseIngestStatusFilters({
        course_name: 'CS101',
        filenames: names,
        base_urls: ['https://a.com'],
      }),
    ).toHaveProperty('error')
  })
})

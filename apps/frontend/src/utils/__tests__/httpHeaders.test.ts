import { beforeEach, describe, expect, it, vi } from 'vitest'
import posthog from 'posthog-js'
import { createHeaders } from '../httpHeaders'

describe('createHeaders', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('includes x-user-email when provided', () => {
    expect(createHeaders('user@example.com')).toEqual({
      'Content-Type': 'application/json',
      'x-user-email': 'user@example.com',
    })
  })

  it('falls back to x-posthog-id when available', () => {
    const headers = createHeaders()
    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'x-posthog-id': 'test-posthog-id',
    })
  })

  it('generates an anonymous ID when no email or PostHog ID exists', () => {
    vi.spyOn(posthog as any, 'get_distinct_id').mockReturnValue('')
    expect(createHeaders()).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'x-posthog-id': expect.stringMatching(/^anon_/),
      }),
    )
  })

  it('generates an anonymous ID when PostHog lookup throws', () => {
    vi.spyOn(posthog as any, 'get_distinct_id').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(createHeaders()).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'x-posthog-id': expect.stringMatching(/^anon_/),
      }),
    )
  })
})

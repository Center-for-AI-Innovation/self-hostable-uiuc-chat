import posthog from 'posthog-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrCreateAnonymousUserId } from '../anonymousUserId'

describe('getOrCreateAnonymousUserId', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('prefers the PostHog distinct ID', () => {
    vi.spyOn(posthog, 'get_distinct_id').mockReturnValue('posthog-user')

    expect(getOrCreateAnonymousUserId()).toBe('posthog-user')
    expect(localStorage.getItem('anonymous_user_id')).toBeNull()
  })

  it('generates and persists an ID when PostHog has no ID', () => {
    vi.spyOn(posthog, 'get_distinct_id').mockReturnValue('')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(42))
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((
      array: Uint8Array,
    ) => {
      array.fill(0)
      return array
    }) as typeof globalThis.crypto.getRandomValues)

    expect(getOrCreateAnonymousUserId()).toBe('anon_AAAAAAAAA_42')
    expect(localStorage.getItem('anonymous_user_id')).toBe('anon_AAAAAAAAA_42')

    vi.useRealTimers()
  })

  it('reuses a previously generated anonymous ID', () => {
    vi.spyOn(posthog, 'get_distinct_id').mockReturnValue('')
    localStorage.setItem('anonymous_user_id', 'anon-existing')

    expect(getOrCreateAnonymousUserId()).toBe('anon-existing')
  })

  it('falls back when the PostHog lookup throws', () => {
    vi.spyOn(posthog, 'get_distinct_id').mockImplementation(() => {
      throw new Error('PostHog unavailable')
    })
    localStorage.setItem('anonymous_user_id', 'anon-existing')

    expect(getOrCreateAnonymousUserId()).toBe('anon-existing')
  })

  it('generates an ID when local storage is unavailable', () => {
    vi.spyOn(posthog, 'get_distinct_id').mockReturnValue('')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Local storage unavailable')
    })

    expect(getOrCreateAnonymousUserId()).toMatch(/^anon_/)
  })
})

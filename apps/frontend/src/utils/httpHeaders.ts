import { getOrCreateAnonymousUserId } from '~/utils/anonymousUserId'

export function createHeaders(userEmail?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  // Prefer explicit user email when available
  if (userEmail && userEmail.trim() !== '') {
    headers['x-user-email'] = userEmail
    return headers
  }

  // Use PostHog when available, otherwise use a persisted anonymous ID.
  if (typeof window !== 'undefined') {
    headers['x-posthog-id'] = getOrCreateAnonymousUserId()
  }

  return headers
}

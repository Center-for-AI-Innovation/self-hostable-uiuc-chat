import posthog from 'posthog-js'
import { generateAnonymousUserId } from '~/utils/cryptoRandom'

const ANONYMOUS_USER_ID_STORAGE_KEY = 'anonymous_user_id'

export function getOrCreateAnonymousUserId(): string {
  try {
    const postHogId = posthog.get_distinct_id()
    if (typeof postHogId === 'string' && postHogId.trim() !== '') {
      return postHogId
    }
  } catch {
    // PostHog is optional for anonymous access.
  }

  try {
    const storedId = localStorage.getItem(ANONYMOUS_USER_ID_STORAGE_KEY)
    if (storedId?.trim()) {
      return storedId
    }

    const generatedId = generateAnonymousUserId()
    localStorage.setItem(ANONYMOUS_USER_ID_STORAGE_KEY, generatedId)
    return generatedId
  } catch {
    return generateAnonymousUserId()
  }
}

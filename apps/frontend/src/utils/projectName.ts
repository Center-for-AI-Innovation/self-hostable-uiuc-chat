/**
 * Shared validation and URL helpers for project (chatbot) names.
 *
 * Project names double as the URL path segment for a project's pages
 * (e.g. /<name>/chat) and as exact-match keys in Redis and Postgres, so
 * new names are restricted to URL-safe characters at creation time.
 * Existing projects with other characters keep working: validation only
 * runs on creation, and buildProjectChatPath encodes rather than mangles.
 */

// Dots are allowed except as the first character: buildProjectChatPath
// strips leading dots for traversal safety, so a leading-dot name would
// diverge from its URL segment (the exact bug name validation exists to
// prevent).
export const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/

export const PROJECT_NAME_MAX_LENGTH = 64

export function isValidProjectName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= PROJECT_NAME_MAX_LENGTH &&
    PROJECT_NAME_PATTERN.test(name)
  )
}

export function getProjectNameError(name: string): string | null {
  if (name.length === 0) {
    return null
  }
  if (name.length > PROJECT_NAME_MAX_LENGTH) {
    return `Name must be ${PROJECT_NAME_MAX_LENGTH} characters or fewer.`
  }
  if (!PROJECT_NAME_PATTERN.test(name)) {
    return 'Names can only use letters, numbers, dashes, underscores, and dots (a dot cannot be the first character).'
  }
  return null
}

/**
 * Build a safe relative URL for navigating to a project's chat page.
 * Guards against open-redirect and path-traversal attacks by stripping
 * leading dots/slashes and percent-encoding the segment. Encoding (rather
 * than replacing characters) preserves the stored name — Next.js decodes
 * the segment back to the raw name for [course_name] pages — so projects
 * created before name validation existed still navigate correctly.
 */
export function buildProjectChatPath(name: string): string {
  const raw = String(name || '').trim()
  const segment = raw.replace(/^[./\\]+/, '')
  if (!segment) {
    return '/chat'
  }
  return `/${encodeURIComponent(segment)}/chat`
}

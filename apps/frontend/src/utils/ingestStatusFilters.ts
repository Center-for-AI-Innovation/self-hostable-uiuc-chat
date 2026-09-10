// Shared request validation for the ingest-status polling routes
// (materialsTable/successDocs and materialsTable/docsInProgress).
// These routes are POST-only and REQUIRE at least one filter — there is no
// unfiltered mode, so a large project can never be streamed back wholesale.

export const MAX_FILTER_ITEMS = 1000

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '')

function toStringArray(value: unknown): string[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  return value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

export type IngestStatusFilters = {
  course_name: string
  filenames: string[]
  /** Normalized (trailing slashes stripped) — compare against rtrim(base_url, '/'). */
  base_urls: string[]
}

export function parseIngestStatusFilters(
  body: unknown,
): IngestStatusFilters | { error: string } {
  const { course_name, filenames, base_urls } = (body ?? {}) as Record<
    string,
    unknown
  >

  if (typeof course_name !== 'string' || course_name.length === 0) {
    return { error: 'course_name is required' }
  }

  const parsedFilenames = toStringArray(filenames)
  if (parsedFilenames === null) {
    return { error: 'filenames must be an array of strings' }
  }

  const parsedBaseUrls = toStringArray(base_urls)
  if (parsedBaseUrls === null) {
    return { error: 'base_urls must be an array of strings' }
  }

  // Entries that are empty (or empty once normalized) can't match anything, so
  // drop them rather than failing the whole request — a 400 would freeze the
  // caller's upload statuses.
  const nonEmptyFilenames = parsedFilenames.filter((name) => name.length > 0)
  const normalizedBaseUrls = parsedBaseUrls
    .map(stripTrailingSlashes)
    .filter((url) => url.length > 0)

  if (nonEmptyFilenames.length === 0 && normalizedBaseUrls.length === 0) {
    return {
      error: 'At least one filter (filenames or base_urls) is required',
    }
  }

  // Combined cap. The client chunks each kind separately and never mixes both
  // in one body, so a well-behaved caller can't trip this.
  if (nonEmptyFilenames.length + normalizedBaseUrls.length > MAX_FILTER_ITEMS) {
    return {
      error: `Too many filter items (max ${MAX_FILTER_ITEMS} combined)`,
    }
  }

  return {
    course_name,
    filenames: nonEmptyFilenames,
    base_urls: normalizedBaseUrls,
  }
}

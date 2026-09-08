import { MAX_FILTER_ITEMS } from '~/utils/ingestStatusFilters'

// Client for the POST-only ingest-status routes. Callers send only the
// filenames/base_urls they are tracking; oversized filters are chunked so a
// large folder drop is never silently truncated (a tracked file missing from
// the results would be misread as a failed ingest).

export type IngestStatusDoc = {
  readable_filename: string
  base_url: string
  url: string
}

export type IngestStatus = {
  inProgress: IngestStatusDoc[]
  completed: IngestStatusDoc[]
}

export type IngestStatusFilter = {
  filenames?: string[]
  base_urls?: string[]
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** Returns null on any failure — never throws, so concurrent calls can't
 * leave an unobserved rejection behind. */
async function postStatus(
  endpoint: 'docsInProgress' | 'successDocs',
  body: Record<string, unknown>,
): Promise<IngestStatusDoc[] | null> {
  try {
    const response = await fetch(`/api/materialsTable/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) return null
    const data = await response.json()
    return data?.documents ?? []
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error)
    return null
  }
}

/**
 * Fetch in-progress and completed docs matching the given filters.
 * Returns null if ANY request fails — callers must then skip the whole
 * status update rather than act on partial results.
 */
export async function fetchIngestStatus(
  course_name: string,
  filter: IngestStatusFilter,
): Promise<IngestStatus | null> {
  const filenames = (filter.filenames ?? []).filter((name) => name.length > 0)
  const base_urls = (filter.base_urls ?? []).filter((url) => url.length > 0)

  const bodies: Record<string, unknown>[] = [
    ...chunk(filenames, MAX_FILTER_ITEMS).map((names) => ({
      course_name,
      filenames: names,
    })),
    ...chunk(base_urls, MAX_FILTER_ITEMS).map((urls) => ({
      course_name,
      base_urls: urls,
    })),
  ]
  if (bodies.length === 0) return null

  const inProgress: IngestStatusDoc[] = []
  const completed: IngestStatusDoc[] = []
  // Everything here is sequential on purpose. The endpoints hit a per-project
  // Postgres whose connection pool is what issue #90 was exhausting, so a huge
  // upload should take longer rather than fan out. More importantly, ingest
  // writes the document row BEFORE deleting the in-progress row, so reading
  // in-progress first is what guarantees a document that finishes mid-tick is
  // seen in one list or the other. Reading them concurrently would let a
  // completing document fall through both and be reported as failed.
  for (const body of bodies) {
    const progressDocs = await postStatus('docsInProgress', body)
    if (progressDocs === null) return null
    const completedDocs = await postStatus('successDocs', body)
    if (completedDocs === null) return null
    inProgress.push(...progressDocs)
    completed.push(...completedDocs)
  }
  return { inProgress, completed }
}

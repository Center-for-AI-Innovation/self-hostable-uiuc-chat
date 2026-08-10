import { type ContextWithMetadata } from '~/types/chat'
import { getBackendUrl } from '~/utils/apiUtils'

// Common function to fetch contexts from backend - can be used anywhere
export default async function fetchContextsFromBackend(
  course_name: string,
  search_query: string,
  token_limit = 4000,
  doc_groups: string[] = [],
  conversation_id?: string,
  top_n?: number,
  signal?: AbortSignal,
): Promise<ContextWithMetadata[]> {
  const backendUrl = getBackendUrl()

  const requestBody: Record<string, unknown> = {
    course_name: course_name,
    search_query: search_query,
    token_limit: token_limit,
    doc_groups: doc_groups,
    conversation_id: conversation_id,
  }
  if (top_n !== undefined) requestBody.top_n = top_n

  const response = await fetch(`${backendUrl}/getTopContexts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch contexts. Status: ${response.status}`)
  }

  const data: ContextWithMetadata[] = await response.json()
  return data
}

/**
 * Server-side retrieval routed per project by the ConnectionManager.
 * - Projects with an active `qdrant_config` → Python /getTopContexts (the
 *   backend owns the Qdrant client + multi-collection fan-out).
 * - Everything else → frontend Drizzle + pgvector on whatever documents DB
 *   the project is bound to.
 * If engine resolution fails (e.g. host DB unreachable) we fall back to the
 * local Drizzle path with a warning rather than failing the request.
 *
 * Used by /api/getContexts and agent mode. Server-side only.
 */
export async function fetchContextsByVectorEngine(
  course_name: string,
  search_query: string,
  token_limit = 4000,
  doc_groups: string[] = [],
  conversation_id?: string,
  top_n = 100,
  signal?: AbortSignal,
): Promise<ContextWithMetadata[]> {
  let engineKind: 'qdrant' | 'pgvector' = 'pgvector'
  try {
    const { connectionManager } = await import('~/utils/connectionManager')
    engineKind = (await connectionManager.resolveVectorEngine(course_name)).kind
  } catch (err) {
    console.warn(
      `[fetchContextsByVectorEngine] resolveVectorEngine failed for ${course_name}; defaulting to pgvector:`,
      err,
    )
  }

  if (engineKind === 'qdrant') {
    return fetchContextsFromBackend(
      course_name,
      search_query,
      token_limit,
      doc_groups,
      conversation_id,
      top_n,
      signal,
    )
  }

  const { fetchContextsViaDrizzleVectorSearch } = await import(
    '~/server/fetchContextsForVectorSearch'
  )
  return fetchContextsViaDrizzleVectorSearch(
    course_name,
    search_query,
    doc_groups,
    conversation_id,
    top_n,
  )
}

// Helper function for use in components/utilities
export const fetchContexts = async (
  course_name: string,
  search_query: string,
  token_limit = 4000,
  doc_groups: string[] = [],
  conversation_id?: string,
): Promise<ContextWithMetadata[]> => {
  // Check if we're running on client-side (browser) or server-side
  const isClientSide = typeof window !== 'undefined'

  try {
    if (isClientSide) {
      // Client-side: use our API route
      const response = await fetch(
        `${window.location.origin}/api/getContexts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            course_name,
            search_query,
            token_limit,
            doc_groups,
            conversation_id,
          }),
        },
      )

      if (!response.ok) {
        console.error('Failed to fetch contexts. Err status:', response.status)
        return []
      }

      const data: ContextWithMetadata[] = await response.json()
      return data
    } else {
      // Server-side: dispatch by the project's resolved vector engine
      return await fetchContextsByVectorEngine(
        course_name,
        search_query,
        token_limit,
        doc_groups,
        conversation_id,
      )
    }
  } catch (error) {
    console.error('Error fetching contexts:', error)
    return []
  }
}

// Helper function for backward compatibility
export const fetchMQRContexts = async (
  course_name: string,
  search_query: string,
  token_limit = 6000,
  doc_groups: string[] = [],
  conversation_id: string,
): Promise<ContextWithMetadata[]> => {
  try {
    const params = new URLSearchParams({
      course_name,
      search_query,
      token_limit: token_limit.toString(),
    })

    // Handle doc_groups array
    doc_groups.forEach((group) => params.append('doc_groups', group))

    params.append('conversation_id', conversation_id)

    const response = await fetch(`/api/getContextsMQR?${params.toString()}`)

    if (!response.ok) {
      console.error(
        'Failed to fetch MQR contexts. Err status:',
        response.status,
      )
      return []
    }

    const data: ContextWithMetadata[] = await response.json()
    return data
  } catch (error) {
    console.error(error)
    return []
  }
}

import { type NextApiResponse } from 'next'
import {
  type SimWorkflow,
  type SimWorkflowListItem,
  type SimInputField,
} from '~/types/sim'
import {
  resolveSimCredentials,
  simConfigErrorResponse,
  SIM_DEFAULT_BASE_URL,
  validateSimBaseUrl,
} from '~/utils/simConfig'
import { getCourseMetadata, hasCourseAccess } from '~/pages/api/authorization'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'

/**
 * GET /api/UIUC-api/getSimWorkflows?course_name=X[&api_key=...&workspace_id=...]
 *
 * Discovers deployed workflows from SimAI.
 * - NEXT_PUBLIC_SIM_STORAGE=local  → credentials from query params (localStorage)
 * - NEXT_PUBLIC_SIM_STORAGE=supabase → credentials from DB
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { course_name, api_key, workspace_id, base_url } = req.query as {
    course_name?: string
    api_key?: string
    workspace_id?: string
    base_url?: string
  }

  if (!course_name) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const courseMetadata = await getCourseMetadata(course_name)
  if (!courseMetadata) {
    return res.status(404).json({ error: 'Project not found' })
  }

  if (!req.user || !hasCourseAccess(req.user, courseMetadata)) {
    return res.status(403).json({ error: 'Access denied' })
  }

  const resolved = await resolveSimCredentials(course_name, {
    api_key,
    workspace_id,
    base_url,
  })

  if (!resolved.ok) {
    // A project that has never been configured legitimately has no workflows.
    // Anything else is a real failure and must not be reported as "no tools".
    if (resolved.reason === 'not_configured') {
      return res.status(200).json({ workflows: [] })
    }
    const { status, error } = simConfigErrorResponse(resolved.reason)
    return res.status(status).json({ error })
  }

  const creds = resolved.creds

  if (!creds.workspace_id) {
    const { status, error } = simConfigErrorResponse('missing_workspace_id')
    return res.status(status).json({ error })
  }

  const rawBaseUrl = (creds.base_url ?? SIM_DEFAULT_BASE_URL).replace(/\/$/, '')
  const simBaseUrl = validateSimBaseUrl(rawBaseUrl)
  if (!simBaseUrl) {
    return res.status(400).json({ error: 'Invalid Sim base URL' })
  }
  const headers = { 'X-API-Key': creds.api_key }

  try {
    const listUrl = `${simBaseUrl}/api/v1/workflows?workspaceId=${encodeURIComponent(creds.workspace_id)}&deployedOnly=true`
    const listRes = await fetch(listUrl, { headers })

    if (!listRes.ok) {
      console.error('[getSimWorkflows] list failed', { status: listRes.status })
      return res
        .status(listRes.status)
        .json({ error: `Sim API returned ${listRes.status}` })
    }

    const listData = (await listRes.json()) as { data: SimWorkflowListItem[] }
    const items = listData.data ?? []

    if (items.length === 0) {
      return res.status(200).json({ workflows: [] })
    }

    const workflows: SimWorkflow[] = await Promise.all(
      items.map(async (item): Promise<SimWorkflow> => {
        try {
          const detailRes = await fetch(
            `${simBaseUrl}/api/v1/workflows/${item.id}`,
            { headers },
          )
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as Record<string, unknown>
            return {
              id: item.id,
              name: item.name,
              description: item.description ?? '',
              inputFields: extractInputFields(detail),
            }
          }
        } catch (err) {
          console.debug(
            '[getSimWorkflows] detail fetch failed for',
            item.id,
            err,
          )
        }
        return {
          id: item.id,
          name: item.name,
          description: item.description ?? '',
          inputFields: [],
        }
      }),
    )

    console.debug('[getSimWorkflows]', workflows.length, 'workflows discovered')
    return res.status(200).json({ workflows })
  } catch (error: unknown) {
    console.error('[getSimWorkflows] error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return res.status(500).json({ error: 'Failed to fetch Sim workflows' })
  }
}

/**
 * Extract input fields from the workflow detail response.
 * Sim API returns: { data: { inputs: [{ name, type, description }] } }
 */
function extractInputFields(detail: Record<string, unknown>): SimInputField[] {
  // Unwrap the `data` envelope if present
  const inner = (detail.data ?? detail) as Record<string, unknown>

  // `inputs` is a direct array of { name, type, description }
  const inputs = inner.inputs
  if (Array.isArray(inputs)) {
    return inputs.map((f: Record<string, unknown>) => ({
      name: String(f.name ?? ''),
      type: String(f.type ?? 'string'),
      description: f.description ? String(f.description) : undefined,
    }))
  }

  return []
}

export default withAuth(handler)

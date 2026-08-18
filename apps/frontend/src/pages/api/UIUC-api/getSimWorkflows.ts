import { type NextApiResponse } from 'next'
import {
  resolveSimCredentials,
  simConfigErrorResponse,
  SIM_DEFAULT_BASE_URL,
  validateSimBaseUrl,
} from '~/utils/simConfig'
import {
  discoverSimWorkflows,
  SimListError,
  simUpstreamErrorResponse,
} from '~/utils/simDiscovery'
import { getCourseMetadata, hasCourseAccess } from '~/pages/api/authorization'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'

/**
 * GET /api/UIUC-api/getSimWorkflows?course_name=X
 *
 * Discovers deployed workflows from SimAI. Credentials come from the project's
 * stored configuration and never from the caller — see `resolveSimCredentials`.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { course_name } = req.query as {
    course_name?: string
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

  const resolved = await resolveSimCredentials(course_name)

  if (!resolved.ok) {
    // A project that has never been configured legitimately has no workflows.
    // Anything else is a real failure and must not be reported as "no tools".
    if (resolved.reason === 'not_configured') {
      return res.status(200).json({ workflows: [], failed: [] })
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

  try {
    const { workflows, failed } = await discoverSimWorkflows({
      simBaseUrl,
      apiKey: creds.api_key,
      workspaceId: creds.workspace_id,
    })

    if (failed.length > 0) {
      console.error('[getSimWorkflows] could not describe workflows', failed)
    }

    // Every workflow failed to describe: report it rather than returning an
    // empty list, which the caller cannot distinguish from an empty workspace.
    if (workflows.length === 0 && failed.length > 0) {
      return res.status(502).json({
        error: `Could not read input fields for any Sim workflow (${failed.length} failed)`,
        failed,
      })
    }

    console.debug('[getSimWorkflows]', workflows.length, 'workflows discovered')
    return res.status(200).json({ workflows, failed })
  } catch (error: unknown) {
    if (error instanceof SimListError) {
      console.error('[getSimWorkflows] list failed', { status: error.status })
      const mapped = simUpstreamErrorResponse(error.status)
      return res.status(mapped.status).json({ error: mapped.error })
    }
    console.error('[getSimWorkflows] error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return res.status(500).json({ error: 'Failed to fetch Sim workflows' })
  }
}

export default withAuth(handler)

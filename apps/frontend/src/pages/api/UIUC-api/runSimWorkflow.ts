import { type NextApiResponse } from 'next'
import { type SimExecutionResult } from '~/types/sim'
import {
  resolveSimCredentials,
  simConfigErrorResponse,
  SIM_DEFAULT_BASE_URL,
  validateSimBaseUrl,
} from '~/utils/simConfig'
import {
  assertWorkflowInWorkspace,
  SimListError,
  simUpstreamErrorResponse,
} from '~/utils/simDiscovery'
import { getCourseMetadata, hasCourseAccess } from '~/pages/api/authorization'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'

const TIMEOUT_MS = 300_000 // 5 minutes

export const config = { maxDuration: 300 }

/**
 * POST /api/UIUC-api/runSimWorkflow
 * Body: { workflow_id, input, course_name }
 *
 * Credentials come from the project's stored configuration, never the caller,
 * and `workflow_id` is checked against that project's workspace before the
 * project's API key is spent on it.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { workflow_id, input, course_name } = req.body as {
    workflow_id: string
    input: Record<string, unknown>
    course_name?: string
  }

  if (!workflow_id || input === undefined) {
    return res.status(400).json({ error: 'workflow_id and input are required' })
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
    const { status, error } = simConfigErrorResponse(resolved.reason)
    return res.status(status).json({ error })
  }

  const creds = resolved.creds

  const rawBaseUrl = (creds.base_url ?? SIM_DEFAULT_BASE_URL).replace(/\/$/, '')
  const simBaseUrl = validateSimBaseUrl(rawBaseUrl)
  if (!simBaseUrl) {
    return res.status(400).json({ error: 'Invalid Sim base URL' })
  }
  if (!creds.workspace_id) {
    const { status, error } = simConfigErrorResponse('missing_workspace_id')
    return res.status(status).json({ error })
  }

  // Authorize before spending the project's key. Discovery only ever advertises
  // this workspace's deployed workflows, so an id from anywhere else was not
  // offered to the model and must not be run just because the caller can reach
  // this route.
  try {
    const allowed = await assertWorkflowInWorkspace({
      simBaseUrl,
      apiKey: creds.api_key,
      workspaceId: creds.workspace_id,
      workflowId: workflow_id,
    })
    if (!allowed) {
      console.warn('[runSimWorkflow] workflow outside project workspace', {
        course_name,
        workflow_id,
      })
      return res.status(403).json({
        error: 'This workflow is not available for this project',
      })
    }
  } catch (error: unknown) {
    if (error instanceof SimListError) {
      const mapped = simUpstreamErrorResponse(error.status)
      return res.status(mapped.status).json({ error: mapped.error })
    }
    console.error('[runSimWorkflow] workspace check failed', error)
    return res
      .status(502)
      .json({ error: 'Could not verify the workflow against Sim' })
  }

  const url = `${simBaseUrl}/api/workflows/${encodeURIComponent(workflow_id)}/execute`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const simResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': creds.api_key,
      },
      body: JSON.stringify({ ...input, stream: false }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!simResponse.ok) {
      const errText = await simResponse.text()
      let errMessage = `Sim API returned ${simResponse.status}: ${simResponse.statusText}`
      try {
        const errJson = JSON.parse(errText) as { error?: string }
        if (errJson.error) errMessage = errJson.error
      } catch {
        // non-JSON error body
      }
      console.error('[runSimWorkflow] Sim API error', {
        workflow_id,
        status: simResponse.status,
        message: errMessage,
      })
      return res.status(simResponse.status).json({ error: errMessage })
    }

    const result = (await simResponse.json()) as SimExecutionResult
    console.debug('[runSimWorkflow] success', {
      workflow_id,
      success: result.success,
    })
    return res.status(200).json(result)
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      return res
        .status(408)
        .json({ error: 'Sim workflow timed out after 5 minutes' })
    }
    console.error('[runSimWorkflow] unexpected error', {
      workflow_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}

export default withAuth(handler)

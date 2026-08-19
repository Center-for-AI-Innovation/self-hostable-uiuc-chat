import { eq } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db } from '~/db/dbClient'
import { projects } from '~/db/schema'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'

/**
 * What this route tells the browser about a project's Sim configuration. The
 * API key itself never leaves the server — masking client-side after
 * transmitting the real value would leave it in the response, the React state,
 * and the DOM. The form treats a blank key input as "unchanged", so the real
 * value is never needed for display.
 */
export interface SimConfigResponse {
  has_api_key: boolean
  sim_api_key_masked: string | null
  sim_base_url: string | null
  sim_workspace_id: string | null
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '*'.repeat(key.length)
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
}

const EMPTY_CONFIG: SimConfigResponse = {
  has_api_key: false,
  sim_api_key_masked: null,
  sim_base_url: null,
  sim_workspace_id: null,
}

/**
 * GET /api/UIUC-api/tools/getSimConfig?course_name=X
 */
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const courseName = req.courseName
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const rows = await db
    .select({
      sim_api_key: projects.sim_api_key,
      sim_base_url: projects.sim_base_url,
      sim_workspace_id: projects.sim_workspace_id,
    })
    .from(projects)
    .where(eq(projects.course_name, courseName))
    .limit(1)

  const row = rows[0]
  const config: SimConfigResponse = row
    ? {
        has_api_key: Boolean(row.sim_api_key),
        sim_api_key_masked: row.sim_api_key ? maskKey(row.sim_api_key) : null,
        sim_base_url: row.sim_base_url,
        sim_workspace_id: row.sim_workspace_id,
      }
    : EMPTY_CONFIG

  return res.status(200).json(config)
}

export default withCourseOwnerOrAdminAccess()(handler)

import { eq } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db } from '~/db/dbClient'
import { projects } from '~/db/schema'
import { type SimProjectConfig } from '~/types/sim'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'

const EMPTY_CONFIG: SimProjectConfig = {
  sim_api_key: null,
  sim_base_url: null,
  sim_workspace_id: null,
}

/**
 * GET /api/UIUC-api/tools/getSimConfig?course_name=X
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
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

  const config: SimProjectConfig = rows[0] ?? EMPTY_CONFIG

  return res.status(200).json(config)
}

export default withCourseOwnerOrAdminAccess()(handler)

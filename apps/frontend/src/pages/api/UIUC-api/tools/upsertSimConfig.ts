import { eq } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db } from '~/db/dbClient'
import { projects } from '~/db/schema'
import { type SimProjectConfig } from '~/types/sim'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'

/**
 * POST /api/UIUC-api/tools/upsertSimConfig
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const courseName = req.courseName
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const {
    sim_api_key = null,
    sim_base_url = null,
    sim_workspace_id = null,
  } = req.body as Partial<SimProjectConfig>

  await db
    .update(projects)
    .set({ sim_api_key, sim_base_url, sim_workspace_id })
    .where(eq(projects.course_name, courseName))

  return res.status(200).json({ success: true })
}

export default withCourseOwnerOrAdminAccess()(handler)

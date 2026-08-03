import { sql } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db } from '~/db/dbClient'
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
  } = req.body as {
    sim_api_key?: string | null
    sim_base_url?: string | null
    sim_workspace_id?: string | null
  }

  await db.execute(
    sql`UPDATE projects
        SET sim_api_key = ${sim_api_key},
            sim_base_url = ${sim_base_url},
            sim_workspace_id = ${sim_workspace_id}
        WHERE course_name = ${courseName}`,
  )

  return res.status(200).json({ success: true })
}

export default withCourseOwnerOrAdminAccess()(handler)

import { sql } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db } from '~/db/dbClient'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'

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

  const rows = await db.execute<{
    sim_api_key: string | null
    sim_base_url: string | null
    sim_workspace_id: string | null
  }>(
    sql`SELECT sim_api_key, sim_base_url, sim_workspace_id
        FROM projects
        WHERE course_name = ${courseName}
        LIMIT 1`,
  )

  return res.status(200).json(
    rows[0] ?? {
      sim_api_key: null,
      sim_base_url: null,
      sim_workspace_id: null,
    },
  )
}

export default withCourseOwnerOrAdminAccess()(handler)

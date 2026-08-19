import { eq } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db } from '~/db/dbClient'
import { projects } from '~/db/schema'
import { type SimProjectConfig } from '~/types/sim'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { invalidateSimConfigCache, validateSimBaseUrl } from '~/utils/simConfig'

/**
 * POST /api/UIUC-api/tools/upsertSimConfig
 *
 * Only the fields present in the body are written. Defaulting the absent ones
 * to NULL made saving credentials wipe `sim_base_url` — the sole way to point a
 * project at a self-hosted Sim — because the form never sends that field.
 * Sending an explicit `null` still clears a value.
 */
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const courseName = req.courseName
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const body = req.body as Partial<SimProjectConfig>
  const update: Partial<SimProjectConfig> = {}
  if ('sim_api_key' in body) update.sim_api_key = body.sim_api_key ?? null
  if ('sim_base_url' in body) {
    const baseUrl =
      typeof body.sim_base_url === 'string' ? body.sim_base_url.trim() : null
    // Reject a base URL the resolver would refuse anyway — a value that only
    // ever fails at discovery time reads as a broken key, not a broken URL.
    if (baseUrl && !validateSimBaseUrl(baseUrl.replace(/\/$/, ''))) {
      return res.status(400).json({
        error: 'Invalid Sim base URL — not an allowed Sim host',
      })
    }
    update.sim_base_url = baseUrl || null
  }
  if ('sim_workspace_id' in body) {
    update.sim_workspace_id = body.sim_workspace_id ?? null
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No Sim configuration fields given' })
  }

  const updated = await db
    .update(projects)
    .set(update)
    .where(eq(projects.course_name, courseName))
    .returning({ course_name: projects.course_name })

  // A bare UPDATE against a missing row affects nothing and used to report
  // success, so the caller was told a save happened that never did.
  if (updated.length === 0) {
    return res.status(404).json({ error: 'Project not found' })
  }

  invalidateSimConfigCache(courseName)

  return res.status(200).json({ success: true })
}

export default withCourseOwnerOrAdminAccess()(handler)

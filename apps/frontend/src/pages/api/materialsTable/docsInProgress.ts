import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { documentsInProgress } from '~/db/dbClient'
import { connectionManager } from '~/utils/connectionManager'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { parseIngestStatusFilters } from '~/utils/ingestStatusFilters'

// This is for "Documents in Progress" table, docs that are still being ingested.
// POST-only: callers must send the filenames/base_urls they are tracking.

type DocsInProgressResponse = {
  documents?: { readable_filename: string; base_url: string; url: string }[]
  error?: string
}

async function docsInProgress(
  req: AuthenticatedRequest,
  res: NextApiResponse<DocsInProgressResponse>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const parsed = parseIngestStatusFilters(req.body)
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error })
  }
  const { filenames, base_urls } = parsed
  // Query the course the middleware actually authorized, which is not
  // necessarily the one in the body (it also accepts query params/headers).
  const course_name = req.courseName ?? parsed.course_name

  try {
    const db = await connectionManager.getDocumentsDb(course_name)
    const data = await db
      .select({
        readable_filename: documentsInProgress.readable_filename,
        base_url: documentsInProgress.base_url,
        url: documentsInProgress.url,
      })
      .from(documentsInProgress)
      .where(
        and(
          eq(documentsInProgress.course_name, course_name),
          or(
            filenames.length
              ? inArray(documentsInProgress.readable_filename, filenames)
              : undefined,
            base_urls.length
              ? inArray(
                  sql`rtrim(${documentsInProgress.base_url}, '/')`,
                  base_urls,
                )
              : undefined,
          ),
        ),
      )

    return res.status(200).json({
      documents: data.map((doc) => ({
        readable_filename: doc.readable_filename || 'Untitled Document',
        base_url: doc.base_url || '',
        url: doc.url || '',
      })),
    })
  } catch (error) {
    console.error('Failed to fetch documents:', error)
    return res.status(500).json({
      error: (error as Error).message,
    })
  }
}

export default withCourseOwnerOrAdminAccess()(docsInProgress)

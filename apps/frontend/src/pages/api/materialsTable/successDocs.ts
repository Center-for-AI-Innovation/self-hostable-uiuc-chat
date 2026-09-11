import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { documents } from '~/db/dbClient'
import { connectionManager } from '~/utils/connectionManager'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { parseIngestStatusFilters } from '~/utils/ingestStatusFilters'
// This is for "Documents" table, completed docs. POST-only: callers must send
// the filenames/base_urls they are tracking so we never return the whole table.

type SuccessDocsResponse = {
  documents?: { readable_filename: string; base_url: string; url: string }[]
  error?: string
}

async function successDocs(
  req: AuthenticatedRequest,
  res: NextApiResponse<SuccessDocsResponse>,
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
        readable_filename: documents.readable_filename,
        base_url: documents.base_url,
        url: documents.url,
      })
      .from(documents)
      .where(
        and(
          eq(documents.course_name, course_name),
          or(
            filenames.length
              ? inArray(documents.readable_filename, filenames)
              : undefined,
            base_urls.length
              ? inArray(sql`rtrim(${documents.base_url}, '/')`, base_urls)
              : undefined,
          ),
        ),
      )

    return res.status(200).json({
      documents: data.map((doc) => ({
        readable_filename: doc.readable_filename || '',
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

export default withCourseOwnerOrAdminAccess()(successDocs)

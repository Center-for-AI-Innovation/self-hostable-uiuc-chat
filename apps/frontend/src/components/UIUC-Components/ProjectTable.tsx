import { useAuth } from 'react-oidc-context'
import { useMemo, useState } from 'react'
import { type CourseMetadata } from '~/types/courseMetadata'
import { isSuperAdmin } from '~/utils/superAdmins'
import { useRouter } from 'next/router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/ui/table'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import Link from 'next/link'
import React from 'react'
import {
  IconChevronUp,
  IconChevronDown,
  IconSelector,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'

// Shared cell styling: keep the word-wrap/padding/color behavior of the
// previous custom table (cells must wrap, fixed layout).
const cellClasses =
  'whitespace-normal break-words p-2 text-left text-[--foreground] [hyphens:auto]'

type SortDirection = 'asc' | 'desc' | null
type SortableColumn = 'name' | 'privacy' | 'owner' | 'admins'

const ListProjectTable: React.FC = () => {
  const auth = useAuth()
  const router = useRouter()
  const [sortColumn, setSortColumn] = useState<SortableColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const currUserEmail = auth.isAuthenticated
    ? auth.user?.profile.email
    : undefined

  const { data: rawData = [], isLoading: isQueryLoading } = useQuery<
    { [key: string]: CourseMetadata }[]
  >({
    queryKey: ['allCourseMetadata', currUserEmail],
    queryFn: async () => {
      if (!currUserEmail) return []
      const response = await fetch(
        `/api/UIUC-api/getAllCourseMetadata?currUserEmail=${currUserEmail}`,
      )
      if (!response.ok) {
        throw new Error(`Failed to fetch course metadata: ${response.status}`)
      }
      const data = await response.json()
      return data || []
    },
    enabled: !!currUserEmail,
  })

  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: SortableColumn) => {
    if (sortColumn !== column)
      return (
        <IconSelector size={14} color="var(--foreground)" aria-hidden="true" />
      )
    return sortDirection === 'asc' ? (
      <IconChevronUp size={14} color="var(--foreground)" aria-hidden="true" />
    ) : (
      <IconChevronDown size={14} color="var(--foreground)" aria-hidden="true" />
    )
  }

  const rows = useMemo(() => {
    if (!Array.isArray(rawData) || rawData.length === 0) return []

    const sortedData = [...rawData].sort((a, b) => {
      const courseNameA = Object.keys(a)[0] ?? ''
      const courseNameB = Object.keys(b)[0] ?? ''
      const metadataA = a[courseNameA as keyof typeof a]
      const metadataB = b[courseNameB as keyof typeof b]

      if (!metadataA || !metadataB) return 0

      let comparison = 0
      switch (sortColumn) {
        case 'name':
          comparison = courseNameA
            .toLowerCase()
            .localeCompare(courseNameB.toLowerCase())
          break
        case 'privacy': {
          const privacyLevel = (m: typeof metadataA) =>
            m.is_private ? (m.allow_logged_in_users ? 1 : 2) : 0
          comparison = privacyLevel(metadataA) - privacyLevel(metadataB)
          break
        }
        case 'owner':
          comparison = metadataA.course_owner
            .toLowerCase()
            .localeCompare(metadataB.course_owner.toLowerCase())
          break
        case 'admins':
          const adminsA = metadataA.course_admins
            .filter((admin: string) => !isSuperAdmin(admin))
            .join(', ')
          const adminsB = metadataB.course_admins
            .filter((admin: string) => !isSuperAdmin(admin))
            .join(', ')
          comparison = adminsA
            .toLowerCase()
            .localeCompare(adminsB.toLowerCase())
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sortedData
      .map((course) => {
        const courseName = Object.keys(course)[0]
        if (!courseName) return null

        const courseMetadata = course[courseName as keyof typeof course]
        if (!courseMetadata) return null

        const filteredAdmins = courseMetadata.course_admins.filter(
          (admin: string) => !isSuperAdmin(admin),
        )

        return (
          <TableRow
            role="row"
            tabIndex={0}
            aria-label={courseName}
            key={courseName}
            className="cursor-pointer border-[--table-border] text-[--foreground] hover:bg-[--background-faded]"
            onClick={(e) => {
              // Check if cmd (Mac) or ctrl (Windows/Linux) key is pressed
              if (e.metaKey || e.ctrlKey) {
                // Open in new tab
                window.open(`/${courseName}/chat`, '_blank')
              } else {
                // Normal navigation in current tab
                router.push(`/${courseName}/chat`)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (e.metaKey || e.ctrlKey) {
                  window.open(`/${courseName}/chat`, '_blank')
                } else {
                  router.push(`/${courseName}/chat`)
                }
              }
            }}
          >
            <TableCell className={cellClasses}>{courseName}</TableCell>
            <TableCell className={cellClasses}>
              {courseMetadata.is_private
                ? courseMetadata.allow_logged_in_users
                  ? 'Logged-in Users'
                  : 'Private'
                : 'Public'}
            </TableCell>
            <TableCell className={cellClasses}>
              {courseMetadata.course_owner}
            </TableCell>
            <TableCell className={cellClasses}>
              {filteredAdmins.join(', ')}
            </TableCell>
          </TableRow>
        )
      })
      .filter((row): row is JSX.Element => row !== null)
  }, [rawData, sortColumn, sortDirection, router])

  if (auth.isLoading || isQueryLoading) {
    // Loading screen is actually NOT worth it :/ just return null
    // return <Skeleton animate={true} height={40} width="70%" radius="xl" />
    return null
  } else {
    if (!auth.isAuthenticated) {
      return (
        <>
          {/* Todo: add enticing copy for new recruits */}
          {/* <Title order={3}>
            <Link className="text-[--dashboard-button] underline" href="/new">Make your own project here</Link>
          </Title> */}
        </>
      )
    }

    return (
      <>
        <div className="mx-auto px-8 py-6">
          {rows.length > 0 ? (
            <>
              <div
                style={{
                  overflowX: 'auto',
                  width: '100%',
                  padding: '4px',
                }}
              >
                <Table
                  className="table-fixed text-base"
                  aria-label="Chatbots list"
                >
                  <TableHeader>
                    <TableRow className="border-[--table-border] hover:bg-transparent">
                      {[
                        { label: 'Chatbot Name', key: 'name' },
                        { label: 'Privacy', key: 'privacy' },
                        { label: 'Owner', key: 'owner' },
                        { label: 'Admins', key: 'admins' },
                      ].map(({ label, key }) => (
                        <TableHead
                          key={key}
                          tabIndex={0}
                          aria-sort={
                            sortColumn === key
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          onClick={() => handleSort(key as SortableColumn)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleSort(key as SortableColumn)
                            }
                          }}
                          className={`h-auto cursor-pointer font-bold ${cellClasses}`}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              gap: '4px',
                            }}
                          >
                            <span
                              className={`text-md ${montserrat_heading.variable} font-montserratHeading`}
                            >
                              {label}
                            </span>
                            {getSortIcon(key as SortableColumn)}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>{rows}</TableBody>
                </Table>
              </div>
            </>
          ) : (
            <p
              className={`pt-2 text-base ${montserrat_heading.variable} font-montserratHeading`}
              style={{
                backgroundColor: 'transparent',
                textAlign: 'center',
                color: 'var(--foreground)',
              }}
            >
              You haven&apos;t created any projects yet. Let&apos;s{' '}
              <Link
                role="button"
                tabIndex={0}
                className="underline"
                href="/new"
                style={{ color: 'var(--illinois-orange)' }}
              >
                go make one here
              </Link>
              , don&apos;t worry it&apos;s easy.
            </p>
          )}
        </div>
      </>
    )
  }
}

export default ListProjectTable

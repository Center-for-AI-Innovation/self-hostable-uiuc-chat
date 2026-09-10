import { Button } from '@/components/shadcn/ui/button'
import { Card } from '@/components/shadcn/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import { IconFileExport } from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { useRouter } from 'next/router'
import { useState } from 'react'
import styled from 'styled-components'
import { handleExport } from '~/utils/handleExport'
import { type CourseMetadata } from '~/types/courseMetadata'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import { showToast } from '~/utils/toastUtils'
import { ProjectFilesTable } from './ProjectFilesTable'

const TableContainer = styled.div`
  border-radius: 0 0 0.75rem 0.75rem;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(139, 92, 246, 0.5);
    border-radius: 4px;
  }
`

function DocumentsCard({
  course_name,
  metadata,
  sidebarCollapsed = false,
}: {
  course_name: string
  metadata: CourseMetadata
  sidebarCollapsed?: boolean
}) {
  const [tabValue, setTabValue] = useState<string | null>('success')
  const [failedCount, setFailedCount] = useState<number>(0)
  const [exportModalOpened, setExportModalOpened] = useState(false)
  const router = useRouter()

  // Get responsive card width classes based on sidebar state
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed || false)

  const getCurrentPageName = () => {
    return router.asPath.slice(1).split('/')[0] as string
  }

  return (
    <Card
      className={`mt-[2%] ${cardWidthClasses} gap-0 rounded-[2rem] border py-0 text-base shadow-none ring-0`}
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--dashboard-border)',
      }}
    >
      <div className="min-h-full bg-[--background]">
        <Dialog open={exportModalOpened} onOpenChange={setExportModalOpened}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Please confirm your action</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-popover-foreground">
              {`Are you sure you want to export all the documents and embeddings?`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-md bg-transparent text-popover-foreground hover:bg-[--dashboard-button-hover]"
                onClick={() => setExportModalOpened(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="dashboard"
                className="rounded-md"
                onClick={async () => {
                  setExportModalOpened(false)
                  const result = await handleExport(getCurrentPageName())
                  if (result && result.message) {
                    showToast({
                      autoClose: 30000,
                      title: result.message,
                      message:
                        'Check our docs (https://docs.uiuc.chat/features/bulk-export-documents-or-conversation-history) for example code to process this data.',
                      type: 'success',
                    })
                  }
                }}
              >
                Export
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="w-full border-b border-[--dashboard-border] px-4 py-3 sm:px-6 sm:py-4 md:px-8">
          <div className="flex items-center justify-between gap-2">
            <h3
              className={`${montserrat_heading.variable} font-montserratHeading text-lg font-bold text-[--foreground] sm:text-2xl`}
            >
              Project Files
            </h3>
            {/*FIXME: Export temporarily disabled because chunks larger than 200 MB aren’t stored in the database.*/}
            {/*<Button*/}
            {/*  variant="subtle"*/}
            {/*  leftIcon={<IconFileExport size={20} />}*/}
            {/*  onClick={() => setExportModalOpened(true)}*/}
            {/*  className={`*/}
            {/*    ${montserrat_paragraph.variable} */}
            {/*    rounded-md bg-[--dashboard-button] px-4*/}
            {/*    font-montserratParagraph text-sm*/}
            {/*    text-[--dashboard-button-foreground] hover:bg-[--dashboard-button-hover] sm:text-base*/}
            {/*  `}*/}
            {/*>*/}
            {/*  <span className="hidden sm:inline">*/}
            {/*    Export All Documents & Embeddings*/}
            {/*  </span>*/}
            {/*  <span className="inline sm:hidden">Export All</span>*/}
            {/*</Button>*/}
          </div>
        </div>

        <div className="bg-[--background] text-[--foreground]">
          {metadata && (
            <TableContainer>
              <ProjectFilesTable
                course_name={course_name}
                setFailedCount={setFailedCount}
                tabValue={tabValue as string}
                onTabChange={(value) => setTabValue(value)}
                failedCount={failedCount}
              />
            </TableContainer>
          )}
        </div>
      </div>
    </Card>
  )
}

export default DocumentsCard

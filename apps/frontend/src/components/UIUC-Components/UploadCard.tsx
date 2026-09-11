import { Button } from '@/components/shadcn/ui/button'
import { Card } from '@/components/shadcn/ui/card'
import { Textarea } from '@/components/shadcn/ui/textarea'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import {
  type CourseMetadata,
  type CourseMetadataOptionalForUpsert,
} from '~/types/courseMetadata'
import { callSetCourseMetadata, uploadToS3 } from '~/utils/apiUtils'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import SetExampleQuestions from './SetExampleQuestions'
import ChatbotTagsEditor from './ChatbotTagsEditor'
// import { Checkbox } from '@radix-ui/react-checkbox'
import { IconShare } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Montserrat } from 'next/font/google'
import { memo, useEffect, useRef, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import CanvasIngestForm from './CanvasIngestForm'
import CourseraIngestForm from './CourseraIngestForm'
import GitHubIngestForm from './GitHubIngestForm'
import LargeDropzone from './LargeDropzone'
import MITIngestForm from './MITIngestForm'
import ShareSettingsModal from './ShareSettingsModal'
import UploadNotification, { type FileUpload } from './UploadNotification'
import WebsiteIngestForm from './WebsiteIngestForm'

const montserrat_light = Montserrat({
  weight: '400',
  subsets: ['latin'],
})

// Restores the `autosize` behavior the Mantine Textarea gave us: grow to fit
// the content, with the `max-h-*` class doing what `maxRows` used to.
function useAutosizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}

export const UploadCard = memo(function UploadCard({
  projectName,
  current_user_email,
  metadata: initialMetadata,
  sidebarCollapsed = false,
}: {
  projectName: string
  current_user_email: string
  metadata: CourseMetadata
  sidebarCollapsed?: boolean
}) {
  const auth = useAuth()

  // Get responsive card width classes based on sidebar state
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed || false)
  const [projectDescription, setProjectDescription] = useState(
    initialMetadata?.project_description || '',
  )
  const queryClient = useQueryClient()
  const [introMessage, setIntroMessage] = useState(
    initialMetadata?.course_intro_message || '',
  )
  const [showNotification, setShowNotification] = useState(false)
  const [isIntroMessageUpdated, setIsIntroMessageUpdated] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<FileUpload[]>([])
  const [metadata, setMetadata] = useState(initialMetadata)
  const descriptionRef = useAutosizeTextarea(projectDescription)
  const greetingRef = useAutosizeTextarea(introMessage)

  useEffect(() => {
    // Set initial query data
    queryClient.setQueryData(['courseMetadata', projectName], initialMetadata)
  }, [])

  // Update local state when query data changes
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      const latestData = queryClient.getQueryData([
        'courseMetadata',
        projectName,
      ])
      if (latestData) {
        setMetadata(latestData as CourseMetadata)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [projectName, queryClient])

  const handleCloseNotification = () => {
    setShowNotification(false)
    setUploadFiles([])
  }
  const handleSetUploadFiles = (
    updateFn: React.SetStateAction<FileUpload[]>,
  ) => {
    setUploadFiles(updateFn)
  }
  return (
    <Card
      className={`mt-[2%] ${cardWidthClasses} gap-0 rounded-[2rem] border py-0 text-base shadow-none ring-0`}
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--dashboard-border)',
      }}
    >
      <div className="flex flex-col min-[960px]:flex-row">
        <div
          style={{
            flex: '1 1 95%',
            border: 'None',
            color: 'var(--foreground)',
          }}
          className="min-h-full bg-[--background]"
        >
          <div className="w-full border-b border-[--dashboard-border] px-4 py-3 sm:px-6 sm:py-4 md:px-8">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2
                  className={`${montserrat_heading.variable} font-montserratHeading text-lg font-bold text-[--foreground] sm:text-2xl`}
                >
                  Dashboard
                </h2>
                <span className="text-[--foreground]">/</span>
                <h3
                  className={`${
                    montserrat_heading.variable
                  } min-w-0 font-montserratHeading text-base font-bold text-[--illinois-orange] sm:text-xl ${
                    projectName.length > 40
                      ? 'max-w-[120px] truncate sm:max-w-[300px] lg:max-w-[400px]'
                      : ''
                  }`}
                >
                  {projectName}
                </h3>
              </div>

              <div className="-inset-0.25 relative shrink-0 rounded-3xl p-0.5">
                <Button
                  type="button"
                  variant="dashboard"
                  onClick={() => setIsShareModalOpen(true)}
                  className={`relative h-auto transform rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--dashboard-button] ${montserrat_paragraph.variable} min-h-[2rem] px-2 font-montserratParagraph text-sm font-normal sm:min-h-[2.5rem] sm:px-4 sm:text-base`}
                >
                  <span className="hidden sm:inline">Sharing and Access</span>
                  <span className="inline sm:hidden">Access</span>
                  <IconShare
                    size={12}
                    className="ml-1 inline sm:hidden"
                    aria-hidden="true"
                  />
                  <IconShare
                    size={20}
                    className="ml-2 hidden sm:inline"
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 pt-8 sm:px-6 sm:pt-8 md:px-8">
            <LargeDropzone
              courseName={projectName}
              current_user_email={current_user_email as string}
              isDisabled={false}
              courseMetadata={metadata as CourseMetadata}
              is_new_course={false}
              uploadFiles={uploadFiles}
              setUploadFiles={handleSetUploadFiles}
              queryClient={queryClient}
              auth={auth}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:px-6 sm:py-6 md:grid-cols-2 md:gap-4 md:px-8 min-[1192px]:grid-cols-3 min-[1192px]:gap-5">
            <CanvasIngestForm
              project_name={projectName}
              setUploadFiles={handleSetUploadFiles}
              queryClient={queryClient}
            />

            <WebsiteIngestForm
              project_name={projectName}
              uploadFiles={uploadFiles}
              setUploadFiles={handleSetUploadFiles}
              queryClient={queryClient}
            />

            <GitHubIngestForm
              project_name={projectName}
              uploadFiles={uploadFiles}
              setUploadFiles={handleSetUploadFiles}
              queryClient={queryClient}
            />

            <MITIngestForm
              project_name={projectName}
              setUploadFiles={handleSetUploadFiles}
              queryClient={queryClient}
            />

            <CourseraIngestForm />
          </div>
          <UploadNotification
            files={uploadFiles}
            onClose={handleCloseNotification}
            projectName={projectName}
          />
        </div>

        <div
          style={{
            backgroundColor: 'var(--dashboard-sidebar-background)',
            color: 'var(--dashboard-foreground)',
          }}
          className="flex-[1_1_100%] p-4 sm:p-6 min-[960px]:flex-[1_1_40%] min-[960px]:border-l min-[960px]:border-[--dashboard-border]"
        >
          <div className="flex h-full flex-col justify-start space-y-6">
            <div className="flex flex-col">
              <h3
                className={`${montserrat_heading.variable} mb-4 font-montserratHeading text-[1.375rem] font-bold text-[--dashboard-foreground]`}
              >
                Project Description
              </h3>
              <Textarea
                ref={descriptionRef}
                placeholder="Describe your project, goals, expected impact etc..."
                aria-label="Project Description"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                className={`${montserrat_paragraph.variable} max-h-[14rem] min-h-[7rem] overflow-y-auto bg-[--background] font-montserratParagraph text-base text-[--foreground] dark:bg-[--background]`}
              />
              <Button
                type="button"
                variant="dashboard"
                tabIndex={0}
                className="mt-3 w-24 self-end"
                onClick={async () => {
                  if (metadata) {
                    metadata.project_description = projectDescription
                    const resp = await callSetCourseMetadata(
                      projectName,
                      metadata,
                    )
                    if (!resp) {
                      console.log(
                        'Error upserting course metadata for course: ',
                        projectName,
                      )
                    }
                  }
                }}
              >
                Update
              </Button>
            </div>

            <div className="space-y-2">
              <h3
                className={`${montserrat_heading.variable} font-montserratHeading text-[1.375rem] font-bold text-[--dashboard-foreground]`}
              >
                Branding
              </h3>

              <div className="relative flex flex-col">
                <label
                  htmlFor="greeting-textarea"
                  className={`flex items-center px-1 py-2 ${montserrat_heading.variable} font-montserratHeading`}
                >
                  <span className="label-text-unused text-lg">
                    Set a greeting
                  </span>
                </label>
                <p
                  className={`px-1 py-2 ${montserrat_light.className} pt-0 text-sm`}
                >
                  Shown before users send their first chat.
                </p>
                <Textarea
                  ref={greetingRef}
                  id="greeting-textarea"
                  placeholder="Enter a greeting to help users get started with your bot"
                  className={`w-full ${montserrat_paragraph.variable} max-h-[7rem] min-h-[3.5rem] overflow-y-auto bg-[--background] font-montserratParagraph text-[--foreground] dark:bg-[--background]`}
                  value={introMessage}
                  onChange={(e) => {
                    setIntroMessage(e.target.value)
                    setIsIntroMessageUpdated(true)
                  }}
                />
                {isIntroMessageUpdated && (
                  <>
                    <Button
                      variant="dashboard"
                      tabIndex={0}
                      className="relative m-1 w-[30%] self-end"
                      type="submit"
                      onClick={async () => {
                        setIsIntroMessageUpdated(false)
                        if (metadata) {
                          metadata.course_intro_message = introMessage
                          // Update the courseMetadata object

                          const resp = await callSetCourseMetadata(
                            projectName,
                            metadata,
                          )
                          if (!resp) {
                            console.log(
                              'Error upserting course metadata for course: ',
                              projectName,
                            )
                          }
                        }
                      }}
                    >
                      Submit
                    </Button>
                  </>
                )}
              </div>
              <p
                className={`!mt-8 px-1 py-2 ${montserrat_heading.variable} pt-0 font-montserratHeading`}
              >
                <span className="label-text-unused text-lg">
                  Set example questions
                </span>
              </p>
              <p
                className={`!mt-0 px-1 py-2 ${montserrat_light.className} pb-0 text-sm`}
                style={{ marginBottom: '-3px' }}
              >
                Users will likely try these first to get a feel for your bot.
              </p>
              <SetExampleQuestions
                course_name={projectName}
                course_metadata={metadata as CourseMetadataOptionalForUpsert}
              />
              <div className="flex flex-col">
                <label
                  htmlFor="upload-logo-input"
                  className={`flex items-center px-1 py-2 ${montserrat_heading.variable} font-montserratHeading`}
                >
                  <span className="label-text-unused text-lg">
                    Upload your logo
                  </span>
                </label>
                <p
                  className={`!mt-0 px-1 py-2 ${montserrat_light.className} text-sm`}
                >
                  This logo will appear in the header of the chat page.
                </p>
                <input
                  id="upload-logo-input"
                  tabIndex={0}
                  type="file"
                  className={`h-12 w-full cursor-pointer overflow-hidden rounded-lg border-2 border-[--foreground] bg-[--background] pr-4 text-sm text-[--foreground] shadow-inner file:mr-4 file:inline-flex file:h-full file:items-center file:border-0 file:bg-transparent file:px-4 file:text-sm file:font-medium file:text-[--foreground] hover:border-[--dashboard-button] hover:bg-[--dashboard-button] hover:text-[--dashboard-button-foreground] focus:border-[--dashboard-button] ${montserrat_paragraph.variable} font-montserratParagraph`}
                  onChange={async (e) => {
                    // Assuming the file is converted to a URL somewhere else
                    if (e.target.files?.length) {
                      console.log('Uploading to s3')
                      const banner_s3_image = await uploadToS3(
                        e.target.files?.[0] ?? null,
                        '', // No user_id needed for course logos
                        projectName,
                        'document-group', // Course logos belong with course materials
                      )
                      if (banner_s3_image && metadata) {
                        metadata.banner_image_s3 = banner_s3_image
                        await callSetCourseMetadata(projectName, metadata)
                      }
                    }
                  }}
                />
              </div>

              {metadata && (
                <ChatbotTagsEditor
                  course_name={projectName}
                  course_metadata={metadata as CourseMetadataOptionalForUpsert}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <ShareSettingsModal
        opened={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        projectName={projectName}
        metadata={{
          ...metadata,
          approved_emails_list: metadata.approved_emails_list || [],
          course_admins: metadata.course_admins || [],
        }}
      />
    </Card>
  )
})

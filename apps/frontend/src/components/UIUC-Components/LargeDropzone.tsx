// LargeDropzone.tsx
import React, { useRef, useState } from 'react'
import { Group, rem, Text } from '@mantine/core'

import { IconCloudUpload, IconDownload, IconX } from '@tabler/icons-react'
import { type QueryClient } from '@tanstack/react-query'
import { Dropzone } from '@mantine/dropzone'
import { useRouter } from 'next/router'
import { type CourseMetadata } from '~/types/courseMetadata'
import SupportedFileUploadTypes from './SupportedFileUploadTypes'
import { useMediaQuery } from '@mantine/hooks'
import { callSetCourseMetadata } from '~/utils/apiUtils'
import {
  isActiveUpload,
  useGatedIngestPoller,
} from '~/hooks/useGatedIngestPoller'
import { v4 as uuidv4 } from 'uuid'
import { type FileUpload } from './UploadNotification'
import { type AuthContextProps } from 'react-oidc-context'

const POLL_INTERVAL_MS = 5000

const isActiveDocument = (file: FileUpload) => isActiveUpload(file, 'document')

export function LargeDropzone({
  courseName,
  current_user_email,
  isDisabled = false,
  courseMetadata,
  is_new_course,
  uploadFiles,
  setUploadFiles,
  queryClient,
  auth,
}: {
  courseName: string
  current_user_email: string
  isDisabled?: boolean
  courseMetadata: CourseMetadata
  is_new_course: boolean
  uploadFiles: FileUpload[]
  setUploadFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>
  queryClient: QueryClient
  auth: AuthContextProps
}) {
  // upload-in-progress spinner control
  const [uploadInProgress, setUploadInProgress] = useState(false)
  const router = useRouter()
  const isSmallScreen = useMediaQuery('(max-width: 960px)')
  const openRef = useRef<() => void>(null)

  const uploadToS3 = async (file: File | null, uniqueFileName: string) => {
    if (!file) return

    const requestObject = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uniqueFileName: uniqueFileName,
        fileType: file.type,
        courseName: courseName,
        // No user_id needed since document uploads use courses/${courseName}/ path
      }),
    }

    try {
      interface PresignedPostResponse {
        post: {
          url: string
          fields: { [key: string]: string }
        }
      }

      // Then, update the lines where you fetch the response and parse the JSON
      const response = await fetch('/api/UIUC-api/uploadToS3', requestObject)
      const data = (await response.json()) as PresignedPostResponse

      const { url, fields } = data.post as {
        url: string
        fields: { [key: string]: string }
      }
      const formData = new FormData()

      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value)
      })

      formData.append('file', file)

      const uploadResponse = await fetch(url, {
        method: 'POST',
        body: formData,
      })
      if (!uploadResponse.ok) {
        throw new Error(`S3 upload failed with status ${uploadResponse.status}`)
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      throw error
    }
  }

  const ingestFiles = async (files: File[] | null, is_new_course: boolean) => {
    if (!files) return
    files = files.filter((file) => file !== null)

    setUploadInProgress(true)

    // Initialize file upload status
    const initialFileUploads = files.map((file) => {
      const extension = file.name.slice(file.name.lastIndexOf('.'))
      const nameWithoutExtension = file.name
        .slice(0, file.name.lastIndexOf('.'))
        .replace(/[^a-zA-Z0-9]/g, '-')
      const uniqueReadableFileName = `${nameWithoutExtension}${extension}`

      return {
        name: uniqueReadableFileName,
        status: 'uploading' as const,
        type: 'document' as const,
      }
    })
    setUploadFiles((prev) => [...prev, ...initialFileUploads])

    if (is_new_course) {
      await callSetCourseMetadata(
        courseName,
        courseMetadata || {
          course_owner: current_user_email,
          course_admins: undefined,
          approved_emails_list: undefined,
          is_private: undefined,
          banner_image_s3: undefined,
          course_intro_message: undefined,
        },
      )
    }

    // Process files in parallel
    await Promise.all(
      files.map(async (file) => {
        const extension = file.name.slice(file.name.lastIndexOf('.'))
        const nameWithoutExtension = file.name
          .slice(0, file.name.lastIndexOf('.'))
          .replace(/[^a-zA-Z0-9]/g, '-')
        const uniqueFileName = `${uuidv4()}-${nameWithoutExtension}${extension}`
        const uniqueReadableFileName = `${nameWithoutExtension}${extension}`

        try {
          await uploadToS3(file, uniqueFileName)

          const response = await fetch(`/api/UIUC-api/ingest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              uniqueFileName: uniqueFileName,
              courseName: courseName,
              readableFilename: uniqueReadableFileName,
            }),
          })
          const res = await response.json()
          console.debug('Ingest submitted...', res)
        } catch (error) {
          console.error('Error during file upload or ingest:', error)
          // Update file status to error so it doesn't block navigation
          setUploadFiles((prev) =>
            prev.map((f) =>
              f.name === uniqueReadableFileName ? { ...f, status: 'error' } : f,
            ),
          )
        }
      }),
    )

    setUploadInProgress(false)

    if (is_new_course) {
      // refresh current page
      await new Promise((resolve) => setTimeout(resolve, 200))
      await router.push(`/${courseName}/dashboard`)
    }
  }

  // Poll ingest status only while document uploads are in flight, sending the
  // tracked filenames as a server-side filter so the endpoints never return
  // the whole documents table.
  useGatedIngestPoller({
    courseName,
    uploadFiles,
    setUploadFiles,
    queryClient,
    type: 'document',
    intervalMs: POLL_INTERVAL_MS,
    buildFilter: (files) => ({
      filenames: files
        .filter((file) => isActiveDocument(file))
        .map((file) => file.name),
    }),
    applyStatus: (status, files) => {
      const inProgressNames = new Set(
        status.inProgress.map((doc) => doc.readable_filename),
      )
      const completedNames = new Set(
        status.completed.map((doc) => doc.readable_filename),
      )

      return files.map((file) => {
        // Only files the tick actually asked about may be re-classified;
        // anything else is absent from the results for a benign reason.
        if (!isActiveDocument(file)) return file

        if (file.status === 'uploading') {
          if (inProgressNames.has(file.name)) {
            return { ...file, status: 'ingesting' }
          }
          // Ingest can happen very quickly, check if completed also
          if (completedNames.has(file.name)) {
            return { ...file, status: 'complete' }
          }
        } else if (!inProgressNames.has(file.name)) {
          return {
            ...file,
            status: completedNames.has(file.name)
              ? ('complete' as const)
              : ('error' as const),
          }
        }
        return file
      })
    },
  })

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* TODO: fix large dropzone display across all screens */}
        <div
          className="relative"
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
          }}
        >
          <Dropzone
            openRef={openRef}
            className="group relative cursor-pointer overflow-hidden rounded-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
            style={{
              width: '100%',
              minHeight: rem(200),
              height: 'auto',
              backgroundColor: isDisabled
                ? 'var(--background-faded)'
                : 'var(--background)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              borderWidth: '2px',
              borderStyle: 'dashed',
              borderColor: 'var(--dashboard-border)',
              borderRadius: rem(12),
              padding: '1rem',
              margin: '0 auto',
              maxWidth: '100%',
              overflow: 'hidden',
              background: 'var(--background)',
            }}
            onDrop={async (files) => {
              // Common audio and video file extensions to block
              const audioVideoExtensions = [
                // Audio extensions
                '.mp3',
                '.wav',
                '.ogg',
                '.m4a',
                '.flac',
                '.aac',
                '.wma',
                '.aiff',
                '.ape',
                '.opus',
                // Video extensions
                '.mp4',
                '.avi',
                '.mov',
                '.wmv',
                '.flv',
                '.mkv',
                '.webm',
                '.m4v',
                '.mpg',
                '.mpeg',
                '.3gp',
              ]

              const hasRejected = files.some((f) => {
                // Check MIME type
                const hasMimeType =
                  f.type.startsWith('audio/') || f.type.startsWith('video/')

                // Check file extension as fallback
                const fileName = f.name.toLowerCase()
                const hasExtension = audioVideoExtensions.some((ext) =>
                  fileName.endsWith(ext),
                )

                return hasMimeType || hasExtension
              })

              if (hasRejected) {
                alert('Audio and video files are not supported at this time.')
                return
              }

              ingestFiles(files, is_new_course).catch((error) => {
                console.error('Error during file upload:', error)
              })
            }}
            loading={uploadInProgress}
          >
            <div
              style={{ pointerEvents: 'none' }}
              className="flex flex-col items-center justify-center px-2 sm:px-4"
            >
              <Group position="center" pt={rem(12)} className="sm:pt-5">
                <Dropzone.Accept>
                  <IconDownload
                    size={isSmallScreen ? rem(30) : rem(50)}
                    color="var(--dashboard-foreground)"
                    stroke={1.5}
                    aria-hidden="true"
                  />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconX
                    size={isSmallScreen ? rem(30) : rem(50)}
                    color="var(--error)"
                    stroke={1.5}
                    aria-hidden="true"
                  />
                </Dropzone.Reject>
                {!isDisabled && (
                  <Dropzone.Idle>
                    <IconCloudUpload
                      size={isSmallScreen ? rem(30) : rem(50)}
                      color="var(--illinois-orange)"
                      stroke={1.5}
                      aria-hidden="true"
                    />
                  </Dropzone.Idle>
                )}
              </Group>

              <Text
                ta="center"
                fw={700}
                fz={isSmallScreen ? 'md' : 'lg'}
                mt={isSmallScreen ? 'md' : 'xl'}
                className="text-[--dashboard-foreground]"
              >
                <Dropzone.Accept>Drop files here</Dropzone.Accept>
                <Dropzone.Reject>
                  Upload rejected, not proper file type or too large.
                </Dropzone.Reject>
                <Dropzone.Idle>
                  {isDisabled
                    ? 'Enter an available project name above! 👀'
                    : 'Upload materials'}
                </Dropzone.Idle>
              </Text>

              {!isDisabled && (
                <Text
                  ta="center"
                  fz={isSmallScreen ? 'xs' : 'sm'}
                  mt="xs"
                  className="text-[--foreground-faded]"
                >
                  Drag&apos;n&apos;drop files or a whole folder here
                </Text>
              )}

              <div className="mt-2 w-full overflow-x-hidden sm:mt-4">
                <SupportedFileUploadTypes />
              </div>
            </div>
          </Dropzone>
        </div>
      </div>
    </>
  )
}

export default LargeDropzone

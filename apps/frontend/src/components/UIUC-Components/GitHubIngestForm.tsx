import React, { useState } from 'react'
import { Text, Card, Button, Input, createStyles } from '@mantine/core'
import {
  IconBrandGithub,
  IconWorldDownload,
  IconArrowRight,
} from '@tabler/icons-react'
// import { APIKeyInput } from '../LLMsApiKeyInputForm'
// import { ModelToggles } from '../ModelToggles'
import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/shadcn/ui/dialog'
// import { Checkbox } from '@radix-ui/react-checkbox'
import { showToast } from '~/utils/toastUtils'
import axios from 'axios'
import { type FileUpload } from './UploadNotification'
import Link from 'next/link'
import { type QueryClient } from '@tanstack/react-query'
import { useGatedIngestPoller } from '~/hooks/useGatedIngestPoller'
const POLL_INTERVAL_MS = 3000
export default function GitHubIngestForm({
  project_name,
  uploadFiles,
  setUploadFiles,
  queryClient,
}: {
  project_name: string
  uploadFiles: FileUpload[]
  setUploadFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>
  queryClient: QueryClient
}): JSX.Element {
  const useStyles = createStyles((theme) => ({
    // For Logos
    logos: {
      // width: '30%',
      aspectRatio: '3/2',
      objectFit: 'contain',
      width: '80px',
    },

    smallLogos: {
      // width: '30%',
      aspectRatio: '1/1',
      objectFit: 'contain',
      width: '45px',
    },

    codeStyledText: {
      color: 'var(--illinois-white)',
      backgroundColor: 'var(--illinois-orange)',
      borderRadius: '5px',
      padding: '.2rem .5rem',
      fontFamily: 'monospace',
      alignItems: 'center',
      justifyItems: 'center',
    },

    // For Accordion
    root: {
      borderRadius: theme.radius.lg,
      paddingLeft: 25,
      width: '400px',
      // outline: 'none',
      paddingTop: 20,
      paddingBottom: 20,

      '&[data-active]': {
        paddingTop: 20,
      },
    },
    control: {
      borderRadius: theme.radius.lg,
      // outline: '0.5px solid ',
      '&:hover': {
        backgroundColor: 'rgba(255, 255, 255, 0.2)', // 20% white on hover
      },
    },
    content: {
      borderRadius: theme.radius.lg,
    },
    panel: {
      borderRadius: theme.radius.lg,
    },
    item: {
      backgroundColor: 'bg-transparent',
      // border: `${rem(1)} solid transparent`,
      border: `solid transparent`,
      borderRadius: theme.radius.lg,
      position: 'relative',
      // zIndex: 0,
      transition: 'transform 150ms ease',
      outline: 'none',

      '&[data-active]': {
        transform: 'scale(1.03)',
        backgroundColor: '#15162b',
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadows.xl,
      },
      '&:hover': {
        backgroundColor: 'bg-transparent',
      },
    },

    chevron: {
      '&[data-rotate]': {
        transform: 'rotate(180deg)',
      },
    },
  }))
  const [isUrlValid, setIsUrlValid] = useState(false)
  const [url, setUrl] = useState('')
  const [maxUrls, setMaxUrls] = useState('50')
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    variable: string,
  ) => {
    const value = e.target.value

    if (variable === 'maxUrls') {
      setMaxUrls(value)
    } else if (variable === 'maxDepth') {
      // TODO: implement depth again.
      // setMaxDepth(value)
    }
  }
  const [icon, setIcon] = useState(
    <IconWorldDownload size={'50%'} aria-hidden="true" />,
  )
  const [scrapeStrategy, setScrapeStrategy] =
    useState<string>('equal-and-below')
  const [open, setOpen] = useState(false)
  const { classes, theme } = useStyles()
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setUrl(input)
    setIsUrlValid(validateUrl(input))
  }
  const validateUrl = (input: string) => {
    const regex = /^https?:\/\/(www\.)?github\.com\/.+/
    return regex.test(input)
  }

  const handleIngest = async () => {
    setOpen(false)
    if (isUrlValid) {
      const newFile: FileUpload = {
        name: url,
        status: 'uploading',
        type: 'github',
      }
      setUploadFiles((prevFiles) => [...prevFiles, newFile])
      try {
        await scrapeWeb(
          url,
          project_name,
          maxUrls.trim() !== '' ? parseInt(maxUrls) : 50,
          scrapeStrategy,
        )
      } catch (error: any) {
        console.error('Error while scraping web:', error)
        setUploadFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.name === url ? { ...file, status: 'error' } : file,
          ),
        )
        // Remove the timeout since we're handling errors properly now
      }
    } else {
      alert('Invalid URL (please include https://)')
    }

    // let ingest finalize things. It should be finished, but the DB is slow.
    await new Promise((resolve) => setTimeout(resolve, 8000))
  }

  // Poll ingest status only while GitHub ingests are in flight, sending the
  // tracked repo URLs as a server-side filter so the endpoints never return
  // the whole documents table.
  useGatedIngestPoller({
    courseName: project_name,
    uploadFiles,
    setUploadFiles,
    queryClient,
    type: 'github',
    intervalMs: POLL_INTERVAL_MS,
    // Filter on the repo URLs of ALL tracked base entries regardless of their
    // status (base entries are the ones without a `url` field): child rows
    // carry the base's base_url, so this returns every row the matching below
    // needs — including children still resolving after the base went terminal.
    buildFilter: (files) => ({
      base_urls: files
        .filter((file) => file.type === 'github' && !file.url)
        .map((file) => file.name)
        .filter((baseUrl) => baseUrl.length > 0),
    }),
    applyStatus: (status, currentFiles) => {
      // Helper function to organize docs by base URL
      const organizeDocsByBaseUrl = (
        docs: Array<{ base_url: string; url: string }>,
      ) => {
        const baseUrlMap = new Map<string, Set<string>>()

        docs.forEach((doc) => {
          if (!baseUrlMap.has(doc.base_url)) {
            baseUrlMap.set(doc.base_url, new Set())
          }
          baseUrlMap.get(doc.base_url)?.add(doc.url)
        })

        return baseUrlMap
      }

      // Helper function to update status of existing files
      const updateExistingFiles = (
        currentFiles: FileUpload[],
        docsInProgress: Array<{ base_url: string }>,
      ) => {
        return currentFiles.map((file) => {
          if (file.type !== 'github') return file

          const isStillIngesting = docsInProgress.some(
            (doc) => doc.base_url === file.name,
          )

          if (file.status === 'uploading' && isStillIngesting) {
            return { ...file, status: 'ingesting' as const }
          } else if (file.status === 'ingesting') {
            if (!isStillIngesting) {
              const isInCompletedDocs = status.completed.some(
                (doc) => doc.url === file.url,
              )

              if (isInCompletedDocs) {
                return { ...file, status: 'complete' as const }
              }

              // Not in progress and not in completed = failed
              return { ...file, status: 'error' as const }
            }
          }
          return file
        })
      }

      // Helper function to create new file entries for additional URLs.
      // Every key of baseUrlMap comes from an in-progress doc, so anything it
      // yields is by definition still ingesting.
      const createAdditionalFileEntries = (
        baseUrlMap: Map<string, Set<string>>,
        currentFiles: FileUpload[],
      ) => {
        const newFiles: FileUpload[] = []

        baseUrlMap.forEach((urls, baseUrl) => {
          // Only process if we have this base URL in our current files
          if (currentFiles.some((file) => file.name === baseUrl)) {
            urls.forEach((url) => {
              if (!currentFiles.some((file) => file.url === url)) {
                newFiles.push({
                  name: url,
                  status: 'ingesting',
                  type: 'github',
                  url: url,
                })
              }
            })
          }
        })

        return newFiles
      }

      const matchingDocsInProgress = status.inProgress.filter((doc) =>
        currentFiles.some((file) => file.name === doc.base_url),
      )

      const additionalFiles = createAdditionalFileEntries(
        organizeDocsByBaseUrl(matchingDocsInProgress),
        currentFiles,
      )

      const updatedFiles = updateExistingFiles(
        currentFiles,
        matchingDocsInProgress,
      )

      return [...updatedFiles, ...additionalFiles]
    },
  })

  // if (isLoading) {
  //   return <Skeleton height={200} width={330} radius={'lg'} />
  // }
  const scrapeWeb = async (
    url: string | null,
    courseName: string | null,
    maxUrls: number,
    scrapeStrategy: string,
  ) => {
    try {
      const response = await axios.post('/api/scrapeWeb', {
        url,
        courseName,
        maxUrls,
        scrapeStrategy,
      })

      console.log(
        'Response from Next.js API web scraping endpoint:',
        response.data,
      )
      return response.data
    } catch (error: any) {
      console.error('Error during web scraping:', error)

      showToast({
        title: 'Error during web scraping. Please try again.',
        message: error.message,
        type: 'error',
        autoClose: 12000,
      })
      throw error // Re-throw so handleIngest can update file status to 'error'
    }
  }

  return (
    <motion.div layout>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) {
            setUrl('')
            setIsUrlValid(false)
            setMaxUrls('50')
          }
        }}
      >
        <DialogTrigger
          tabIndex={0}
          nativeButton={false}
          className="focus:bg-[--dashboard-background-dark]"
          render={
            <Card
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[--dashboard-border] bg-transparent px-6 py-4 text-[--dashboard-foreground] transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
              style={{ height: '100%' }}
            >
              <div className="-ml-2 mb-2 flex items-center justify-between">
                <div className="flex items-center space-x-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full">
                    <IconBrandGithub className="h-8 w-8" aria-hidden="true" />
                  </div>
                  <Text className="text-xl font-semibold">GitHub</Text>
                </div>
              </div>
              <Text className="mb-4 text-sm leading-relaxed text-[--dashboard-foreground-faded]">
                Import content from GitHub repositories, including
                documentation, code, and README files.
              </Text>
              <div className="mt-auto flex items-center text-sm font-bold text-[--dashboard-button]">
                <span>Configure import</span>
                <IconArrowRight
                  size={16}
                  aria-hidden="true"
                  className="ml-2 transition-transform group-hover:translate-x-1"
                />
              </div>
            </Card>
          }
        />

        <DialogContent className="mx-auto h-auto max-h-[85vh] w-[95%] max-w-2xl overflow-y-auto !rounded-2xl border-0 bg-[--modal] px-4 py-6 text-[--modal-text] sm:px-6">
          <DialogHeader>
            <DialogTitle className="mb-4 text-left text-xl font-bold">
              Ingest GitHub Website
            </DialogTitle>
          </DialogHeader>
          <div className="">
            <div className="">
              <div>
                <div className="break-words text-sm sm:text-base">
                  <strong>For GitHub</strong>, just enter a URL like{' '}
                  <code className={classes.codeStyledText}>
                    github.com/USER/REPO
                  </code>
                  , for example:{' '}
                  <span>
                    <Link
                      target="_blank"
                      rel="noreferrer"
                      href={'https://github.com/langchain-ai/langchain'}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[--dashboard-button]"
                    >
                      https://github.com/langchain-ai/langchain
                    </Link>
                  </span>
                  . We&apos;ll ingest all files in the main branch. Ensure the
                  repository is public.
                </div>

                <Input
                  icon={icon}
                  aria-label="GitHub repository URL"
                  className="mt-4 w-full rounded-full"
                  styles={{
                    input: {
                      color: 'var(--foreground)',
                      backgroundColor: 'var(--background-faded)',
                      borderColor: 'var(--background-dark)',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      '&:focus': {
                        borderColor: 'var(--illinois-orange)',
                      },
                    },
                    wrapper: {
                      width: '100%',
                    },
                  }}
                  placeholder="Enter URL..."
                  radius="md"
                  type="url"
                  value={url}
                  size="lg"
                  onChange={(e) => {
                    handleUrlChange(e)
                  }}
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleIngest}
              disabled={!isUrlValid}
              className="h-11 w-full rounded-xl bg-[--dashboard-button] text-[--dashboard-button-foreground] transition-colors hover:bg-[--dashboard-button-hover] disabled:bg-[--background-faded] disabled:text-[--background-dark]"
            >
              Ingest the Website
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

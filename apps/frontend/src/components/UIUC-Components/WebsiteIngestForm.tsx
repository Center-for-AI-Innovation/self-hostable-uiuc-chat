import React, { useState } from 'react'
import {
  Text,
  Card,
  Tooltip,
  Button,
  Input,
  TextInput,
  List,
  SegmentedControl,
  Center,
  rem,
} from '@mantine/core'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/shadcn/ui/dialog'
import {
  IconHome,
  IconSitemap,
  IconSubtask,
  IconWorld,
  IconWorldDownload,
  IconArrowRight,
} from '@tabler/icons-react'
// import { APIKeyInput } from '../LLMsApiKeyInputForm'
// import { ModelToggles } from '../ModelToggles'
import { motion } from 'framer-motion'
// import { Checkbox } from '@radix-ui/react-checkbox'
import { montserrat_heading } from 'fonts'
import { showToast } from '~/utils/toastUtils'
import axios from 'axios'
import { type FileUpload } from './UploadNotification'
import { type QueryClient } from '@tanstack/react-query'
import { useGatedIngestPoller } from '~/hooks/useGatedIngestPoller'

const POLL_INTERVAL_MS = 3000

// Strip trailing slashes so the user-entered URL and the backend-stored
// base_url compare equal even when one has a trailing slash and the
// other doesn't.
const normalizeUrl = (url: string | undefined | null) =>
  (url ?? '').replace(/\/+$/, '')
export default function WebsiteIngestForm({
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

      if (value && /^\d+$/.test(value)) {
        const numValue = parseInt(value)
        if (numValue >= 1 && numValue <= 500) {
          setInputErrors((prev) => ({
            ...prev,
            maxUrls: { error: false, message: '' },
          }))
          return
        }
      }

      let errorMessage = ''
      if (!value) {
        errorMessage = 'Please provide an input for Max URLs'
      } else if (!/^\d+$/.test(value)) {
        errorMessage = 'Max URLs should be a valid number'
      } else {
        const numValue = parseInt(value)
        if (numValue < 1 || numValue > 500) {
          errorMessage = 'Max URLs should be between 1 and 500'
        }
      }

      setInputErrors((prev) => ({
        ...prev,
        maxUrls: {
          error: !!errorMessage,
          message: errorMessage,
        },
      }))
    }
  }
  const icon = <IconWorldDownload size={'50%'} aria-hidden="true" />
  const [scrapeStrategy, setScrapeStrategy] =
    useState<string>('equal-and-below')
  const [open, setOpen] = useState(false)
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setUrl(input)
    setIsUrlValid(validateUrl(input))
  }
  const validateUrl = (input: string) => {
    const regex = /^(https?:\/\/)?.+/
    return regex.test(input)
  }

  const [inputErrors, setInputErrors] = useState({
    maxUrls: { error: false, message: '' },
    maxDepth: { error: false, message: '' },
  })

  const handleIngest = async () => {
    const ingestUrl = url
    const ingestMaxUrls = maxUrls
    const ingestStrategy = scrapeStrategy
    const maxUrlsHasError = inputErrors.maxUrls.error
    const urlIsValid = isUrlValid

    setOpen(false)

    if (maxUrlsHasError) {
      alert('Invalid max URLs input (1 to 500)')
      return
    }

    if (urlIsValid) {
      const newFile: FileUpload = {
        name: ingestUrl,
        status: 'uploading',
        type: 'webscrape',
        url: ingestUrl,
        isBaseUrl: true,
      }
      setUploadFiles((prevFiles) => [...prevFiles, newFile])

      try {
        await scrapeWeb(
          ingestUrl,
          project_name,
          maxUrls.trim() !== '' ? parseInt(maxUrls) : 50,
          scrapeStrategy,
        )
        // Transition to 'ingesting' status after API call succeeds
        setUploadFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.name === url ? { ...file, status: 'ingesting' } : file,
          ),
        )
      } catch (error: unknown) {
        console.error('Error while scraping web:', error)
        setUploadFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.name === ingestUrl ? { ...file, status: 'error' } : file,
          ),
        )
        // Remove the timeout since we're handling errors properly now
      }
    } else {
      alert('Invalid URL (please include https://)')
    }

    await new Promise((resolve) => setTimeout(resolve, 8000))
  }

  // Poll ingest status only while webscrape uploads are in flight, sending
  // the tracked base URLs as a server-side filter so the endpoints never
  // return the whole documents table.
  useGatedIngestPoller({
    courseName: project_name,
    uploadFiles,
    setUploadFiles,
    queryClient,
    type: 'webscrape',
    intervalMs: POLL_INTERVAL_MS,
    // Filter on the base URLs of ALL tracked base entries regardless of their
    // status: child rows carry the base's base_url, so this returns every row
    // the matching below needs — including children that are still resolving
    // after the base entry itself went terminal.
    buildFilter: (files) => ({
      base_urls: files
        .filter((file) => file.type === 'webscrape' && file.isBaseUrl)
        .map((file) => normalizeUrl(file.url ?? file.name))
        .filter((baseUrl) => baseUrl.length > 0),
    }),
    applyStatus: (status, currentFiles) => {
      const baseUrlMatchesFile = (
        docBaseUrl: string,
        file: FileUpload,
      ): boolean => {
        const normBase = normalizeUrl(docBaseUrl)
        return (
          normalizeUrl(file.name) === normBase ||
          normalizeUrl(file.url) === normBase
        )
      }

      // Helper function to organize docs by base URL
      const organizeDocsByBaseUrl = (
        docs: Array<{ base_url: string; url: string }>,
      ) => {
        const baseUrlMap = new Map<string, Set<string>>()

        docs.forEach((doc) => {
          const key = normalizeUrl(doc.base_url)
          if (!baseUrlMap.has(key)) {
            baseUrlMap.set(key, new Set())
          }
          baseUrlMap.get(key)?.add(doc.url)
        })

        return baseUrlMap
      }

      // Helper function to update status of existing files
      const updateExistingFiles = (
        currentFiles: FileUpload[],
        docsInProgress: Array<{ base_url: string }>,
      ) => {
        return currentFiles.map((file) => {
          if (file.type !== 'webscrape') return file
          const fileUrl = file.url ?? ''

          const isStillIngesting = docsInProgress.some((doc) =>
            baseUrlMatchesFile(doc.base_url, file),
          )

          if (file.status === 'uploading' && isStillIngesting) {
            return { ...file, status: 'ingesting' as const }
          } else if (file.status === 'ingesting') {
            if (!isStillIngesting) {
              // Check if any child URLs are still in progress
              const childFiles = currentFiles.filter(
                (f) => f.url && f.url !== fileUrl && f.url.startsWith(fileUrl),
              )
              const allChildrenDone =
                childFiles.length === 0 ||
                childFiles.every(
                  (f) => f.status === 'complete' || f.status === 'error',
                )

              const isInCompletedDocs = status.completed.some(
                (doc) =>
                  normalizeUrl(doc.url) === normalizeUrl(file.url) ||
                  (file.isBaseUrl &&
                    normalizeUrl(doc.base_url) === normalizeUrl(file.url)),
              )

              if (file.isBaseUrl && allChildrenDone && isInCompletedDocs) {
                // Base URL can only complete if all children done
                return { ...file, status: 'complete' as const }
              } else if (!file.isBaseUrl && isInCompletedDocs) {
                return { ...file, status: 'complete' as const }
              }

              // If not in completed docs, keep as 'ingesting'
              // The crawling might still be in progress even if not in docsInProgress
              return file
            }
          }
          return file
        })
      }

      // Helper function to create new file entries for additional URLs.
      // Includes both in-progress and already-completed docs so that URLs
      // which finished crawling between polls still show up in the toast.
      const createAdditionalFileEntries = (
        inProgressBaseUrlMap: Map<string, Set<string>>,
        successBaseUrlMap: Map<string, Set<string>>,
        currentFiles: FileUpload[],
      ) => {
        const newFiles: FileUpload[] = []
        const seenUrls = new Set<string>()

        const hasMatchingBaseUrl = (baseUrl: string) =>
          currentFiles.some((file) => baseUrlMatchesFile(baseUrl, file))

        const alreadyTracked = (url: string) =>
          seenUrls.has(url) ||
          currentFiles.some(
            (file) =>
              normalizeUrl(file.url) === normalizeUrl(url) ||
              normalizeUrl(file.name) === normalizeUrl(url),
          )

        inProgressBaseUrlMap.forEach((urls, baseUrl) => {
          if (!hasMatchingBaseUrl(baseUrl)) return
          urls.forEach((url) => {
            if (alreadyTracked(url)) return
            seenUrls.add(url)
            newFiles.push({
              name: url,
              status: 'ingesting',
              type: 'webscrape',
              url: url,
            })
          })
        })

        successBaseUrlMap.forEach((urls, baseUrl) => {
          if (!hasMatchingBaseUrl(baseUrl)) return
          urls.forEach((url) => {
            if (alreadyTracked(url)) return
            seenUrls.add(url)
            newFiles.push({
              name: url,
              status: 'complete',
              type: 'webscrape',
              url: url,
            })
          })
        })

        return newFiles
      }

      const matchingDocsInProgress = status.inProgress.filter((doc) =>
        currentFiles.some((file) => baseUrlMatchesFile(doc.base_url, file)),
      )

      const matchingSuccessDocs = status.completed.filter((doc) =>
        currentFiles.some((file) => baseUrlMatchesFile(doc.base_url, file)),
      )

      const additionalFiles = createAdditionalFileEntries(
        organizeDocsByBaseUrl(matchingDocsInProgress),
        organizeDocsByBaseUrl(matchingSuccessDocs),
        currentFiles,
      )

      const updatedFiles = updateExistingFiles(
        currentFiles,
        matchingDocsInProgress,
      )

      return [...updatedFiles, ...additionalFiles]
    },
  })

  const scrapeWeb = async (
    url: string | null,
    courseName: string | null,
    maxUrls: number,
    scrapeStrategy: string,
  ) => {
    try {
      if (!url || !courseName) return null
      console.log('SCRAPING', url)

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
            setInputErrors((prev) => ({
              ...prev,
              maxUrls: { error: false, message: '' },
            }))
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
                    <IconWorldDownload className="h-8 w-8" aria-hidden="true" />
                  </div>
                  <Text className="text-xl font-semibold text-[--dashboard-foreground]">
                    Website
                  </Text>
                </div>
              </div>

              <Text className="mb-4 text-sm leading-relaxed text-[--dashboard-foreground-faded]">
                Import content from any website by providing the URL. Supports
                recursive crawling with customizable depth.
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
            <DialogTitle className="mb-2 text-left text-xl font-bold">
              Ingest Website
            </DialogTitle>
          </DialogHeader>
          <div className="">
            <div className="max-h-[70vh] overflow-y-auto sm:h-auto sm:max-h-none sm:overflow-visible">
              <div className="space-y-4">
                <form
                  className="w-full"
                  onSubmit={(event) => {
                    event.preventDefault()
                  }}
                >
                  <Input
                    icon={icon}
                    aria-label="Website URL"
                    className="w-full rounded-full"
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
                  <div className="pb-2 pt-2">
                    <Tooltip
                      multiline
                      w={400}
                      color="var(--tooltip-background)"
                      arrowPosition="side"
                      arrowSize={8}
                      withArrow
                      position="bottom-start"
                      label="We will attempt to visit this number of pages, but not all will be scraped if they're duplicates, broken or otherwise inaccessible."
                      styles={{
                        tooltip: {
                          color: 'var(--tooltip)',
                          backgroundColor: 'var(--tooltip-background)',
                        },
                      }}
                    >
                      <div className="mt-4">
                        <Text
                          style={{ fontSize: '16px' }}
                          className={`${montserrat_heading.variable} font-montserratHeading`}
                        >
                          Max URLs (1 to 500)
                        </Text>

                        <TextInput
                          name="maximumUrls"
                          aria-label="Max URLs (1 to 500)"
                          radius="md"
                          placeholder="Default 50"
                          value={maxUrls}
                          onChange={(e) => {
                            handleInputChange(e, 'maxUrls')
                          }}
                          error={inputErrors.maxUrls.error}
                          className="mt-2 w-full rounded-full"
                          styles={{
                            input: {
                              color: 'var(--foreground)',
                              backgroundColor:
                                'var(--background-faded) !important',
                              borderColor: 'var(--background-dark)',
                              padding:
                                'calc(var(--padding) * 1.5) calc(var(--padding) * .75)',
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
                        />
                      </div>
                    </Tooltip>
                  </div>
                  {inputErrors.maxUrls.error && (
                    <p style={{ color: 'red' }}>
                      {inputErrors.maxUrls.message}
                    </p>
                  )}
                  {inputErrors.maxDepth.error && (
                    <p style={{ color: 'red' }}>
                      {inputErrors.maxDepth.message}
                    </p>
                  )}

                  <Text
                    style={{ fontSize: '16px' }}
                    className={`${montserrat_heading.variable} mt-4 font-montserratHeading`}
                  >
                    Limit web crawl
                  </Text>
                  <div className="mt-2 pl-3">
                    <List className="text-[--modal-text]">
                      <List.Item>
                        <strong>Equal and Below:</strong> Only scrape content
                        that starts will the given URL. E.g. nasa.gov/blogs will
                        scrape all blogs like nasa.gov/blogs/new-rocket but
                        never go to nasa.gov/events.
                      </List.Item>
                      <List.Item>
                        <strong>Same subdomain:</strong> Crawl the entire
                        subdomain. E.g. docs.nasa.gov will grab that entire
                        subdomain, but not nasa.gov or api.nasa.gov.
                      </List.Item>
                      <List.Item>
                        <strong>Entire domain:</strong> Crawl as much of this
                        entire website as possible. E.g. nasa.gov also includes
                        docs.nasa.gov
                      </List.Item>
                      <List.Item>
                        <span>
                          <strong>All:</strong> Start on the given URL and
                          wander the web...{' '}
                          <Text>
                            For more detail{' '}
                            <a
                              className={'font-bold text-[--link]'}
                              href="https://docs.uiuc.chat/features/web-crawling-details"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              read the docs
                            </a>
                            .
                          </Text>
                        </span>
                      </List.Item>
                    </List>
                  </div>

                  <Text className="mt-4">
                    <strong>I suggest starting with Equal and Below</strong>,
                    then just re-run this if you need more later.
                  </Text>

                  <SegmentedControl
                    fullWidth
                    orientation="vertical"
                    size="sm"
                    radius="none"
                    value={scrapeStrategy}
                    onChange={(strat) => setScrapeStrategy(strat)}
                    className="mt-4 bg-[--background-faded]"
                    styles={{
                      indicator: {
                        color: 'var(--dashboard-button-foreground)',
                        backgroundColor: 'var(--dashboard-button)',
                      },
                      label: {
                        color: 'var(--foreground)',

                        '&:hover': {
                          color: 'var(--dashboard-button)',
                        },
                      },
                    }}
                    data={[
                      {
                        value: 'equal-and-below',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconSitemap
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>Equal and Below</span>
                          </Center>
                        ),
                      },
                      {
                        value: 'same-hostname',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconSubtask
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>Subdomain</span>
                          </Center>
                        ),
                      },
                      {
                        value: 'same-domain',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconHome
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>Entire domain</span>
                          </Center>
                        ),
                      },
                      {
                        value: 'all',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconWorld
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>All</span>
                          </Center>
                        ),
                      },
                    ]}
                  />
                </form>
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

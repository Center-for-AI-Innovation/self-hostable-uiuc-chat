import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { FileUpload } from '../UploadNotification'

vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    useMediaQuery: () => false,
  }
})

// Store the latest onDrop handler so custom tests can call it with arbitrary files.
let capturedOnDrop: ((files: File[]) => void) | undefined

vi.mock('@mantine/dropzone', () => {
  const Dropzone = ({ children, onDrop, loading }: any) => {
    capturedOnDrop = onDrop
    return (
      <div>
        <button
          type="button"
          onClick={() =>
            onDrop?.([
              new File(['hello'], 'My File.pdf', { type: 'application/pdf' }),
            ])
          }
        >
          trigger-drop
        </button>
        <div data-testid="dropzone-loading">{String(!!loading)}</div>
        {children}
      </div>
    )
  }
  const Accept = ({ children }: any) => <div>{children}</div>
  Accept.displayName = 'Dropzone.Accept'
  Dropzone.Accept = Accept

  const Reject = ({ children }: any) => <div>{children}</div>
  Reject.displayName = 'Dropzone.Reject'
  Dropzone.Reject = Reject

  const Idle = ({ children }: any) => <div>{children}</div>
  Idle.displayName = 'Dropzone.Idle'
  Dropzone.Idle = Idle
  return { Dropzone }
})

vi.mock('~/utils/apiUtils', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, callSetCourseMetadata: vi.fn(async () => ({})) }
})

vi.mock('uuid', () => ({ v4: () => 'uuid-1' }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard mock for setInterval that captures the callback. */
function mockTimers() {
  let intervalCallback: (() => Promise<void>) | undefined
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: any) => {
    intervalCallback = cb
    return 123 as any
  }) as any)
  vi.spyOn(globalThis, 'clearInterval').mockImplementation(
    () => undefined as any,
  )
  return () => intervalCallback
}

/** Build a standard fetch mock that can be customised per-test. */
function buildFetchMock(overrides: {
  docsInProgress?: () => { documents: { readable_filename: string }[] }
  successDocs?: () => { documents: { readable_filename: string }[] }
  uploadToS3?: () => Response | Promise<Response>
  s3Upload?: () => Response | Promise<Response>
  ingest?: () => Response | Promise<Response>
}) {
  return async (input: any, _init?: any) => {
    const url = String(input?.url ?? input)

    if (url.includes('/api/UIUC-api/uploadToS3')) {
      if (overrides.uploadToS3) return overrides.uploadToS3()
      return new Response(
        JSON.stringify({
          post: {
            url: 'http://localhost/upload',
            fields: { key: 'k', policy: 'p', 'x-amz-signature': 'sig' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url === 'http://localhost/upload') {
      if (overrides.s3Upload) return overrides.s3Upload()
      return new Response('', { status: 200 })
    }
    if (url.includes('/api/UIUC-api/ingest')) {
      if (overrides.ingest) return overrides.ingest()
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/api/materialsTable/docsInProgress')) {
      const body = overrides.docsInProgress
        ? overrides.docsInProgress()
        : { documents: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/api/materialsTable/successDocs')) {
      const body = overrides.successDocs
        ? overrides.successDocs()
        : { documents: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}

/** Default props factory for LargeDropzone. */
function defaultProps(overrides: Record<string, any> = {}) {
  return {
    courseName: 'CS101',
    current_user_email: 'me@example.com',
    isDisabled: false,
    courseMetadata: { course_owner: 'me@example.com' } as any,
    is_new_course: false,
    uploadFiles: [] as FileUpload[],
    setUploadFiles: vi.fn() as any,
    queryClient: { invalidateQueries: vi.fn() } as any,
    auth: { isAuthenticated: true } as any,
    ...overrides,
  }
}

/** An active document upload that arms the gated poller. */
function activeDocument(
  name: string,
  status: FileUpload['status'] = 'uploading',
) {
  return { name, status, type: 'document' as const }
}

describe('LargeDropzone', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    capturedOnDrop = undefined
  })

  // -----------------------------------------------------------------------
  // Rendering states
  // -----------------------------------------------------------------------

  it('shows the disabled state message', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(<LargeDropzone {...defaultProps({ isDisabled: true })} />)

    expect(
      screen.getByText(/Enter an available project name above/i),
    ).toBeInTheDocument()
  })

  it('shows "Upload materials" and drag-n-drop hint when enabled', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(<LargeDropzone {...defaultProps()} />)

    expect(screen.getByText('Upload materials')).toBeInTheDocument()
    expect(
      screen.getByText(/Drag.*drop files or a whole folder here/i),
    ).toBeInTheDocument()
  })

  it('does not show drag-n-drop hint or cloud icon when disabled', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(<LargeDropzone {...defaultProps({ isDisabled: true })} />)

    expect(
      screen.queryByText(/Drag.*drop files or a whole folder here/i),
    ).not.toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // New course upload + redirect
  // -----------------------------------------------------------------------

  it('uploads + ingests files for a new course and redirects to dashboard', async () => {
    const user = userEvent.setup()
    const { default: LargeDropzone } = await import('../LargeDropzone')
    const { callSetCourseMetadata } = await import('~/utils/apiUtils')

    const push = vi.fn(async () => {})
    globalThis.__TEST_ROUTER__ = { asPath: '/CS101/dashboard', push }

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })

    const getIntervalCb = mockTimers()

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({
          documents: uploads.map((u) => ({ readable_filename: u.name })),
        }),
        successDocs: () => ({
          documents: uploads.map((u) => ({ readable_filename: u.name })),
        }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          is_new_course: true,
          uploadFiles: [activeDocument('My-File.pdf')],
          setUploadFiles,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /trigger-drop/i }))

    await waitFor(() => expect(callSetCourseMetadata).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(push).toHaveBeenCalledWith('/CS101/dashboard')

    // Trigger one poll to exercise the status mapping code paths.
    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    expect(uploads.length).toBeGreaterThan(0)
    expect(uploads[0]!.status).toMatch(/uploading|ingesting|complete/)
  }, 20000)

  // -----------------------------------------------------------------------
  // Audio / video rejection
  // -----------------------------------------------------------------------

  it('rejects audio files by MIME type', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {})

    const setUploadFiles = vi.fn()
    render(<LargeDropzone {...defaultProps({ setUploadFiles })} />)

    // Trigger onDrop with an audio file
    capturedOnDrop?.([new File(['data'], 'song.mp3', { type: 'audio/mpeg' })])

    expect(alertSpy).toHaveBeenCalledWith(
      'Audio and video files are not supported at this time.',
    )
    // setUploadFiles should NOT be called for rejected files
    expect(setUploadFiles).not.toHaveBeenCalled()
  })

  it('rejects video files by MIME type', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {})

    render(<LargeDropzone {...defaultProps()} />)

    capturedOnDrop?.([new File(['data'], 'clip.mp4', { type: 'video/mp4' })])

    expect(alertSpy).toHaveBeenCalledWith(
      'Audio and video files are not supported at this time.',
    )
  })

  it('rejects files by audio/video extension even without MIME type', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {})

    render(<LargeDropzone {...defaultProps()} />)

    // File with generic MIME type but audio extension
    capturedOnDrop?.([
      new File(['data'], 'track.flac', { type: 'application/octet-stream' }),
    ])

    expect(alertSpy).toHaveBeenCalledWith(
      'Audio and video files are not supported at this time.',
    )
  })

  it('rejects files with video extensions like .mkv, .avi, .mov', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {})

    render(<LargeDropzone {...defaultProps()} />)

    capturedOnDrop?.([new File(['data'], 'movie.mkv', { type: '' })])

    expect(alertSpy).toHaveBeenCalledWith(
      'Audio and video files are not supported at this time.',
    )
  })

  it('accepts non-audio/video files without alert', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    const getIntervalCb = mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {})

    const setUploadFiles = vi.fn()
    render(<LargeDropzone {...defaultProps({ setUploadFiles })} />)

    capturedOnDrop?.([new File(['data'], 'notes.txt', { type: 'text/plain' })])

    // Wait for the async ingestFiles to begin
    await waitFor(() => expect(setUploadFiles).toHaveBeenCalled())
    expect(alertSpy).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // Upload error handling
  // -----------------------------------------------------------------------

  it('sets file status to error and skips ingest when uploadToS3 fails', async () => {
    const user = userEvent.setup()
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const ingestSpy = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        uploadToS3: () => {
          throw new Error('Network failure')
        },
        ingest: ingestSpy,
      }),
    )

    render(<LargeDropzone {...defaultProps({ setUploadFiles })} />)

    await user.click(screen.getByRole('button', { name: /trigger-drop/i }))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error uploading file:',
        expect.any(Error),
      )
    })

    expect(ingestSpy).not.toHaveBeenCalled()
    expect(uploads).toContainEqual(
      expect.objectContaining({ name: 'My-File.pdf', status: 'error' }),
    )
  }, 10000)

  it('sets file status to error when ingest API throws', async () => {
    const user = userEvent.setup()
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        ingest: () => {
          throw new Error('Ingest service down')
        },
      }),
    )

    render(<LargeDropzone {...defaultProps({ setUploadFiles })} />)

    await user.click(screen.getByRole('button', { name: /trigger-drop/i }))

    await waitFor(() => {
      const errorCall = setUploadFiles.mock.calls.find((call: any[]) => {
        if (typeof call[0] === 'function') {
          const result = call[0]([
            { name: 'My-File.pdf', status: 'uploading', type: 'document' },
          ])
          return result.some((f: FileUpload) => f.status === 'error')
        }
        return false
      })
      expect(errorCall).toBeDefined()
    })

    expect(consoleSpy).toHaveBeenCalled()
  }, 10000)

  // -----------------------------------------------------------------------
  // Non-new-course redirects
  // -----------------------------------------------------------------------

  it('does not navigate away after uploading to an existing course', async () => {
    const user = userEvent.setup()
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const push = vi.fn(async () => {})
    globalThis.__TEST_ROUTER__ = { push }

    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(
      <LargeDropzone
        {...defaultProps({
          is_new_course: false,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /trigger-drop/i }))

    // Non-new-course does NOT call refreshOrRedirect inside ingestFiles,
    // so push should not be called for /chat in this path
    // (refreshOrRedirect is only called when is_new_course is true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(push).not.toHaveBeenCalled()
  }, 10000)

  // -----------------------------------------------------------------------
  // Multiple file uploads
  // -----------------------------------------------------------------------

  it('handles multiple files in a single drop', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(<LargeDropzone {...defaultProps({ setUploadFiles })} />)

    capturedOnDrop?.([
      new File(['a'], 'doc1.pdf', { type: 'application/pdf' }),
      new File(['b'], 'doc2.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      new File(['c'], 'notes.txt', { type: 'text/plain' }),
    ])

    await waitFor(() => {
      expect(setUploadFiles).toHaveBeenCalled()
    })

    // The initial call should add 3 files
    const addCall = setUploadFiles.mock.calls.find((call: any[]) => {
      if (typeof call[0] === 'function') {
        const result = call[0]([])
        return result.length === 3
      }
      return false
    })
    expect(addCall).toBeDefined()
  })

  it('rejects drop when mix of valid and audio files', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {})
    const setUploadFiles = vi.fn()

    render(<LargeDropzone {...defaultProps({ setUploadFiles })} />)

    capturedOnDrop?.([
      new File(['a'], 'doc.pdf', { type: 'application/pdf' }),
      new File(['b'], 'song.wav', { type: 'audio/wav' }),
    ])

    expect(alertSpy).toHaveBeenCalledWith(
      'Audio and video files are not supported at this time.',
    )
    expect(setUploadFiles).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // Polling / status transitions
  // -----------------------------------------------------------------------

  it('transitions file from uploading to ingesting when seen in docsInProgress', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })

    const getIntervalCb = mockTimers()

    // docsInProgress returns the file, successDocs does not
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({
          documents: [{ readable_filename: 'report.pdf' }],
        }),
        successDocs: () => ({ documents: [] }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('report.pdf')],
          setUploadFiles,
        })}
      />,
    )

    // Simulate having a file in uploading state
    uploads = [{ name: 'report.pdf', status: 'uploading', type: 'document' }]

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    // setUploadFiles should have been called with an updater that transitions
    // the file to 'ingesting'
    const updater = setUploadFiles.mock.calls.find(
      (call: any[]) => typeof call[0] === 'function',
    )
    expect(updater).toBeDefined()
    if (updater) {
      const result = updater[0]([
        { name: 'report.pdf', status: 'uploading', type: 'document' },
      ])
      expect(result[0].status).toBe('ingesting')
    }
  })

  it('transitions file from uploading directly to complete when in successDocs but not inProgress', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })

    const getIntervalCb = mockTimers()

    // File is not in docsInProgress but IS in successDocs (fast ingest)
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({ documents: [] }),
        successDocs: () => ({
          documents: [{ readable_filename: 'quick.pdf' }],
        }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('quick.pdf')],
          setUploadFiles,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    const updater = setUploadFiles.mock.calls.find(
      (call: any[]) => typeof call[0] === 'function',
    )
    expect(updater).toBeDefined()
    if (updater) {
      const result = updater[0]([
        { name: 'quick.pdf', status: 'uploading', type: 'document' },
      ])
      expect(result[0].status).toBe('complete')
    }
  })

  it('transitions file from ingesting to complete when no longer in progress but in successDocs', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    // File no longer in docsInProgress, but in successDocs
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({ documents: [] }),
        successDocs: () => ({
          documents: [{ readable_filename: 'done.pdf' }],
        }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('done.pdf', 'ingesting')],
          setUploadFiles,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    const updater = setUploadFiles.mock.calls.find(
      (call: any[]) => typeof call[0] === 'function',
    )
    expect(updater).toBeDefined()
    if (updater) {
      const result = updater[0]([
        { name: 'done.pdf', status: 'ingesting', type: 'document' },
      ])
      expect(result[0].status).toBe('complete')
    }
  })

  it('transitions file from ingesting to error when not in progress and not in successDocs', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    // File not in either docsInProgress or successDocs
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({ documents: [] }),
        successDocs: () => ({ documents: [] }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('failed.pdf', 'ingesting')],
          setUploadFiles,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    const updater = setUploadFiles.mock.calls.find(
      (call: any[]) => typeof call[0] === 'function',
    )
    expect(updater).toBeDefined()
    if (updater) {
      const result = updater[0]([
        { name: 'failed.pdf', status: 'ingesting', type: 'document' },
      ])
      expect(result[0].status).toBe('error')
    }
  })

  it('leaves non-document files unchanged during polling', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({ documents: [] }),
        successDocs: () => ({ documents: [] }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          // A document completing makes the tick apply an update, so the
          // webscrape entry below is exercised rather than skipped.
          uploadFiles: [activeDocument('other.pdf', 'ingesting')],
          setUploadFiles,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    const updater = setUploadFiles.mock.calls.find(
      (call: any[]) => typeof call[0] === 'function',
    )
    expect(updater).toBeDefined()
    if (updater) {
      const webscrapeFile: FileUpload = {
        name: 'https://example.com',
        status: 'uploading',
        type: 'webscrape',
      }
      const result = updater[0]([webscrapeFile])
      expect(result[0]).toBe(webscrapeFile)
      expect(result[0].status).toBe('uploading')
      expect(result[0].type).toBe('webscrape')
    }
  })

  it('keeps file as ingesting when still in docsInProgress', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    // File still in docsInProgress
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({
          documents: [{ readable_filename: 'still-going.pdf' }],
        }),
        successDocs: () => ({ documents: [] }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('still-going.pdf', 'ingesting')],
          setUploadFiles,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    expect(intervalCallback).toBeDefined()
    if (intervalCallback) await intervalCallback()

    // Still in docsInProgress means nothing changed, so the tick must not
    // touch state at all (which is what keeps the file 'ingesting').
    expect(setUploadFiles).not.toHaveBeenCalled()
  })

  it('leaves uploading file unchanged when not in docsInProgress or successDocs yet', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    // Neither list contains the file (still uploading to S3)
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({ documents: [] }),
        successDocs: () => ({ documents: [] }),
      }),
    )

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('pending.pdf')],
          setUploadFiles,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    expect(intervalCallback).toBeDefined()
    if (intervalCallback) await intervalCallback()

    // Not visible in either API yet, so the file stays 'uploading' and the
    // tick makes no state update.
    expect(setUploadFiles).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // Gated polling
  // -----------------------------------------------------------------------

  it('does not arm the polling interval when no document uploads are active', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const getIntervalCb = mockTimers()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(buildFetchMock({}))
    const invalidateQueries = vi.fn()

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [
            { name: 'done.pdf', status: 'complete', type: 'document' },
            { name: 'https://a.com', status: 'uploading', type: 'webscrape' },
          ],
          queryClient: { invalidateQueries } as any,
        })}
      />,
    )

    expect(getIntervalCb()).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    // An idle dashboard must also not refetch the documents table on mount.
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('POSTs the tracked filenames to both status endpoints', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const getIntervalCb = mockTimers()
    const calls: { url: string; body: any }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (
      input: any,
      init?: any,
    ) => {
      const url = String(input?.url ?? input)
      if (url.includes('/api/materialsTable/')) {
        calls.push({ url, body: JSON.parse(init?.body ?? '{}') })
      }
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as any)

    render(
      <LargeDropzone
        {...defaultProps({ uploadFiles: [activeDocument('report.pdf')] })}
      />,
    )

    const intervalCallback = getIntervalCb()
    expect(intervalCallback).toBeDefined()
    if (intervalCallback) await intervalCallback()

    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.url).sort()).toEqual([
      '/api/materialsTable/docsInProgress',
      '/api/materialsTable/successDocs',
    ])
    for (const call of calls) {
      expect(call.body).toEqual({
        course_name: 'CS101',
        filenames: ['report.pdf'],
      })
    }
  })

  it('skips the status update when a status endpoint fails', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: any) => {
      const url = String(input?.url ?? input)
      if (url.includes('/api/materialsTable/successDocs')) {
        return new Response(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as any)

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('flaky.pdf', 'ingesting')],
          setUploadFiles,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    expect(intervalCallback).toBeDefined()
    if (intervalCallback) await intervalCallback()

    // The file must NOT be flipped to 'error' just because a request failed.
    expect(setUploadFiles).not.toHaveBeenCalled()
  })

  it('invalidates documents on complete-transition and both keys on gate close', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const invalidateQueries = vi.fn()
    const getIntervalCb = mockTimers()

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        docsInProgress: () => ({ documents: [] }),
        successDocs: () => ({
          documents: [{ readable_filename: 'done.pdf' }],
        }),
      }),
    )

    const props = defaultProps({
      uploadFiles: [activeDocument('done.pdf', 'ingesting')],
      queryClient: { invalidateQueries } as any,
    })
    const { rerender } = render(<LargeDropzone {...props} />)

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'CS101'],
    })

    invalidateQueries.mockClear()

    // Gate closes: the tracked file went terminal.
    rerender(
      <LargeDropzone
        {...props}
        uploadFiles={[
          { name: 'done.pdf', status: 'complete', type: 'document' },
        ]}
      />,
    )

    // Rows can land just after a file goes terminal, so the close always
    // refreshes — one possibly-redundant refetch per batch.
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'CS101'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['failedDocuments', 'CS101'],
    })
  })

  it('refreshes again when a second batch starts and finishes', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const invalidateQueries = vi.fn()
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const props = defaultProps({
      uploadFiles: [activeDocument('first.pdf')],
      queryClient: { invalidateQueries } as any,
    })
    const done = (name: string) => ({
      name,
      status: 'complete' as const,
      type: 'document' as const,
    })
    const { rerender } = render(<LargeDropzone {...props} />)

    rerender(<LargeDropzone {...props} uploadFiles={[done('first.pdf')]} />)
    invalidateQueries.mockClear()

    // A second upload starts and finishes: its rows must be picked up too.
    rerender(
      <LargeDropzone
        {...props}
        uploadFiles={[done('first.pdf'), activeDocument('second.pdf')]}
      />,
    )
    rerender(
      <LargeDropzone
        {...props}
        uploadFiles={[done('first.pdf'), done('second.pdf')]}
      />,
    )

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'CS101'],
    })
  })

  it('still refreshes the table on gate close when no tick did', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const invalidateQueries = vi.fn()
    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    const props = defaultProps({
      uploadFiles: [activeDocument('doomed.pdf')],
      queryClient: { invalidateQueries } as any,
    })
    const { rerender } = render(<LargeDropzone {...props} />)

    // Upload fails outside the poller, so no tick ever saw a transition.
    rerender(
      <LargeDropzone
        {...props}
        uploadFiles={[
          { name: 'doomed.pdf', status: 'error', type: 'document' },
        ]}
      />,
    )

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'CS101'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['failedDocuments', 'CS101'],
    })
  })

  it('chunks filter POSTs above the server cap and merges results', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })
    const getIntervalCb = mockTimers()

    const manyFiles: FileUpload[] = Array.from({ length: 1001 }, (_, i) =>
      activeDocument(`doc-${i}.pdf`, 'ingesting'),
    )
    uploads = manyFiles

    const bodies: any[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (
      input: any,
      init?: any,
    ) => {
      const url = String(input?.url ?? input)
      const body = JSON.parse(init?.body ?? '{}')
      bodies.push({ url, count: body.filenames?.length ?? 0 })
      // Every tracked file is completed.
      return new Response(
        JSON.stringify({
          documents: url.includes('successDocs')
            ? body.filenames.map((name: string) => ({
                readable_filename: name,
              }))
            : [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as any)

    render(
      <LargeDropzone
        {...defaultProps({ uploadFiles: manyFiles, setUploadFiles })}
      />,
    )

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    // 2 chunks (1000 + 1) × 2 endpoints
    expect(bodies).toHaveLength(4)
    expect(bodies.map((b) => b.count).sort()).toEqual([1, 1, 1000, 1000])
    // Merged results complete every file, including the one in the second chunk.
    expect(uploads.every((f) => f.status === 'complete')).toBe(true)
  })

  it('skips the whole tick when one chunk fails', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    const manyFiles: FileUpload[] = Array.from({ length: 1001 }, (_, i) =>
      activeDocument(`doc-${i}.pdf`, 'ingesting'),
    )

    let requestCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () => {
      requestCount++
      if (requestCount > 2) {
        return new Response(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as any)

    render(
      <LargeDropzone
        {...defaultProps({ uploadFiles: manyFiles, setUploadFiles })}
      />,
    )

    const intervalCallback = getIntervalCb()
    expect(intervalCallback).toBeDefined()
    if (intervalCallback) await intervalCallback()

    // No partial merge: statuses untouched when any chunk request failed.
    expect(requestCount).toBeGreaterThan(2)
    expect(setUploadFiles).not.toHaveBeenCalled()
  })

  it('does not read successDocs until docsInProgress has answered', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const getIntervalCb = mockTimers()
    // Ingest writes the document row and only then deletes the in-progress
    // row. If both reads are in flight at once, successDocs can observe the
    // database before the row is written while docsInProgress observes it
    // after the delete — the doc is then missing from both and a healthy
    // ingest gets reported as failed.
    let inProgressAnswered = false
    let readConcurrently = false
    let releaseInProgress: (() => void) | undefined
    const inProgressGate = new Promise<void>((resolve) => {
      releaseInProgress = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: any) => {
      const url = String(input?.url ?? input)
      if (url.includes('/api/materialsTable/docsInProgress')) {
        await inProgressGate
        inProgressAnswered = true
      }
      if (url.includes('/api/materialsTable/successDocs')) {
        if (!inProgressAnswered) readConcurrently = true
      }
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as any)

    render(
      <LargeDropzone
        {...defaultProps({ uploadFiles: [activeDocument('a.pdf')] })}
      />,
    )

    const intervalCallback = getIntervalCb()
    expect(intervalCallback).toBeDefined()
    const tick = intervalCallback ? intervalCallback() : Promise.resolve()
    // Let anything that was going to run concurrently do so.
    await new Promise((resolve) => setTimeout(resolve, 0))
    releaseInProgress?.()
    await tick

    expect(readConcurrently).toBe(false)
    expect(inProgressAnswered).toBe(true)
  })

  it('invalidates only failedDocuments when a tick just errors', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const invalidateQueries = vi.fn()
    const getIntervalCb = mockTimers()

    // Absent from both lists: the ingest failed.
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(
      <LargeDropzone
        {...defaultProps({
          uploadFiles: [activeDocument('gone.pdf', 'ingesting')],
          queryClient: { invalidateQueries } as any,
        })}
      />,
    )

    const intervalCallback = getIntervalCb()
    if (intervalCallback) await intervalCallback()

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['failedDocuments', 'CS101'],
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['documents', 'CS101'],
    })
  })

  it('keeps files added while a tick was in flight', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    // Real state, so the tick's updater runs against a list that changed
    // after the request was sent.
    let committed: FileUpload[] = [activeDocument('early.pdf', 'ingesting')]
    const setUploadFiles = vi.fn((updater: any) => {
      committed = typeof updater === 'function' ? updater(committed) : updater
    })
    const getIntervalCb = mockTimers()

    let releaseRequests: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      releaseRequests = resolve
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: any) => {
      await pending
      const url = String(input?.url ?? input)
      return new Response(
        JSON.stringify({
          documents: url.includes('successDocs')
            ? [{ readable_filename: 'early.pdf' }]
            : [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as any)

    render(
      <LargeDropzone
        {...defaultProps({ uploadFiles: committed, setUploadFiles })}
      />,
    )

    const intervalCallback = getIntervalCb()
    expect(intervalCallback).toBeDefined()
    const tick = intervalCallback ? intervalCallback() : Promise.resolve()

    // A second drop lands before the status response comes back.
    committed = [...committed, activeDocument('late.pdf')]

    releaseRequests?.()
    await tick

    // The tick's result is applied without discarding the newer entry.
    expect(committed.map((file) => [file.name, file.status])).toEqual([
      ['early.pdf', 'complete'],
      ['late.pdf', 'uploading'],
    ])
  })

  it('discards a tick that was still in flight when the gate closed', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')

    const setUploadFiles = vi.fn()
    const getIntervalCb = mockTimers()

    // Hold the status requests open so the tick for 'first.pdf' is still
    // pending while the queue drains and a different upload starts.
    let releaseRequests: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      releaseRequests = resolve
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () => {
      await pending
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as any)

    const props = defaultProps({
      uploadFiles: [activeDocument('first.pdf', 'ingesting')],
      setUploadFiles,
    })
    const { rerender } = render(<LargeDropzone {...props} />)

    const staleTickCallback = getIntervalCb()
    expect(staleTickCallback).toBeDefined()
    const staleTick = staleTickCallback
      ? staleTickCallback()
      : Promise.resolve()

    // Queue drains (gate closes), then a NEW upload starts (gate reopens).
    rerender(
      <LargeDropzone
        {...props}
        uploadFiles={[{ name: 'first.pdf', status: 'error', type: 'document' }]}
      />,
    )
    rerender(
      <LargeDropzone
        {...props}
        uploadFiles={[
          { name: 'first.pdf', status: 'error', type: 'document' },
          activeDocument('second.pdf', 'ingesting'),
        ]}
      />,
    )

    releaseRequests?.()
    await staleTick

    // The stale response only ever described 'first.pdf'. Applying it would
    // mark the healthy 'second.pdf' ingest as failed, since it is necessarily
    // absent from those results.
    expect(setUploadFiles).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // File name sanitisation
  // -----------------------------------------------------------------------

  it('sanitises file names by replacing non-alphanumeric chars with dashes', async () => {
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()

    let uploads: FileUpload[] = []
    const setUploadFiles = vi.fn((updater: any) => {
      uploads = typeof updater === 'function' ? updater(uploads) : updater
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(<LargeDropzone {...defaultProps({ setUploadFiles })} />)

    capturedOnDrop?.([
      new File(['data'], 'My File (2024).pdf', { type: 'application/pdf' }),
    ])

    await waitFor(() => {
      expect(setUploadFiles).toHaveBeenCalled()
    })

    // The initial add should use sanitised name
    const addCall = setUploadFiles.mock.calls.find((call: any[]) => {
      if (typeof call[0] === 'function') {
        const result = call[0]([])
        return result.length > 0 && result[0].name === 'My-File--2024-.pdf'
      }
      return false
    })
    expect(addCall).toBeDefined()
  })

  // -----------------------------------------------------------------------
  // New course with no existing courseMetadata (fallback metadata)
  // -----------------------------------------------------------------------

  it('uses fallback metadata when courseMetadata is falsy for new course', async () => {
    const user = userEvent.setup()
    const { default: LargeDropzone } = await import('../LargeDropzone')
    const { callSetCourseMetadata } = await import('~/utils/apiUtils')

    const push = vi.fn(async () => {})
    globalThis.__TEST_ROUTER__ = { push }

    mockTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock({}))

    render(
      <LargeDropzone
        {...defaultProps({
          is_new_course: true,
          // Pass falsy courseMetadata to trigger fallback path
          courseMetadata: null,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /trigger-drop/i }))

    await waitFor(() => expect(callSetCourseMetadata).toHaveBeenCalled())

    // Verify fallback metadata was used (course_owner from current_user_email)
    const callArgs = (callSetCourseMetadata as any).mock.calls[0]
    expect(callArgs[0]).toBe('CS101')
    expect(callArgs[1]).toEqual(
      expect.objectContaining({ course_owner: 'me@example.com' }),
    )
  }, 10000)

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it('shows loading state during upload', async () => {
    const user = userEvent.setup()
    const { default: LargeDropzone } = await import('../LargeDropzone')
    mockTimers()

    // Make uploadToS3 hang so we can observe loading state
    let resolveUpload: (() => void) | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      buildFetchMock({
        uploadToS3: () =>
          new Promise((resolve) => {
            resolveUpload = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    post: {
                      url: 'http://localhost/upload',
                      fields: { key: 'k' },
                    },
                  }),
                  {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                  },
                ),
              )
          }),
      }),
    )

    render(<LargeDropzone {...defaultProps()} />)

    const loadingIndicator = screen.getByTestId('dropzone-loading')
    expect(loadingIndicator.textContent).toBe('false')

    await user.click(screen.getByRole('button', { name: /trigger-drop/i }))

    await waitFor(() => {
      expect(screen.getByTestId('dropzone-loading').textContent).toBe('true')
    })

    // Cleanup - resolve the hanging promise
    if (resolveUpload) resolveUpload()
  }, 10000)
})

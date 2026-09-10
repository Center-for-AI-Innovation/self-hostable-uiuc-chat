import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createTestQueryClient } from '~/test-utils/renderWithProviders'
import type { FileUpload } from '../UploadNotification'

vi.mock('framer-motion', () => {
  const motion = new Proxy(
    {},
    {
      get: () => (props: any) => React.createElement('div', props),
    },
  )
  return {
    motion,
    AnimatePresence: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
  }
})

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  showWarningToast: vi.fn(),
  showInfoToast: vi.fn(),
}))

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

/**
 * Stateful harness: the gated poller only runs while `uploadFiles` contains
 * active github entries, so tests must hold real state for the gate to open.
 */
function Harness(props: any) {
  const [files, setFiles] = useState<FileUpload[]>(props.initialFiles ?? [])
  return (
    <div>
      <div data-testid="files">{JSON.stringify(files)}</div>
      <props.Component
        project_name="CS101"
        uploadFiles={files}
        setUploadFiles={setFiles}
        queryClient={props.queryClient}
      />
    </div>
  )
}

const filesJson = () => screen.getByTestId('files').textContent ?? ''

describe('GitHubIngestForm', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the dialog and ingests a GitHub URL, then updates polling statuses', async () => {
    const user = userEvent.setup()
    const queryClient = createTestQueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    // Avoid the hard-coded 8s wait.
    const nativeSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => {
      return nativeSetTimeout(fn, 0) as any
    }) as any)

    // Polling: capture callback so we can call it with different fetch responses.
    let intervalCallback: (() => Promise<void>) | undefined
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation(((cb: any, delay?: any) => {
        // GitHubIngestForm polls every 3000ms.
        if (delay === 3000) intervalCallback = cb
        return 42 as any
      }) as any)
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(
      () => undefined as any,
    )

    const axios = (await import('axios')).default as any
    axios.post.mockResolvedValueOnce({ data: { ok: true } })

    // First poll: docs in progress (creates additional file entries)
    // Second poll: completed docs (marks additional entries complete)
    let pollStep = 0
    const requestBodies: any[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (
      input: any,
      init?: any,
    ) => {
      const url = String(input?.url ?? input)
      if (url.includes('/api/materialsTable/')) {
        requestBodies.push(JSON.parse(init?.body ?? '{}'))
      }
      if (url.includes('/api/materialsTable/docsInProgress')) {
        pollStep += 1
        if (pollStep === 1) {
          return new Response(
            JSON.stringify({
              documents: [
                {
                  base_url: 'https://github.com/user/repo',
                  url: 'https://github.com/user/repo/blob/main/README.md',
                  readable_filename: 'README.md',
                },
                {
                  base_url: 'https://github.com/user/repo',
                  url: 'https://github.com/user/repo/blob/main/docs.md',
                  readable_filename: 'docs.md',
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/api/materialsTable/successDocs')) {
        if (pollStep <= 1) {
          return new Response(JSON.stringify({ documents: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({
            documents: [
              { url: 'https://github.com/user/repo/blob/main/README.md' },
              { url: 'https://github.com/user/repo/blob/main/docs.md' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as any)

    const GitHubIngestForm = (await import('../GitHubIngestForm')).default
    render(<Harness Component={GitHubIngestForm} queryClient={queryClient} />)

    // Gated poller: no interval while nothing is being ingested.
    expect(setIntervalSpy).not.toHaveBeenCalled()

    await user.click(screen.getByText(/^GitHub$/i))
    expect(
      await screen.findByText(/Ingest GitHub Website/i),
    ).toBeInTheDocument()

    const urlInput = screen.getByPlaceholderText(/Enter URL/i)
    fireEvent.change(urlInput, {
      target: { value: 'https://github.com/user/repo' },
    })

    const ingestButton = screen.getByRole('button', {
      name: /Ingest the Website/i,
    })
    await waitFor(() => expect(ingestButton).toBeEnabled())

    await user.click(ingestButton)
    await waitFor(() => expect(axios.post).toHaveBeenCalled())

    // The gate opens once the base entry is tracked.
    await waitFor(() => expect(intervalCallback).toBeDefined())

    await act(async () => {
      if (intervalCallback) await intervalCallback()
    })
    await act(async () => {
      if (intervalCallback) await intervalCallback()
    })

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['documents', 'CS101'],
      }),
    )

    // Every status request filters on the tracked repo (base) URL.
    expect(requestBodies.length).toBeGreaterThan(0)
    for (const body of requestBodies) {
      expect(body).toEqual({
        course_name: 'CS101',
        base_urls: ['https://github.com/user/repo'],
      })
    }

    // Ensure at least one additional file entry became complete.
    expect(filesJson()).toContain('"status":"complete"')
  })

  it('shows an error toast and marks the upload errored when scraping fails', async () => {
    const user = userEvent.setup()
    const queryClient = createTestQueryClient()

    const nativeSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => {
      return nativeSetTimeout(fn, 0) as any
    }) as any)
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: any) => {
      cb()
      return 1 as any
    }) as any)
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(
      () => undefined as any,
    )
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const axios = (await import('axios')).default as any
    axios.post.mockRejectedValueOnce(new Error('boom'))

    const { showToast } = await import('~/utils/toastUtils')
    const GitHubIngestForm = (await import('../GitHubIngestForm')).default

    render(<Harness Component={GitHubIngestForm} queryClient={queryClient} />)

    await user.click(screen.getByText(/^GitHub$/i))
    expect(
      await screen.findByText(/Ingest GitHub Website/i),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Enter URL/i), {
      target: { value: 'https://github.com/user/repo' },
    })
    const ingestButton = screen.getByRole('button', {
      name: /Ingest the Website/i,
    })
    await waitFor(() => expect(ingestButton).toBeEnabled())
    await user.click(ingestButton)

    await waitFor(() =>
      expect(showToast as any).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error during web scraping. Please try again.',
          message: 'boom',
          type: 'error',
          autoClose: 12000,
        }),
      ),
    )
    await waitFor(() => expect(filesJson()).toContain('"status":"error"'))
  })
})

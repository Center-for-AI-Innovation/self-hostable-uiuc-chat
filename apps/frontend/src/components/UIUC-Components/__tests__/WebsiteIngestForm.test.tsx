import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'

import { server } from '~/test-utils/server'
import {
  createTestQueryClient,
  renderWithProviders,
} from '~/test-utils/renderWithProviders'

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    post: vi.fn(async () => ({ data: { ok: true } })),
  },
}))

function Harness(props: any) {
  const [files, setFiles] = useState<any[]>(props.initialFiles ?? [])
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

describe('WebsiteIngestForm', () => {
  it('polls ingest status and marks an uploading base URL as ingesting, adding additional URLs', async () => {
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

    server.use(
      http.post('*/api/materialsTable/docsInProgress*', async () => {
        return HttpResponse.json({
          documents: [
            {
              base_url: 'https://example.com',
              url: 'https://example.com/page1',
              readable_filename: 'page1',
            },
            {
              base_url: 'https://example.com',
              url: 'https://example.com/page2',
              readable_filename: 'page2',
            },
          ],
        })
      }),
      http.post('*/api/materialsTable/successDocs*', async () => {
        return HttpResponse.json({ documents: [] })
      }),
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            name: 'https://example.com',
            status: 'uploading',
            type: 'webscrape',
            url: 'https://example.com',
            isBaseUrl: true,
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    expect(setIntervalSpy).toHaveBeenCalled()
    await waitFor(() => {
      const filesJson = screen.getByTestId('files').textContent ?? ''
      expect(filesJson).toContain('"status":"ingesting"')
      expect(filesJson).toContain('https://example.com/page1')
      expect(filesJson).toContain('https://example.com/page2')
    })
  })

  it('surfaces already-completed child URLs from successDocs even when docsInProgress is empty', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((fn: any) => {
      fn()
      return 0 as any
    })

    server.use(
      http.post('*/api/materialsTable/docsInProgress*', async () => {
        return HttpResponse.json({ documents: [] })
      }),
      http.post('*/api/materialsTable/successDocs*', async () => {
        return HttpResponse.json({
          documents: [
            {
              base_url: 'https://example.com',
              url: 'https://example.com/child1',
              readable_filename: 'child1',
            },
            {
              base_url: 'https://example.com',
              url: 'https://example.com/child2',
              readable_filename: 'child2',
            },
          ],
        })
      }),
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            name: 'https://example.com',
            status: 'ingesting',
            type: 'webscrape',
            url: 'https://example.com',
            isBaseUrl: true,
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    await waitFor(() => {
      const filesJson = screen.getByTestId('files').textContent ?? ''
      expect(filesJson).toContain('https://example.com/child1')
      expect(filesJson).toContain('https://example.com/child2')
      expect(filesJson).toContain('"status":"complete"')
    })
  })

  it('matches docs.base_url to the file URL even when trailing slashes differ', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((fn: any) => {
      fn()
      return 0 as any
    })

    server.use(
      http.post('*/api/materialsTable/docsInProgress*', async () => {
        return HttpResponse.json({
          documents: [
            {
              // backend strips trailing slash
              base_url: 'https://example.com',
              url: 'https://example.com/alpha',
              readable_filename: 'alpha',
            },
          ],
        })
      }),
      http.post('*/api/materialsTable/successDocs*', async () => {
        return HttpResponse.json({ documents: [] })
      }),
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            // user entered URL with trailing slash
            name: 'https://example.com/',
            status: 'uploading',
            type: 'webscrape',
            url: 'https://example.com/',
            isBaseUrl: true,
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    await waitFor(() => {
      const filesJson = screen.getByTestId('files').textContent ?? ''
      expect(filesJson).toContain('https://example.com/alpha')
      expect(filesJson).toContain('"status":"ingesting"')
    })
  })

  it('polls ingest status and marks an ingesting file as complete when it shows up in success docs', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((fn: any) => {
      fn()
      return 0 as any
    })

    server.use(
      http.post('*/api/materialsTable/docsInProgress*', async () => {
        return HttpResponse.json({ documents: [] })
      }),
      http.post('*/api/materialsTable/successDocs*', async () => {
        return HttpResponse.json({
          documents: [{ url: 'https://example.com' }],
        })
      }),
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            name: 'https://example.com',
            status: 'ingesting',
            type: 'webscrape',
            url: 'https://example.com',
            isBaseUrl: true,
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    await waitFor(() => {
      const filesJson = screen.getByTestId('files').textContent ?? ''
      expect(filesJson).toContain('"status":"complete"')
    })
  })

  it('does not poll when no webscrape uploads are active', async () => {
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation(((fn: any) => {
        fn()
        return 0
      }) as any)

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            name: 'https://example.com',
            status: 'complete',
            type: 'webscrape',
            url: 'https://example.com',
            isBaseUrl: true,
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('does not refetch the documents table when a tick only discovers more in-progress URLs', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: any) => {
      fn()
      return 0
    }) as any)

    server.use(
      // A live crawl keeps adding in-progress rows. Those are not in the
      // documents table, so refetching it every tick is pure waste — the
      // exact load pattern issue #90 is about.
      http.post('*/api/materialsTable/docsInProgress*', async () => {
        return HttpResponse.json({
          documents: [
            {
              base_url: 'https://example.com',
              url: 'https://example.com/page1',
              readable_filename: 'page1',
            },
          ],
        })
      }),
      http.post('*/api/materialsTable/successDocs*', async () => {
        return HttpResponse.json({ documents: [] })
      }),
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            name: 'https://example.com',
            status: 'ingesting',
            type: 'webscrape',
            url: 'https://example.com',
            isBaseUrl: true,
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    // The new child entry must show up in the toast...
    await waitFor(() => {
      expect(screen.getByTestId('files').textContent ?? '').toContain(
        'https://example.com/page1',
      )
    })

    // ...without triggering the expensive documents refetch.
    expect(
      invalidateSpy.mock.calls.filter(([arg]: any[]) =>
        String(arg?.queryKey?.[0]).startsWith('documents'),
      ),
    ).toHaveLength(0)
  })

  it('does not invalidate queries on a no-change tick', async () => {
    // Capture the tick so it can be awaited, rather than racing a waitFor.
    let tick: (() => Promise<void>) | undefined
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: any) => {
      tick = fn
      return 0
    }) as any)

    server.use(
      // The tracked file is still in progress: nothing changes this tick.
      http.post('*/api/materialsTable/docsInProgress*', async () => {
        return HttpResponse.json({
          documents: [
            {
              base_url: 'https://example.com',
              url: 'https://example.com',
              readable_filename: 'base',
            },
          ],
        })
      }),
      http.post('*/api/materialsTable/successDocs*', async () => {
        return HttpResponse.json({ documents: [] })
      }),
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            name: 'https://example.com',
            status: 'ingesting',
            type: 'webscrape',
            url: 'https://example.com',
            isBaseUrl: true,
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    // Run a full tick, so the assertion can't pass merely because nothing ran.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(tick).toBeDefined()
    if (tick) await tick()

    // Both endpoints answered — the tick did not bail out early.
    expect(
      fetchSpy.mock.calls.filter(([url]) =>
        /materialsTable\/(docsInProgress|successDocs)/.test(String(url)),
      ),
    ).toHaveLength(2)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('keeps filtering on the base URL while children resolve after the base entry went terminal', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: any) => {
      fn()
      return 0
    }) as any)

    const requestBodies: any[] = []
    server.use(
      http.post('*/api/materialsTable/docsInProgress*', async ({ request }) => {
        requestBodies.push(await request.json())
        return HttpResponse.json({ documents: [] })
      }),
      http.post('*/api/materialsTable/successDocs*', async ({ request }) => {
        requestBodies.push(await request.json())
        return HttpResponse.json({
          documents: [
            {
              base_url: 'https://example.com',
              url: 'https://example.com/child1',
              readable_filename: 'child1',
            },
          ],
        })
      }),
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    renderWithProviders(
      <Harness
        Component={WebsiteIngestForm}
        queryClient={queryClient}
        initialFiles={[
          {
            // Base entry already terminal…
            name: 'https://example.com',
            status: 'complete',
            type: 'webscrape',
            url: 'https://example.com',
            isBaseUrl: true,
          },
          {
            // …while a child is still resolving (keeps the gate open).
            name: 'https://example.com/child1',
            status: 'ingesting',
            type: 'webscrape',
            url: 'https://example.com/child1',
          },
        ]}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    await waitFor(() => {
      const filesJson = screen.getByTestId('files').textContent ?? ''
      expect(filesJson).toContain('"status":"complete"')
      expect(requestBodies.length).toBeGreaterThan(0)
    })

    // The filter must be keyed on the BASE entry's URL (children's rows carry
    // it as base_url), not on the child URLs.
    for (const body of requestBodies) {
      expect(body).toEqual({
        course_name: 'CS101',
        base_urls: ['https://example.com'],
      })
    }

    // And the child must have completed via the base_url-filtered results.
    const filesJson = screen.getByTestId('files').textContent ?? ''
    expect(filesJson).not.toContain('"status":"ingesting"')
  })

  it('opens the dialog and starts ingestion via /api/scrapeWeb', async () => {
    const user = userEvent.setup()
    const axiosMod = await import('axios')

    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (fn: any, ms?: any) => {
        if (ms === 8000) {
          fn()
          return 0 as any
        }
        return originalSetTimeout(fn, ms)
      },
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()
    renderWithProviders(
      <WebsiteIngestForm
        project_name="CS101"
        uploadFiles={[]}
        setUploadFiles={vi.fn() as any}
        queryClient={queryClient}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    await user.click(screen.getByText(/Configure import/i))
    await user.type(
      screen.getAllByPlaceholderText('Enter URL...')[0]!,
      'https://example.com',
    )
    await user.click(
      screen.getByRole('button', { name: /Ingest the Website/i }),
    )

    expect((axiosMod as any).default.post).toHaveBeenCalledWith(
      '/api/scrapeWeb',
      expect.objectContaining({
        url: 'https://example.com',
        courseName: 'CS101',
      }),
    )
  })

  it('validates maxUrls and blocks ingest when out of range', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {})
    const axiosMod = await import('axios')

    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (fn: any, ms?: any) => {
        if (ms === 8000) {
          fn()
          return 0 as any
        }
        return originalSetTimeout(fn, ms)
      },
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()

    renderWithProviders(
      <WebsiteIngestForm
        project_name="CS101"
        uploadFiles={[]}
        setUploadFiles={vi.fn() as any}
        queryClient={queryClient}
      />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    await user.click(screen.getByText(/Configure import/i))
    await user.clear(screen.getByPlaceholderText('Default 50'))
    await user.type(screen.getByPlaceholderText('Default 50'), '0')

    expect(
      await screen.findByText(/Max URLs should be between 1 and 500/i),
    ).toBeInTheDocument()

    await user.type(
      screen.getByPlaceholderText('Enter URL...'),
      'https://example.com',
    )
    await user.click(
      screen.getByRole('button', { name: /Ingest the Website/i }),
    )

    expect(alertSpy).toHaveBeenCalledWith('Invalid max URLs input (1 to 500)')
    expect((axiosMod as any).default.post).not.toHaveBeenCalled()
  })

  it('marks a web ingest as error when scraping fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const toastUtils = await import('~/utils/toastUtils')
    const axiosMod = await import('axios')
    ;(axiosMod as any).default.post.mockImplementationOnce(async () => {
      throw new Error('scrape failed')
    })

    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (fn: any, ms?: any) => {
        if (ms === 8000) {
          fn()
          return 0 as any
        }
        return originalSetTimeout(fn, ms)
      },
    )

    const { default: WebsiteIngestForm } = await import('../WebsiteIngestForm')
    const queryClient = createTestQueryClient()

    renderWithProviders(
      <Harness Component={WebsiteIngestForm} queryClient={queryClient} />,
      { homeContext: { dispatch: vi.fn() }, queryClient },
    )

    await user.click(screen.getByText(/Configure import/i))
    await user.clear(screen.getByPlaceholderText('Default 50'))
    await user.type(screen.getByPlaceholderText('Default 50'), '2')
    await user.type(
      screen.getByPlaceholderText('Enter URL...'),
      'https://example.com',
    )
    await user.click(
      screen.getByRole('button', { name: /Ingest the Website/i }),
    )

    await waitFor(() => {
      const filesJson = screen.getByTestId('files').textContent ?? ''
      expect(filesJson).toContain('"status":"error"')
    })

    expect(toastUtils.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error during web scraping. Please try again.',
        message: 'scrape failed',
        type: 'error',
        autoClose: 12000,
      }),
    )
  })
})

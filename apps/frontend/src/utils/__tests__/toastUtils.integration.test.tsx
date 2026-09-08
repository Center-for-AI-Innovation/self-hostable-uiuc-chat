import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { toast } from 'sonner'

import { Toaster } from '@/components/shadcn/ui/sonner'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { showToast, showErrorToast } from '../toastUtils'

// End-to-end: uses the REAL sonner (not mocked) to prove the migrated toastUtils
// actually renders a visible toast through the shadcn <Toaster>. The <Toaster>
// reads the theme from ThemeContext, so mount it the way _app.tsx does.

const renderToaster = () =>
  render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>,
  )

afterEach(() => {
  toast.dismiss()
  cleanup()
})

describe('toastUtils + sonner Toaster (integration)', () => {
  it('renders a toast heading + description through the real Toaster', async () => {
    renderToaster()

    showToast({
      title: 'Saved',
      message: 'Your changes were saved',
      type: 'success',
    })

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(
      await screen.findByText('Your changes were saved'),
    ).toBeInTheDocument()
  })

  it('convenience helper renders the message (no title → message is the heading)', async () => {
    renderToaster()

    showErrorToast('Something failed')

    expect(await screen.findByText('Something failed')).toBeInTheDocument()
  })
})

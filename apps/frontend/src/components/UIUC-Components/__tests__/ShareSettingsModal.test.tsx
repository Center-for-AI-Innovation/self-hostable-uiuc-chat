import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '~/test-utils/renderWithProviders'

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => React.createElement('div', props),
    },
  ),
}))

// Base UI's DropdownMenu drives its open/close state off real CSS animations
// (animationend events), which jsdom never fires. That leaves the popup's
// mount/unmount timing nondeterministic in tests, closing itself moments
// after opening independent of any interaction. This app's tests only need
// to verify that selecting an access-level option calls the right handler,
// not that Base UI's floating popup positions/animates correctly (that's
// covered by Base UI's own test suite) — so render a minimal, always-open
// stand-in instead of the real popup.
vi.mock('@/components/shadcn/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuTrigger: ({ render }: any) => render,
  DropdownMenuContent: ({ children }: any) =>
    React.createElement('div', null, children),
  DropdownMenuRadioGroup: ({ children, onValueChange }: any) =>
    React.createElement(
      'div',
      null,
      React.Children.map(children, (child: any) =>
        React.cloneElement(child, {
          onClick: () => onValueChange(child.props.value),
        }),
      ),
    ),
  DropdownMenuRadioItem: ({ children, onClick }: any) =>
    React.createElement('div', { role: 'menuitemradio', onClick }, children),
  DropdownMenuShortcut: ({ children }: any) =>
    React.createElement('span', null, children),
}))

vi.mock('../EmailListAccordion', () => ({
  default: ({ is_for_admins }: any) =>
    React.createElement(
      'div',
      null,
      is_for_admins ? 'Admins accordion' : 'Members accordion',
    ),
}))

vi.mock('~/utils/apiUtils', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    callSetCourseMetadata: vi.fn(async () => true),
  }
})

describe('ShareSettingsModal', () => {
  it('does not render when closed', async () => {
    const ShareSettingsModal = (await import('../ShareSettingsModal')).default
    renderWithProviders(
      <ShareSettingsModal
        opened={false}
        onClose={vi.fn()}
        projectName="CS101"
        metadata={{ is_private: true, allow_logged_in_users: false } as any}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )
    expect(screen.queryByText(/Share your chatbot/i)).not.toBeInTheDocument()
  })

  it('copies share link and changes access level', async () => {
    const user = userEvent.setup()
    const { callSetCourseMetadata } = await import('~/utils/apiUtils')
    const writeSpy = vi
      .spyOn((navigator as any).clipboard, 'writeText')
      .mockResolvedValue(undefined)

    const ShareSettingsModal = (await import('../ShareSettingsModal')).default
    const onClose = vi.fn()

    renderWithProviders(
      <ShareSettingsModal
        opened={true}
        onClose={onClose}
        projectName="CS101"
        metadata={{ is_private: true, allow_logged_in_users: false } as any}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )

    await user.click(screen.getByRole('button', { name: /Copy share link/i }))
    expect(writeSpy).toHaveBeenCalled()

    // Change to public.
    await user.click(
      screen.getByRole('button', { name: /Change access|Access/i }),
    )
    await user.click(
      await screen.findByText(/Public \(anyone with the link\)/i),
    )

    await waitFor(() =>
      expect(callSetCourseMetadata as any).toHaveBeenCalledWith(
        'CS101',
        expect.objectContaining({
          is_private: false,
          allow_logged_in_users: false,
        }),
      ),
    )

    // Close button works.
    await user.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows member controls when transitioning back to invited access', async () => {
    const user = userEvent.setup()

    const ShareSettingsModal = (await import('../ShareSettingsModal')).default
    renderWithProviders(
      <ShareSettingsModal
        opened={true}
        onClose={vi.fn()}
        projectName="CS101"
        metadata={{ is_private: false, allow_logged_in_users: false } as any}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )

    await user.click(
      screen.getByRole('button', { name: /Change access|Access/i }),
    )
    await user.click(
      screen.getByRole('menuitemradio', {
        name: /Private \(only invited members\)/i,
      }),
    )

    await waitFor(() =>
      expect(screen.getByText(/Members accordion/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/Admins accordion/i)).toBeInTheDocument()
  })
})

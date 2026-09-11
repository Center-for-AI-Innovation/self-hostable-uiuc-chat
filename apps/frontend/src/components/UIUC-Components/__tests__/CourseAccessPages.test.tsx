import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '~/test-utils/renderWithProviders'

vi.mock('../navbars/GlobalHeader', () => ({
  default: () => React.createElement('div', null, 'GlobalHeader'),
}))
vi.mock('../GlobalFooter', () => ({
  default: () => React.createElement('div', null, 'GlobalFooter'),
}))

describe('Course access pages', () => {
  it('CanViewOnlyCourse renders a link to chat and contact emails', async () => {
    const { CanViewOnlyCourse } = await import('../CanViewOnlyCourse')
    renderWithProviders(
      <CanViewOnlyCourse
        course_name="CS101"
        course_metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: ['a@example.com'],
          } as any
        }
      />,
    )

    expect(screen.getByText(/You cannot edit this page/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /uiuc\.chat\/CS101/i }),
    ).toHaveAttribute('href', '/CS101/chat')
    expect(screen.getByText(/owner@example\.com/i)).toBeInTheDocument()
    expect(screen.getByText(/a@example\.com/i)).toBeInTheDocument()
  })
})

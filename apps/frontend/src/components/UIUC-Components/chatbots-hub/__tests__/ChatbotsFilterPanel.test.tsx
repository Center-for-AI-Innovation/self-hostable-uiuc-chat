import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { ChatbotsFilterPanel } from '../ChatbotsFilterPanel'

const baseParams = {} as any

describe('ChatbotsFilterPanel', () => {
  it('renders nothing while collapsed', () => {
    const { container } = renderWithProviders(
      <ChatbotsFilterPanel
        params={baseParams}
        onParamsChange={vi.fn()}
        open={false}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders every category, privacy and my-bots control when open', () => {
    renderWithProviders(
      <ChatbotsFilterPanel params={baseParams} onParamsChange={vi.fn()} open />,
    )
    expect(
      screen.getByRole('region', { name: 'Chatbot filters' }),
    ).toBeInTheDocument()
    for (const label of [
      'Course',
      'Department',
      'Student Org.',
      'Entertainment',
      'Public',
      'Private',
      'Show My Bots',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // One "All" pill per group (category + privacy).
    expect(screen.getAllByRole('button', { name: 'All' })).toHaveLength(2)
  })

  it('selects a category and marks it pressed', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const { rerender } = renderWithProviders(
      <ChatbotsFilterPanel
        params={baseParams}
        onParamsChange={onParamsChange}
        open
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Department' }))
    expect(onParamsChange).toHaveBeenCalledWith({ category: 'Department' })

    rerender(
      <ChatbotsFilterPanel
        params={{ category: 'Department' } as any}
        onParamsChange={onParamsChange}
        open
      />,
    )
    expect(screen.getByRole('button', { name: 'Department' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('clears the category through the "All" pill', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    renderWithProviders(
      <ChatbotsFilterPanel
        params={{ category: 'Course' } as any}
        onParamsChange={onParamsChange}
        open
      />,
    )

    await user.click(screen.getAllByRole('button', { name: 'All' })[0]!)
    expect(onParamsChange).toHaveBeenCalledWith({ category: undefined })
  })

  it('sets and clears the privacy filter', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const { rerender } = renderWithProviders(
      <ChatbotsFilterPanel
        params={baseParams}
        onParamsChange={onParamsChange}
        open
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Private' }))
    expect(onParamsChange).toHaveBeenCalledWith({ privacy: 'private' })

    rerender(
      <ChatbotsFilterPanel
        params={{ privacy: 'private' } as any}
        onParamsChange={onParamsChange}
        open
      />,
    )
    await user.click(screen.getAllByRole('button', { name: 'All' })[1]!)
    expect(onParamsChange).toHaveBeenLastCalledWith({ privacy: undefined })
  })

  it('toggles my-bots on and back off, preserving the other filters', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const { rerender } = renderWithProviders(
      <ChatbotsFilterPanel
        params={{ category: 'Course' } as any}
        onParamsChange={onParamsChange}
        open
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show My Bots' }))
    expect(onParamsChange).toHaveBeenCalledWith({
      category: 'Course',
      my_bots: true,
    })

    rerender(
      <ChatbotsFilterPanel
        params={{ category: 'Course', my_bots: true } as any}
        onParamsChange={onParamsChange}
        open
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Show My Bots' }))
    expect(onParamsChange).toHaveBeenLastCalledWith({
      category: 'Course',
      my_bots: undefined,
    })
  })
})

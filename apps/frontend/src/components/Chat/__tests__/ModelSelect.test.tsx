import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { ProviderNames } from '~/utils/modelProviders/LLMProvider'

// Keep animations lightweight/stable in jsdom.
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

// The real module can pull in WebGPU/WebAssembly details; stub for unit tests.
vi.mock('~/utils/modelProviders/WebLLM', () => ({
  default: class ChatUI {
    isModelLoading() {
      return false
    }
  },
  webLLMModels: [],
}))

vi.mock('../UserSettings', () => ({
  modelCached: [],
}))

describe('getModelDropdownMaxHeight', () => {
  it('uses remaining space below the trigger when that side is larger', async () => {
    const { getModelDropdownMaxHeight } = await import('../ModelSelect')

    expect(
      getModelDropdownMaxHeight({
        triggerRect: { top: 80, bottom: 120 },
        containerRect: { top: 40, bottom: 500 },
      }),
    ).toBe(372)
  })

  it('uses remaining space above the trigger when that side is larger', async () => {
    const { getModelDropdownMaxHeight } = await import('../ModelSelect')

    expect(
      getModelDropdownMaxHeight({
        triggerRect: { top: 420, bottom: 460 },
        containerRect: { top: 40, bottom: 500 },
      }),
    ).toBe(372)
  })

  it('stays inside a short modal instead of overflowing it', async () => {
    const { getModelDropdownMaxHeight } = await import('../ModelSelect')

    // Nest Hub-like: 600px viewport, modal shorter than the old 480px dropdown.
    expect(
      getModelDropdownMaxHeight({
        triggerRect: { top: 180, bottom: 220 },
        containerRect: { top: 40, bottom: 560 },
      }),
    ).toBe(332)

    // Too cramped for a usable list: keep the readable floor and let the modal clip/scroll,
    // rather than collapsing to a sliver (or to 0, which Mantine renders as an empty box).
    expect(
      getModelDropdownMaxHeight({
        triggerRect: { top: 150, bottom: 180 },
        containerRect: { top: 100, bottom: 220 },
      }),
    ).toBe(160)
  })

  it('never returns a height that Mantine renders as an empty dropdown', async () => {
    const { getModelDropdownMaxHeight } = await import('../ModelSelect')

    // Trigger taller than its container — both sides measure negative.
    expect(
      getModelDropdownMaxHeight({
        triggerRect: { top: 100, bottom: 300 },
        containerRect: { top: 120, bottom: 280 },
      }),
    ).toBe(160)
  })

  it('never exceeds the height cap', async () => {
    const { getModelDropdownMaxHeight } = await import('../ModelSelect')

    expect(
      getModelDropdownMaxHeight({
        triggerRect: { top: 40, bottom: 80 },
        containerRect: { top: 0, bottom: 2000 },
      }),
    ).toBe(480)
  })
})

describe('toRemScaledDropdownHeight', () => {
  it('passes pixel heights through unchanged at a 16px root font', async () => {
    const { toRemScaledDropdownHeight } = await import('../ModelSelect')

    expect(toRemScaledDropdownHeight(332, 16)).toBe(332)
  })

  it('shrinks the value so a larger root font still resolves to the measured pixels', async () => {
    const { toRemScaledDropdownHeight } = await import('../ModelSelect')

    // Mantine emits `value / 16` rem, so at a 20px root the prop must be pre-scaled:
    // 265.6 / 16 = 16.6rem, and 16.6rem * 20px = 332px.
    const scaled = toRemScaledDropdownHeight(332, 20)
    expect(scaled).toBeCloseTo(265.6)
    expect((scaled / 16) * 20).toBeCloseTo(332)
  })

  it('falls back to 16px for a bogus root font size', async () => {
    const { toRemScaledDropdownHeight } = await import('../ModelSelect')

    expect(toRemScaledDropdownHeight(332, 0)).toBe(332)
    expect(toRemScaledDropdownHeight(332, Number.NaN)).toBe(332)
  })
})

describe('ModelSelect', () => {
  it('renders and toggles the details accordion', async () => {
    const user = userEvent.setup()
    const { ModelSelect, getModelLogo } = await import('../ModelSelect')

    expect(() => getModelLogo(ProviderNames.OpenAI)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.Ollama)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.WebLLM)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.Anthropic)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.NCSAHosted)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.NCSAHostedVLM)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.Azure)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.Bedrock)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.Gemini)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.SambaNova)).not.toThrow()
    expect(() => getModelLogo(ProviderNames.OpenAICompatible)).not.toThrow()
    expect(getModelLogo('UnknownProvider' as any)).toBe(
      '/media/llm_icons/OpenAI.png',
    )

    const llmProviders: any = {
      [ProviderNames.OpenAI]: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [
          {
            id: 'gpt-4o-mini',
            name: 'GPT-4o mini',
            tokenLimit: 128000,
            enabled: true,
          },
          { id: 'gpt-4o', name: 'GPT-4o', tokenLimit: 128000, enabled: true },
        ],
      },
    }

    renderWithProviders(<ModelSelect chat_ui={{} as any} />, {
      homeState: {
        llmProviders,
        defaultModelId: 'gpt-4o-mini' as any,
        selectedConversation: {
          id: 'c1',
          name: 'Test',
          messages: [],
          model: {
            id: 'gpt-4o-mini',
            name: 'GPT-4o mini',
            tokenLimit: 128000,
            enabled: true,
            provider: ProviderNames.OpenAI,
          },
          prompt: 'p',
          temperature: 0.3,
          folderId: null,
        } as any,
      },
      homeContext: {
        handleUpdateConversation: vi.fn(),
      },
    })

    expect(screen.getByText('Model')).toBeInTheDocument()
    const toggle = screen.getByRole('button', {
      name: /More details about the AI models/i,
    })
    await user.click(toggle)
    // The accordion contains multiple blocks; checking for a stable substring is sufficient.
    expect(
      screen.getByText(/More details about the AI models/i),
    ).toBeInTheDocument()
    await user.click(toggle)
    expect(
      screen.getByText(/More details about the AI models/i),
    ).toBeInTheDocument()
  })

  it('opens a scrollable model list that stays inside the settings modal', async () => {
    const user = userEvent.setup()
    const { ModelSelect } = await import('../ModelSelect')

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (
          this.hasAttribute?.('data-settings-modal') ||
          this.hasAttribute?.('data-settings-modal-body')
        ) {
          return {
            x: 0,
            y: 40,
            top: 40,
            bottom: 520,
            left: 0,
            right: 800,
            width: 800,
            height: 480,
            toJSON: () => ({}),
          } as DOMRect
        }
        return {
          x: 0,
          y: 140,
          top: 140,
          bottom: 180,
          left: 0,
          right: 320,
          width: 320,
          height: 40,
          toJSON: () => ({}),
        } as DOMRect
      },
    )

    const models = Array.from({ length: 20 }, (_, index) => ({
      id: `model-${index}`,
      name: `Model ${index}`,
      tokenLimit: 128000,
      enabled: true,
    }))

    renderWithProviders(
      <div data-settings-modal-body>
        <ModelSelect chat_ui={{} as any} />
      </div>,
      {
        homeState: {
          llmProviders: {
            [ProviderNames.OpenAI]: {
              provider: ProviderNames.OpenAI,
              enabled: true,
              models,
            },
          } as any,
          defaultModelId: 'model-0' as any,
          selectedConversation: {
            id: 'c1',
            name: 'Test',
            messages: [],
            model: {
              id: 'model-0',
              name: 'Model 0',
              tokenLimit: 128000,
              enabled: true,
              provider: ProviderNames.OpenAI,
            },
            prompt: 'p',
            temperature: 0.3,
            folderId: null,
          } as any,
        },
        homeContext: {
          handleUpdateConversation: vi.fn(),
        },
      },
    )

    await user.click(screen.getByRole('searchbox', { name: /select a model/i }))

    const listbox = await screen.findByRole('listbox')
    expect(listbox).toBeInTheDocument()
    expect(screen.getByText('Model 19')).toBeInTheDocument()

    const constrained = listbox.closest('[style*="max-height"]') as HTMLElement
    expect(constrained).toBeTruthy()
    const maxHeightPx =
      Number.parseFloat(constrained.style.maxHeight) *
      (constrained.style.maxHeight.endsWith('rem') ? 16 : 1)
    expect(maxHeightPx).toBeGreaterThan(0)
    expect(maxHeightPx).toBeLessThanOrEqual(332)
  })

  it('renders ModelItem states for WebLLM downloads', async () => {
    const { ModelItem } = await import('../ModelSelect')

    renderWithProviders(
      <ModelItem
        label="Some model"
        downloadSize="100MB"
        modelId="m1"
        selectedModelId="m1"
        modelType={ProviderNames.WebLLM}
        vram_required_MB={1024}
        chat_ui={{} as any}
        loadingModelId="m1"
        setLoadingModelId={() => {}}
      />,
      {
        homeState: {
          webLLMModelIdLoading: { id: 'm1', isLoading: true },
        } as any,
        homeContext: { dispatch: vi.fn() },
      },
    )

    expect(screen.getByText(/loading/i)).toBeInTheDocument()

    const userSettings = await import('../UserSettings')
    ;(userSettings as any).modelCached.push({ id: 'm1' })

    renderWithProviders(
      <ModelItem
        label="Some model"
        downloadSize="100MB"
        modelId="m1"
        selectedModelId="m1"
        modelType={ProviderNames.WebLLM}
        vram_required_MB={1024}
        chat_ui={{} as any}
        loadingModelId={null}
        setLoadingModelId={() => {}}
      />,
      {
        homeState: {
          webLLMModelIdLoading: { id: 'm1', isLoading: false },
        } as any,
        homeContext: { dispatch: vi.fn() },
      },
    )

    expect(screen.getByText(/downloaded/i)).toBeInTheDocument()
  })
})

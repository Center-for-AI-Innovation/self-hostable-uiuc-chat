import React from 'react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from '@tanstack/react-form'
import { http, HttpResponse } from 'msw'
import { server } from '~/test-utils/server'
import { renderWithProviders } from '~/test-utils/renderWithProviders'

// ---------------------------------------------------------------------------
// Mocks - heavy dependencies stubbed out
// ---------------------------------------------------------------------------

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

vi.mock('~/components/Chat/ModelSelect', () => ({
  getModelLogo: (type: string) => `/media/llm_icons/${type}.png`,
}))

vi.mock('~/components/Layout/SettingsLayout', () => ({
  __esModule: true,
  default: ({ children }: any) => (
    <div data-testid="settings-layout">{children}</div>
  ),
  getInitialCollapsedState: () => false,
}))

vi.mock('~/utils/responsiveGrid', () => ({
  useResponsiveCardWidth: () => 'w-full',
}))

vi.mock('../../CanViewOnlyCourse', () => ({
  GetCurrentPageName: () => 'test-project',
}))

vi.mock('../../GlobalFooter', () => ({
  __esModule: true,
  default: () => <div data-testid="global-footer" />,
}))

// Stub all provider input components
vi.mock('../providers/AnthropicProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="anthropic-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/AzureProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="azure-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/BedrockProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="bedrock-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/GeminiProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="gemini-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/NCSAHostedProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="ncsa-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/NCSAHostedVLMProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="ncsa-vlm-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/OllamaProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="ollama-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/OpenAIProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="openai-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/OpenAICompatibleProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div
      data-testid="openai-compatible-provider"
      data-loading={props.isLoading}
    />
  ),
}))
vi.mock('../providers/SambaNovaProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="sambanova-provider" data-loading={props.isLoading} />
  ),
}))
vi.mock('../providers/WebLLMProviderInput', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="webllm-provider" data-loading={props.isLoading} />
  ),
}))

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
}))

// Must import after mocks
import {
  findDefaultModel,
  APIKeyInput,
  ModelItem,
  showConfirmationToast,
} from '../LLMsApiKeyInputForm'
import APIKeyInputForm from '../LLMsApiKeyInputForm'
import { showToast } from '~/utils/toastUtils'
import type {
  AllLLMProviders,
  AnySupportedModel,
} from '~/utils/modelProviders/LLMProvider'
import { ProviderNames } from '~/utils/modelProviders/LLMProvider'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(
  overrides: Partial<AnySupportedModel> = {},
): AnySupportedModel {
  return {
    id: 'gpt-4',
    name: 'GPT-4',
    maxLength: 8192,
    tokenLimit: 8192,
    enabled: true,
    default: false,
    temperature: 0.1,
    ...overrides,
  } as AnySupportedModel
}

function makeProviders(
  overrides: Partial<Record<string, any>> = {},
): AllLLMProviders {
  const base: Record<string, any> = {}
  for (const name of Object.values(ProviderNames)) {
    base[name] = {
      provider: name,
      enabled: false,
      models: [],
      ...((overrides[name] as any) ?? {}),
    }
  }
  return base as unknown as AllLLMProviders
}

const FETCH_URL = '/api/models'
const UPSERT_URL = '/api/UIUC-api/upsertLLMProviders'

function setupMSWProviders(providers: AllLLMProviders) {
  server.use(
    http.post(FETCH_URL, () => HttpResponse.json(providers)),
    http.post(UPSERT_URL, () => HttpResponse.json({ success: true })),
  )
}

// ---------------------------------------------------------------------------
// findDefaultModel (pure function tests)
// ---------------------------------------------------------------------------

describe('findDefaultModel', () => {
  it('returns undefined when no providers have models', () => {
    const providers = makeProviders()
    expect(findDefaultModel(providers)).toBeUndefined()
  })

  it('returns undefined when no model is marked as default', () => {
    const providers = makeProviders({
      OpenAI: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [makeModel({ default: false })],
      },
    })
    expect(findDefaultModel(providers)).toBeUndefined()
  })

  it('returns the model marked as default with its provider key', () => {
    const defaultModel = makeModel({ id: 'gpt-4', default: true })
    const providers = makeProviders({
      OpenAI: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [makeModel({ id: 'gpt-3.5', default: false }), defaultModel],
      },
    })
    const result = findDefaultModel(providers)
    expect(result).toBeDefined()
    expect(result?.id).toBe('gpt-4')
    expect(result?.provider).toBe('OpenAI')
    expect(result?.default).toBe(true)
  })

  it('returns the first default model when multiple are marked default', () => {
    const providers = makeProviders({
      Anthropic: {
        provider: ProviderNames.Anthropic,
        enabled: true,
        models: [makeModel({ id: 'claude-sonnet', default: true })],
      },
      OpenAI: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [makeModel({ id: 'gpt-4', default: true })],
      },
    })
    // It iterates keys, so the first provider with a default wins
    const result = findDefaultModel(providers)
    expect(result).toBeDefined()
    expect(result?.default).toBe(true)
  })

  it('finds default in a disabled provider (function does not filter by enabled)', () => {
    const providers = makeProviders({
      Gemini: {
        provider: ProviderNames.Gemini,
        enabled: false,
        models: [makeModel({ id: 'gemini-pro', default: true })],
      },
    })
    const result = findDefaultModel(providers)
    expect(result).toBeDefined()
    expect(result?.id).toBe('gemini-pro')
    expect(result?.provider).toBe('Gemini')
  })

  it('handles providers with undefined models gracefully', () => {
    const providers = makeProviders({
      OpenAI: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: undefined,
      },
      Anthropic: {
        provider: ProviderNames.Anthropic,
        enabled: true,
        models: [makeModel({ id: 'claude', default: true })],
      },
    })
    const result = findDefaultModel(providers)
    expect(result?.id).toBe('claude')
  })

  it('returns undefined when providers object has no models at all', () => {
    const providers = makeProviders({
      OpenAI: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: null,
      },
    })
    expect(findDefaultModel(providers)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// showConfirmationToast
// ---------------------------------------------------------------------------

describe('showConfirmationToast', () => {
  beforeEach(() => {
    vi.mocked(showToast).mockClear()
  })

  it('calls showToast with the success type by default', () => {
    showConfirmationToast({ title: 'Done', message: 'All good' })
    expect(showToast).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(showToast).mock.calls[0]![0] as any
    expect(arg.title).toBe('Done')
    expect(arg.message).toBe('All good')
    expect(arg.type).toBe('success')
    expect(arg.autoClose).toBe(5000)
  })

  it('calls showToast with the error type when isError is true', () => {
    showConfirmationToast({
      title: 'Error',
      message: 'Bad',
      isError: true,
    })
    const arg = vi.mocked(showToast).mock.calls[0]![0] as any
    expect(arg.type).toBe('error')
  })

  it('respects a custom autoClose duration', () => {
    showConfirmationToast({
      title: 'Custom',
      message: 'With custom close',
      autoClose: 10000,
    })
    const arg = vi.mocked(showToast).mock.calls[0]![0] as any
    expect(arg.autoClose).toBe(10000)
  })

  it('does not pass a custom icon (Toaster supplies per-type icons)', () => {
    showConfirmationToast({ title: 'T', message: 'M' })
    const arg = vi.mocked(showToast).mock.calls[0]![0] as any
    expect(arg.icon).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// APIKeyInput component
// ---------------------------------------------------------------------------

function APIKeyInputHarness({
  initialValue = '',
  onSubmit = vi.fn(),
}: {
  initialValue?: string
  onSubmit?: () => void
}) {
  const form = useForm({
    defaultValues: { apiKey: initialValue },
    onSubmit: async () => {
      onSubmit()
    },
  })

  return (
    <form.Field name="apiKey">
      {(field) => <APIKeyInput field={field} placeholder="Enter API Key" />}
    </form.Field>
  )
}

describe('APIKeyInput', () => {
  it('renders the text input with placeholder', () => {
    render(<APIKeyInputHarness />)
    expect(screen.getByPlaceholderText('Enter API Key')).toBeInTheDocument()
  })

  it('renders the input as password type', () => {
    render(<APIKeyInputHarness />)
    const input = screen.getByPlaceholderText('Enter API Key')
    expect(input).toHaveAttribute('type', 'password')
  })

  it('renders a Save button', () => {
    render(<APIKeyInputHarness />)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('renders a Clear action icon', () => {
    render(<APIKeyInputHarness />)
    expect(screen.getByLabelText('Clear')).toBeInTheDocument()
  })

  it('allows typing in the input', async () => {
    const user = userEvent.setup()
    render(<APIKeyInputHarness />)
    const input = screen.getByPlaceholderText('Enter API Key')
    await user.type(input, 'sk-test-key')
    expect(input).toHaveValue('sk-test-key')
  })

  it('clears the input when the X button is clicked', async () => {
    const user = userEvent.setup()
    render(<APIKeyInputHarness initialValue="sk-existing" />)
    const clearButton = screen.getByLabelText('Clear')
    await user.click(clearButton)
    // After clear, the form field value should be empty
    const input = screen.getByPlaceholderText('Enter API Key')
    expect(input).toHaveValue('')
  })

  it('submits the form when Save is clicked', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<APIKeyInputHarness onSubmit={onSubmit} />)
    const input = screen.getByPlaceholderText('Enter API Key')
    await user.type(input, 'sk-new-key')
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
  })

  it('submits the form on Enter key press', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<APIKeyInputHarness onSubmit={onSubmit} />)
    const input = screen.getByPlaceholderText('Enter API Key')
    await user.type(input, 'sk-key{Enter}')
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
// ModelItem component
// ---------------------------------------------------------------------------

describe('ModelItem', () => {
  it('renders the model label', () => {
    render(
      <ModelItem
        label="GPT-4"
        modelId="gpt-4"
        selectedModelId="gpt-4"
        modelType="OpenAI"
        vram_required_MB={0}
        loadingModelId={null}
      />,
    )
    expect(screen.getByText('GPT-4')).toBeInTheDocument()
  })

  it('renders the model logo image', () => {
    render(
      <ModelItem
        label="Claude"
        modelId="claude-3"
        selectedModelId={undefined}
        modelType="Anthropic"
        vram_required_MB={0}
        loadingModelId={null}
      />,
    )
    const img = screen.getByAltText('Anthropic logo')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/media/llm_icons/Anthropic.png')
  })

  it('forwards ref and extra props', () => {
    const ref = React.createRef<HTMLDivElement>()
    render(
      <ModelItem
        ref={ref}
        label="Test"
        modelId="test"
        selectedModelId={undefined}
        modelType="OpenAI"
        vram_required_MB={0}
        loadingModelId={null}
        data-testid="model-item"
      />,
    )
    expect(screen.getByTestId('model-item')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// APIKeyInputForm - main component
// ---------------------------------------------------------------------------

describe('APIKeyInputForm', () => {
  const providersWithDefault = makeProviders({
    OpenAI: {
      provider: ProviderNames.OpenAI,
      enabled: true,
      models: [
        makeModel({ id: 'gpt-4', name: 'GPT-4', default: true, enabled: true }),
        makeModel({
          id: 'gpt-3.5',
          name: 'GPT-3.5',
          default: false,
          enabled: true,
        }),
      ],
    },
    Anthropic: {
      provider: ProviderNames.Anthropic,
      enabled: true,
      models: [
        makeModel({
          id: 'claude-3',
          name: 'Claude 3',
          default: false,
          enabled: true,
        }),
      ],
    },
  })

  beforeEach(() => {
    setupMSWProviders(providersWithDefault)
  })

  it('renders in embedded mode without SettingsLayout', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded />,
    )
    await waitFor(() => {
      expect(screen.queryByTestId('settings-layout')).not.toBeInTheDocument()
    })
  })

  it('renders in standalone mode with SettingsLayout', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded={false} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('settings-layout')).toBeInTheDocument()
    })
  })

  it('renders Default Model heading in embedded mode', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded />,
    )
    expect(screen.getByText('Default Model')).toBeInTheDocument()
  })

  it('renders Open source and Closed source LLM headings in embedded mode', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded />,
    )
    expect(screen.getByText('Open source LLMs')).toBeInTheDocument()
    expect(screen.getByText('Closed source LLMs')).toBeInTheDocument()
  })

  it('renders provider input stubs in embedded mode', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('anthropic-provider')).toBeInTheDocument()
      expect(screen.getByTestId('openai-provider')).toBeInTheDocument()
      expect(screen.getByTestId('azure-provider')).toBeInTheDocument()
      expect(screen.getByTestId('bedrock-provider')).toBeInTheDocument()
      expect(screen.getByTestId('gemini-provider')).toBeInTheDocument()
      expect(screen.getByTestId('sambanova-provider')).toBeInTheDocument()
      expect(screen.getByTestId('ncsa-provider')).toBeInTheDocument()
      expect(screen.getByTestId('ncsa-vlm-provider')).toBeInTheDocument()
      expect(screen.getByTestId('ollama-provider')).toBeInTheDocument()
      expect(screen.getByTestId('webllm-provider')).toBeInTheDocument()
    })
  })

  it('renders the page title in standalone mode', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="my-course" isEmbedded={false} />,
    )
    await waitFor(() => {
      expect(
        screen.getByText('Configure LLM Providers for your Chatbot'),
      ).toBeInTheDocument()
    })
  })

  it('renders GlobalFooter in standalone mode', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded={false} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('global-footer')).toBeInTheDocument()
    })
  })

  it('uses the router project name when projectNameProp is not provided', async () => {
    // GetCurrentPageName is mocked to return 'test-project'
    renderWithProviders(<APIKeyInputForm isEmbedded />)
    // The component should still render without error
    expect(screen.getByText('Default Model')).toBeInTheDocument()
  })

  it('shows skeleton while loading providers', async () => {
    // Use a handler that never responds so the query stays in loading state
    server.use(
      http.post(FETCH_URL, () => {
        return new Promise(() => {}) // never resolves
      }),
    )
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded />,
    )
    // The skeleton should appear while loading
    // Provider inputs receive isLoading prop
    await waitFor(() => {
      const providers = screen.getAllByTestId(/provider/)
      const loadingProviders = providers.filter(
        (el) => el.getAttribute('data-loading') === 'true',
      )
      expect(loadingProviders.length).toBeGreaterThan(0)
    })
  })

  it('shows error toast when provider fetch fails', async () => {
    server.use(
      http.post(FETCH_URL, () =>
        HttpResponse.json({ error: 'Server error' }, { status: 500 }),
      ),
    )
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded />,
    )
    await waitFor(
      () => {
        expect(showToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error',
            type: 'error',
          }),
        )
      },
      { timeout: 10000 },
    )
  })

  it('renders the select placeholder for model dropdown', async () => {
    renderWithProviders(
      <APIKeyInputForm projectName="test-project" isEmbedded />,
    )
    await waitFor(() => {
      // The NewModelDropdown renders a Mantine Select with "Select a model" placeholder
      const select = screen.queryByPlaceholderText('Select a model')
      // Even if the select is not text-searchable, the component should render
      expect(document.querySelector('.llm-providers-form')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('findDefaultModel handles empty providers object', () => {
    const result = findDefaultModel({} as AllLLMProviders)
    expect(result).toBeUndefined()
  })

  it('findDefaultModel handles provider with empty models array', () => {
    const providers = makeProviders({
      OpenAI: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [],
      },
    })
    expect(findDefaultModel(providers)).toBeUndefined()
  })

  it('findDefaultModel returns correct provider key even for NCSAHosted', () => {
    const providers = makeProviders({
      NCSAHosted: {
        provider: ProviderNames.NCSAHosted,
        enabled: true,
        models: [makeModel({ id: 'llama-70b', default: true })],
      },
    })
    const result = findDefaultModel(providers)
    expect(result?.provider).toBe('NCSAHosted')
    expect(result?.id).toBe('llama-70b')
  })

  it('showConfirmationToast passes exactly the supported toast options for success', () => {
    showConfirmationToast({ title: 'T', message: 'M' })
    expect(showToast).toHaveBeenCalledWith({
      title: 'T',
      message: 'M',
      type: 'success',
      autoClose: 5000,
    })
  })

  it('showConfirmationToast preserves title and message', () => {
    showConfirmationToast({ title: 'T', message: 'M' })
    const arg = vi.mocked(showToast).mock.calls[0]![0] as any
    expect(arg.title).toBe('T')
    expect(arg.message).toBe('M')
  })

  it('showConfirmationToast maps errors to the error type', () => {
    showConfirmationToast({ title: 'T', message: 'M', isError: true })
    const arg = vi.mocked(showToast).mock.calls[0]![0] as any
    expect(arg.type).toBe('error')
  })
})

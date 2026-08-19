import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => {
  return {
    redisGet: vi.fn(),
  }
})

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: async () => ({ get: hoisted.redisGet }),
}))

import { encryptKeyIfNeeded } from '~/utils/crypto'
import {
  OPENAI_ROUTER_MODEL_ID,
  getToolRouterStatus,
  resolveToolRouter,
} from '../toolRouting'

const PROJECT = 'CS101'

function storeProviders(providers: any) {
  hoisted.redisGet.mockResolvedValue(JSON.stringify(providers))
}

const COMPAT_PROVIDER = {
  provider: 'OpenAICompatible',
  enabled: true,
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'compat-key',
  models: [
    { id: 'Org/Compat-Model', enabled: true },
    { id: 'Org/Disabled-Model', enabled: false },
  ],
}

const ORIGINAL_ENV = { ...process.env }

describe('resolveToolRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.redisGet.mockResolvedValue(null)
    process.env.NEXT_PUBLIC_SIGNING_KEY = 'test-signing-key'
    delete process.env.NCSA_HOSTED_VLM_BASE_URL
    delete process.env.NCSA_HOSTED_API_KEY
    delete process.env.TOOL_ROUTER_MODEL_ID
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('is offline when nothing is configured', async () => {
    const result = await resolveToolRouter({ projectName: PROJECT })
    expect(result.source).toBe('offline')
    if (result.source === 'offline') {
      expect(result.reason).toContain('configured')
    }
  })

  it('uses the compat provider when the selected model belongs to it, even with an OpenAI key present', async () => {
    storeProviders({
      OpenAI: { provider: 'OpenAI', enabled: true, apiKey: 'sk-project' },
      OpenAICompatible: COMPAT_PROVIDER,
    })
    const result = await resolveToolRouter({
      projectName: PROJECT,
      clientOpenAIKey: 'sk-client',
      selectedModelId: 'org/compat-model', // case-insensitive match
    })
    expect(result).toMatchObject({
      source: 'custom',
      provider: 'OpenAICompatible',
      endpointUrl: 'https://compat.example.com/v1/chat/completions',
      apiKey: 'compat-key',
      modelId: 'org/compat-model',
    })
    expect((result as any).extraHeaders).toBeUndefined()
  })

  it('skips the compat tier for disabled models and non-member models', async () => {
    storeProviders({ OpenAICompatible: COMPAT_PROVIDER })
    for (const selectedModelId of ['Org/Disabled-Model', 'Qwen/Other']) {
      const result = await resolveToolRouter({
        projectName: PROJECT,
        selectedModelId,
      })
      expect(result.source).toBe('offline')
    }
  })

  it('lowercases the model and adds headers for OpenRouter base URLs', async () => {
    storeProviders({
      OpenAICompatible: {
        ...COMPAT_PROVIDER,
        baseUrl: 'https://openrouter.ai/api/v1/',
        models: [{ id: 'Org/Compat-Model', enabled: true }],
      },
    })
    const result = await resolveToolRouter({
      projectName: PROJECT,
      selectedModelId: 'Org/Compat-Model',
    })
    expect(result).toMatchObject({
      source: 'custom',
      endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
      modelId: 'org/compat-model',
      extraHeaders: {
        'HTTP-Referer': 'https://chat.illinois.edu',
        'X-Title': 'Illinois Chat',
      },
    })
  })

  it('uses the client OpenAI key with the fixed router model', async () => {
    const result = await resolveToolRouter({
      projectName: PROJECT,
      clientOpenAIKey: 'sk-personal',
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(result).toMatchObject({
      source: 'custom',
      provider: 'OpenAI',
      endpointUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'sk-personal',
      modelId: OPENAI_ROUTER_MODEL_ID,
    })
  })

  it('decrypts an encrypted client key before use', async () => {
    const encrypted = await encryptKeyIfNeeded('sk-project-secret')
    expect(encrypted).toMatch(/^v1\./)
    const result = await resolveToolRouter({
      projectName: PROJECT,
      clientOpenAIKey: encrypted,
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(result).toMatchObject({
      source: 'custom',
      provider: 'OpenAI',
      apiKey: 'sk-project-secret',
    })
  })

  it('uses the stored OpenAI key only while the provider is enabled', async () => {
    storeProviders({
      OpenAI: { provider: 'OpenAI', enabled: false, apiKey: 'sk-disabled' },
    })
    const disabled = await resolveToolRouter({
      projectName: PROJECT,
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(disabled.source).toBe('offline')

    storeProviders({
      OpenAI: { provider: 'OpenAI', enabled: true, apiKey: 'sk-enabled' },
    })
    const enabled = await resolveToolRouter({
      projectName: PROJECT,
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(enabled).toMatchObject({ source: 'custom', apiKey: 'sk-enabled' })
  })

  it('ignores empty and whitespace-only keys', async () => {
    storeProviders({
      OpenAI: { provider: 'OpenAI', enabled: true, apiKey: '   ' },
    })
    const result = await resolveToolRouter({
      projectName: PROJECT,
      clientOpenAIKey: '  ',
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(result.source).toBe('offline')
  })

  it('falls to the NCSA default tier when no custom key resolves', async () => {
    process.env.NCSA_HOSTED_VLM_BASE_URL = 'https://vllm.example.edu/v1/'
    process.env.NCSA_HOSTED_API_KEY = 'ncsa-key'
    const result = await resolveToolRouter({
      projectName: PROJECT,
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(result).toMatchObject({
      source: 'default',
      provider: 'NCSAHostedVLM',
      // trailing slash on the env value is stripped
      endpointUrl: 'https://vllm.example.edu/v1/chat/completions',
      apiKey: 'ncsa-key',
      modelId: 'Qwen/Qwen3.6-27B',
    })
  })

  it('honors TOOL_ROUTER_MODEL_ID for the default tier', async () => {
    process.env.NCSA_HOSTED_VLM_BASE_URL = 'https://vllm.example.edu/v1'
    process.env.TOOL_ROUTER_MODEL_ID = 'Qwen/Custom-Router'
    const result = await resolveToolRouter({ projectName: PROJECT })
    expect(result).toMatchObject({
      source: 'default',
      modelId: 'Qwen/Custom-Router',
    })
  })

  it('skips a tier whose stored key cannot be decrypted and continues the chain', async () => {
    // Encrypt under a different signing key, then restore the test key so
    // decryption of this ciphertext throws.
    process.env.NEXT_PUBLIC_SIGNING_KEY = 'some-other-signing-key'
    const foreignCiphertext = await encryptKeyIfNeeded('sk-unreachable')
    process.env.NEXT_PUBLIC_SIGNING_KEY = 'test-signing-key'

    storeProviders({
      OpenAI: {
        provider: 'OpenAI',
        enabled: true,
        apiKey: foreignCiphertext,
      },
    })
    process.env.NCSA_HOSTED_VLM_BASE_URL = 'https://vllm.example.edu/v1'

    const result = await resolveToolRouter({
      projectName: PROJECT,
      selectedModelId: 'Qwen/Qwen3.6-27B',
    })
    expect(result).toMatchObject({ source: 'default' })
  })

  it('propagates a Redis read failure', async () => {
    hoisted.redisGet.mockRejectedValue(new Error('redis down'))
    await expect(resolveToolRouter({ projectName: PROJECT })).rejects.toThrow(
      'redis down',
    )
  })
})

describe('getToolRouterStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.redisGet.mockResolvedValue(null)
    delete process.env.NCSA_HOSTED_VLM_BASE_URL
    delete process.env.TOOL_ROUTER_MODEL_ID
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('reports custom for an enabled OpenAI key', async () => {
    storeProviders({
      OpenAI: { provider: 'OpenAI', enabled: true, apiKey: 'sk-x' },
    })
    expect(await getToolRouterStatus(PROJECT)).toEqual({
      status: 'custom',
      provider: 'OpenAI',
    })
  })

  it('reports custom for a compat provider with enabled models', async () => {
    storeProviders({ OpenAICompatible: COMPAT_PROVIDER })
    expect(await getToolRouterStatus(PROJECT)).toEqual({
      status: 'custom',
      provider: 'OpenAICompatible',
    })
  })

  it('does not report custom for a compat provider with no enabled models', async () => {
    storeProviders({
      OpenAICompatible: { ...COMPAT_PROVIDER, models: [] },
    })
    process.env.NCSA_HOSTED_VLM_BASE_URL = 'https://vllm.example.edu/v1'
    expect((await getToolRouterStatus(PROJECT)).status).toBe('default')
  })

  it('reports default with the router model when only NCSA is configured', async () => {
    process.env.NCSA_HOSTED_VLM_BASE_URL = 'https://vllm.example.edu/v1'
    process.env.TOOL_ROUTER_MODEL_ID = 'Qwen/Custom-Router'
    expect(await getToolRouterStatus(PROJECT)).toEqual({
      status: 'default',
      provider: 'NCSAHostedVLM',
      model: 'Qwen/Custom-Router',
    })
  })

  it('reports offline with a reason when nothing is configured', async () => {
    const status = await getToolRouterStatus(PROJECT)
    expect(status.status).toBe('offline')
    expect(status.reason).toBeTruthy()
  })
})

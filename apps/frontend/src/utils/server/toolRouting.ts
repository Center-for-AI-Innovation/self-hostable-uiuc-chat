// Server-only resolution of the "tool router" — the LLM that receives the
// conversation plus tool schemas and decides which Sim workflows to invoke.
// The router is independent of the chat model (tool outputs reach the chat
// model as plain text), so resolution is a credential/config decision:
//
//   1. Custom / OpenAI-compatible — only when the selected model belongs to the
//      project's OpenAI-compatible provider, which keeps those conversations on
//      the endpoint (and biller) they already use today.
//   2. Custom / OpenAI — the client-resolved key (project or personal) or the
//      project's stored OpenAI key.
//   3. Default / NCSA-hosted vLLM — env-configured fixed router model.
//   4. Offline.
//
// A compat-only project chatting with a non-compat model intentionally falls to
// the NCSA default: routing through an arbitrary compat model would be a guess
// about its tool-call support, while the default router is known-good. If the
// NCSA env is also unset (self-hosted), routing is offline even though a compat
// provider exists.
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { type AllLLMProviders } from '~/utils/modelProviders/LLMProvider'
import { CURRENT_NCSA_DEFAULT_MODEL_ID } from '~/utils/modelProviders/types/NCSAHostedVLM'
import { decryptKeyIfNeeded } from '~/utils/crypto'
import { ensureRedisConnected } from '~/utils/redisClient'

export const OPENAI_ROUTER_MODEL_ID = 'gpt-4.1'

export interface ResolvedToolRouter {
  source: 'custom' | 'default'
  provider: 'OpenAI' | 'OpenAICompatible' | 'NCSAHostedVLM'
  endpointUrl: string
  apiKey: string
  modelId: string
  extraHeaders?: Record<string, string>
}

export type ToolRouterResolution =
  | ResolvedToolRouter
  | { source: 'offline'; reason: string }

export interface ToolRouterStatus {
  status: 'custom' | 'default' | 'offline'
  provider?: 'OpenAI' | 'OpenAICompatible' | 'NCSAHostedVLM'
  model?: string
  reason?: string
}

const OFFLINE_REASON =
  'No OpenAI key, OpenAI-compatible provider, or hosted default router is configured for this project.'

async function readStoredProviders(
  projectName: string,
): Promise<AllLLMProviders | null> {
  const redisClient = await ensureRedisConnected()
  const redisValue = await redisClient.get(`${projectName}-llms`)
  if (!redisValue) return null
  return JSON.parse(redisValue) as AllLLMProviders
}

// A tier whose stored key cannot be decrypted (e.g. it was encrypted under a
// rotated NEXT_PUBLIC_SIGNING_KEY) is skipped so the chain can continue.
async function tryDecrypt(key: string, tier: string): Promise<string | null> {
  try {
    return await decryptKeyIfNeeded(key)
  } catch (error) {
    console.error(
      `Tool router: failed to decrypt ${tier} key, skipping tier:`,
      error,
    )
    return null
  }
}

function isOpenRouterBaseUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    return hostname === 'openrouter.ai' || hostname.endsWith('.openrouter.ai')
  } catch {
    return false
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function compatProviderConfigured(llmProviders: AllLLMProviders | null) {
  const compat = llmProviders?.OpenAICompatible
  if (!compat?.enabled) return null
  const baseUrl = compat.baseUrl?.trim()
  const apiKey = compat.apiKey?.trim()
  if (!baseUrl || !apiKey) return null
  return { compat, baseUrl, apiKey }
}

function compatEnabledModelIds(llmProviders: AllLLMProviders | null): string[] {
  return (llmProviders?.OpenAICompatible?.models || [])
    .filter((m) => m.enabled)
    .map((m) => m.id)
}

export async function resolveToolRouter(params: {
  projectName: string
  clientOpenAIKey?: string
  selectedModelId?: string
}): Promise<ToolRouterResolution> {
  const { projectName, clientOpenAIKey, selectedModelId } = params
  const llmProviders = await readStoredProviders(projectName)

  // Tier 1: the project's OpenAI-compatible provider, only for its own models.
  const compatConfig = compatProviderConfigured(llmProviders)
  if (compatConfig && selectedModelId) {
    const isCompatModel = compatEnabledModelIds(llmProviders).some(
      (id) => id.toLowerCase() === selectedModelId.toLowerCase(),
    )
    if (isCompatModel) {
      const apiKey = await tryDecrypt(compatConfig.apiKey, 'OpenAI-compatible')
      if (apiKey !== null) {
        const isOpenRouter = isOpenRouterBaseUrl(compatConfig.baseUrl)
        return {
          source: 'custom',
          provider: 'OpenAICompatible',
          endpointUrl: `${stripTrailingSlash(compatConfig.baseUrl)}/chat/completions`,
          apiKey,
          modelId: isOpenRouter
            ? selectedModelId.toLowerCase()
            : selectedModelId,
          ...(isOpenRouter
            ? {
                extraHeaders: {
                  'HTTP-Referer': 'https://chat.illinois.edu',
                  'X-Title': 'Illinois Chat',
                },
              }
            : {}),
        }
      }
    }
  }

  // Tier 2: an OpenAI key — the client-resolved one (project or personal), else
  // the stored project key. The stored key only counts while the provider is
  // enabled; the client-sent key is honored as the caller's explicit choice.
  // Project keys arrive in their encrypted v1.* form either way.
  const candidateOpenAIKeys: Array<{ key?: string; requireEnabled: boolean }> =
    [
      { key: clientOpenAIKey?.trim(), requireEnabled: false },
      { key: llmProviders?.OpenAI?.apiKey?.trim(), requireEnabled: true },
    ]
  for (const candidate of candidateOpenAIKeys) {
    if (!candidate.key) continue
    if (candidate.requireEnabled && !llmProviders?.OpenAI?.enabled) continue
    const apiKey = await tryDecrypt(candidate.key, 'OpenAI')
    if (apiKey === null || !apiKey.trim()) continue
    return {
      source: 'custom',
      provider: 'OpenAI',
      endpointUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey,
      modelId: OPENAI_ROUTER_MODEL_ID,
    }
  }

  // Tier 3: the NCSA-hosted vLLM default router (base URL already includes /v1).
  const ncsaBaseUrl = process.env.NCSA_HOSTED_VLM_BASE_URL?.trim()
  if (ncsaBaseUrl) {
    return {
      source: 'default',
      provider: 'NCSAHostedVLM',
      endpointUrl: `${stripTrailingSlash(ncsaBaseUrl)}/chat/completions`,
      apiKey: process.env.NCSA_HOSTED_API_KEY ?? '',
      modelId:
        process.env.TOOL_ROUTER_MODEL_ID || CURRENT_NCSA_DEFAULT_MODEL_ID,
    }
  }

  return { source: 'offline', reason: OFFLINE_REASON }
}

// Project-level status for the tools page. Never sees client/personal keys and
// never returns credentials or endpoints.
export async function getToolRouterStatus(
  projectName: string,
): Promise<ToolRouterStatus> {
  const llmProviders = await readStoredProviders(projectName)

  if (llmProviders?.OpenAI?.enabled && llmProviders.OpenAI.apiKey?.trim()) {
    return { status: 'custom', provider: 'OpenAI' }
  }

  // A compat provider with no usable models never actually routes, so it must
  // not report "custom".
  if (
    compatProviderConfigured(llmProviders) &&
    compatEnabledModelIds(llmProviders).length > 0
  ) {
    return { status: 'custom', provider: 'OpenAICompatible' }
  }

  if (process.env.NCSA_HOSTED_VLM_BASE_URL?.trim()) {
    return {
      status: 'default',
      provider: 'NCSAHostedVLM',
      model: process.env.TOOL_ROUTER_MODEL_ID || CURRENT_NCSA_DEFAULT_MODEL_ID,
    }
  }

  return { status: 'offline', reason: OFFLINE_REASON }
}

export async function callToolRouter(params: {
  router: ResolvedToolRouter
  messages: ChatCompletionMessageParam[]
  tools: ChatCompletionTool[]
  signal?: AbortSignal
}): Promise<
  | { ok: true; toolCalls: ChatCompletionMessageToolCall[]; content: string }
  | { ok: false; error: string; status?: number }
> {
  const { router, messages, tools, signal } = params
  try {
    const response = await fetch(router.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${router.apiKey}`,
        ...router.extraHeaders,
      },
      body: JSON.stringify({
        model: router.modelId,
        messages,
        tools,
        stream: false,
      }),
      signal,
    })

    if (!response.ok) {
      let errorBody = ''
      try {
        errorBody = await response.text()
      } catch {}
      console.error(
        `Tool router error (${router.provider}):`,
        response.status,
        response.statusText,
        errorBody,
      )
      return {
        ok: false,
        error: `Tool router error: ${response.status}`,
        status: response.status,
      }
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message
    if (!message) {
      return {
        ok: false,
        error: `No response from tool router (${router.provider})`,
      }
    }
    return {
      ok: true,
      toolCalls: (message.tool_calls || []) as ChatCompletionMessageToolCall[],
      content: message.content || '',
    }
  } catch (error) {
    if (signal?.aborted) {
      return { ok: false, error: 'Tool router request aborted' }
    }
    console.error(`Tool router request failed (${router.provider}):`, error)
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Tool router request failed',
    }
  }
}

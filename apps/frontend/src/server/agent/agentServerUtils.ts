// src/server/agent/agentServerUtils.ts
// Server-side utilities for agent mode - direct function calls instead of API requests

import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import {
  type Conversation,
  type UIUCTool,
  type ContextWithMetadata,
  type ToolOutput,
} from '~/types/chat'
import {
  callToolRouter,
  type ResolvedToolRouter,
} from '~/utils/server/toolRouting'
import { fetchContextsByVectorEngine } from '~/utils/fetchContexts'
import { generatePresignedUrl } from '~/pages/api/download'
import {
  getOpenAIToolFromUIUCTool,
  getUIUCToolFromSim,
  toolOutputFromSim,
} from '~/utils/functionCalling/handleFunctionCalling'
import { conversationToMessages as baseConversationToMessages } from '~/utils/functionCalling/conversationToMessages'
import {
  resolveSimCredentials,
  simConfigErrorResponse,
  SIM_DEFAULT_BASE_URL,
  validateSimBaseUrl,
} from '~/utils/simConfig'
import {
  assertWorkflowInWorkspace,
  discoverSimWorkflows,
  parseSimErrorMessage,
  sanitizeSimWorkflowInput,
} from '~/utils/simDiscovery'
import { type SimExecutionResult } from '~/types/sim'

/**
 * Convert conversation to OpenAI message format for agent mode.
 * Extends base conversationToMessages to append ALL retrieved contexts to the last user message.
 * This is CRITICAL for agent mode - the LLM needs to see full contexts to decide next steps.
 */
function conversationToMessagesWithContexts(
  inputData: Conversation,
): ChatCompletionMessageParam[] {
  const messages = baseConversationToMessages(inputData)

  const lastUserMessage = [...inputData.messages].reverse().find((m) => {
    return m?.role === 'user' && Array.isArray(m.contexts) && m.contexts.length
  })

  if (!lastUserMessage?.contexts?.length) return messages

  const targetIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg?.role === 'user' && typeof msg.content === 'string') return i
    }
    return -1
  })()

  if (targetIndex === -1) return messages

  const contextSummary = lastUserMessage.contexts
    .map(
      (ctx, idx) =>
        `[Context ${idx + 1} from "${ctx.readable_filename}" (page ${ctx.pagenumber || 'N/A'})]: ${ctx.text}`,
    )
    .join('\n\n')

  const target = messages[targetIndex]
  if (!target) return messages
  messages[targetIndex] = {
    ...target,
    content: `${target.content}\n\n---\nRetrieved Documents (${lastUserMessage.contexts.length} total):\n${contextSummary}`,
  }

  return messages
}

// Re-export for convenience (imported from handleFunctionCalling)
export { getOpenAIToolFromUIUCTool }

export interface SelectToolsServerParams {
  conversation: Conversation
  availableTools: UIUCTool[]
  router: ResolvedToolRouter
  imageUrls?: string[]
  imageDescription?: string
  signal?: AbortSignal
}

export interface SelectToolsServerResult {
  selectedTools: UIUCTool[]
  error?: string
}

/**
 * Server-side tool selection via the resolved tool router.
 * This is the server-side equivalent of calling /api/chat/openaiFunctionCall
 */
export async function selectToolsServer(
  params: SelectToolsServerParams,
): Promise<SelectToolsServerResult> {
  const {
    conversation,
    availableTools,
    router,
    imageUrls = [],
    imageDescription = '',
    signal,
  } = params

  const lastMessage = conversation.messages[conversation.messages.length - 1]
  if (!lastMessage) {
    return { selectedTools: [], error: 'Conversation missing last message' }
  }

  // Convert UIUCTool to OpenAI compatible format
  const openAITools: ChatCompletionTool[] = getOpenAIToolFromUIUCTool(
    availableTools,
  ) as ChatCompletionTool[]

  // Format messages (with contexts appended for agent mode)
  const messagesToSend: ChatCompletionMessageParam[] =
    conversationToMessagesWithContexts(conversation)

  // Add system message
  const globalToolsSystemPromptPrefix =
    "Don't make assumptions about what values to plug into functions. Ask for clarification if a user request is ambiguous. If you have ideas for suitable defaults, suggest that as an option to the user when asking for clarification.\n"
  messagesToSend.unshift({
    role: 'system',
    content: globalToolsSystemPromptPrefix + conversation.prompt,
  })

  // Add image info if present
  if (imageUrls.length > 0 && imageDescription) {
    const imageInfo = `Image URL(s): ${imageUrls.join(', ')};\nImage Description: ${imageDescription}`
    if (messagesToSend.length > 0) {
      const lastMsg = messagesToSend[messagesToSend.length - 1]
      if (lastMsg && typeof lastMsg.content === 'string') {
        lastMsg.content += `\n\n${imageInfo}`
      }
    }
  }

  try {
    const result = await callToolRouter({
      router,
      messages: messagesToSend,
      tools: openAITools,
      signal,
    })

    if (!result.ok) {
      return { selectedTools: [], error: result.error }
    }

    if (result.toolCalls.length === 0) {
      // No tools invoked - this is normal when the AI decides not to use any tools
      return { selectedTools: [] }
    }

    const toolCalls: ChatCompletionMessageToolCall[] = result.toolCalls

    // Map OpenAI tool calls back to UIUCTool format
    const mappedTools = toolCalls.map((openaiTool): UIUCTool | null => {
      const baseTool = availableTools.find(
        (availableTool) => availableTool.name === openaiTool.function.name,
      )

      if (!baseTool) {
        console.error(
          `Tool ${openaiTool.function.name} not found in available tools.`,
        )
        return null
      }

      return {
        ...baseTool,
        invocationId: openaiTool.id,
        aiGeneratedArgumentValues: JSON.parse(
          openaiTool.function.arguments || '{}',
        ),
      }
    })

    const selectedTools = mappedTools.filter(
      (tool): tool is UIUCTool => tool !== null,
    )

    return { selectedTools }
  } catch (error) {
    console.error('Error in selectToolsServer:', error)
    return {
      selectedTools: [],
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during tool selection',
    }
  }
}

export interface ExecuteToolServerParams {
  tool: UIUCTool
  projectName: string
  signal?: AbortSignal
}

const SIM_TIMEOUT_MS = 300_000

/**
 * Server-side tool execution for Sim AI workflows.
 * Returns the tool with output/error populated.
 */
export async function executeToolServer(
  params: ExecuteToolServerParams,
): Promise<UIUCTool> {
  const { tool, projectName, signal } = params
  const toolCopy = { ...tool }

  const resolved = await resolveSimCredentials(projectName)

  if (!resolved.ok) {
    toolCopy.error = simConfigErrorResponse(resolved.reason).error
    return toolCopy
  }

  const creds = resolved.creds

  const rawBaseUrl = (creds.base_url ?? SIM_DEFAULT_BASE_URL).replace(/\/$/, '')
  const simBaseUrl = validateSimBaseUrl(rawBaseUrl)
  if (!simBaseUrl) {
    toolCopy.error = 'Invalid Sim base URL'
    return toolCopy
  }
  if (!creds.workspace_id) {
    toolCopy.error = simConfigErrorResponse('missing_workspace_id').error
    return toolCopy
  }

  // The same gate the HTTP route applies. Ids reaching here come from
  // workspace-scoped discovery, so this should always pass — it is enforced
  // anyway so that no execution path depends on its caller having checked, and
  // discovery has already warmed the listing this reads.
  try {
    const allowed = await assertWorkflowInWorkspace({
      simBaseUrl,
      apiKey: creds.api_key,
      workspaceId: creds.workspace_id,
      workflowId: tool.id,
      signal,
    })
    if (!allowed) {
      console.warn('[executeToolServer] workflow outside project workspace', {
        projectName,
        workflowId: tool.id,
      })
      toolCopy.error = 'This workflow is not available for this project'
      return toolCopy
    }
  } catch (error) {
    console.error('[executeToolServer] workspace check failed', error)
    toolCopy.error = 'Could not verify the workflow against Sim'
    return toolCopy
  }

  const url = `${simBaseUrl}/api/workflows/${encodeURIComponent(tool.id)}/execute`

  const timeStart = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SIM_TIMEOUT_MS)

  // Combine external signal with timeout
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  // Sim's execute API has no nested-input channel for API-key callers: the
  // input is the flat body minus Sim's own control fields. Strip any
  // AI-generated keys that collide with those before adding our own `stream`.
  const { input: safeInput, stripped } = sanitizeSimWorkflowInput(
    tool.aiGeneratedArgumentValues ?? {},
  )
  if (stripped.length > 0) {
    console.warn('[executeToolServer] dropped reserved Sim control fields', {
      workflowId: tool.id,
      stripped,
    })
  }

  try {
    const simResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': creds.api_key,
      },
      body: JSON.stringify({ ...safeInput, stream: false }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const secondsToRun = (Date.now() - timeStart) / 1000
    console.debug('Time taken for Sim workflow call:', secondsToRun, 'seconds')

    if (!simResponse.ok) {
      const errText = await simResponse.text()
      const errMessage = parseSimErrorMessage(
        errText,
        `Sim API returned ${simResponse.status}: ${simResponse.statusText}`,
      )
      console.error('[executeToolServer] Sim API error', errMessage)
      toolCopy.error = errMessage
      return toolCopy
    }

    const result = (await simResponse.json()) as SimExecutionResult

    if (!result.success || result.error) {
      toolCopy.error = result.error ?? 'Sim workflow returned success=false'
      return toolCopy
    }

    toolCopy.output = toolOutputFromSim(result.output)
    return toolCopy
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      toolCopy.error = 'Sim workflow timed out after 5 minutes'
      return toolCopy
    }
    console.error(`Error running tool ${tool.readableName}:`, error)
    toolCopy.error =
      error instanceof Error ? error.message : 'Unknown error running tool'
    return toolCopy
  }
}

/**
 * Execute multiple Sim tools in parallel
 */
export async function executeToolsServer(
  tools: UIUCTool[],
  projectName: string,
  signal?: AbortSignal,
): Promise<UIUCTool[]> {
  const results = await Promise.all(
    tools.map((tool) => executeToolServer({ tool, projectName, signal })),
  )
  return results
}

export interface FetchContextsServerParams {
  courseName: string
  searchQuery: string
  tokenLimit?: number
  docGroups?: string[]
  conversationId?: string
  signal?: AbortSignal
}

/**
 * Server-side context fetching - directly calls the backend instead of going through API
 * Includes retry logic with exponential backoff for transient failures
 */
export async function fetchContextsServer(
  params: FetchContextsServerParams,
): Promise<ContextWithMetadata[]> {
  const {
    courseName,
    searchQuery,
    tokenLimit = 4000,
    docGroups = [],
    conversationId,
    signal,
  } = params

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))
  const delaysMs = [0, 500, 1000, 2000]
  let lastError: string | null = null
  const isAbortError = (error: unknown) => {
    return (
      signal?.aborted === true ||
      (error instanceof Error && error.name === 'AbortError')
    )
  }

  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    try {
      if (signal?.aborted) {
        return []
      }

      if (delaysMs[attempt]) await sleep(delaysMs[attempt]!)
      if (signal?.aborted) {
        return []
      }

      const contexts = await fetchContextsByVectorEngine(
        courseName,
        searchQuery,
        tokenLimit,
        docGroups,
        conversationId,
        100,
        signal,
      )

      if (!Array.isArray(contexts)) {
        lastError = `Expected array, got ${typeof contexts}`
        if (attempt < delaysMs.length - 1) {
          console.warn(
            `[fetchContextsServer] retry ${attempt + 1}/${delaysMs.length} failed (${lastError})`,
          )
          continue
        }
        console.error(
          `[fetchContextsServer] failed after ${delaysMs.length} attempts (${lastError})`,
        )
        return []
      }

      return contexts
    } catch (error) {
      if (isAbortError(error)) {
        return []
      }

      lastError = error instanceof Error ? error.message : 'Unknown error'
      if (attempt < delaysMs.length - 1) {
        console.warn(
          `[fetchContextsServer] retry ${attempt + 1}/${delaysMs.length} failed (${lastError})`,
        )
        continue
      }
      console.error(
        `[fetchContextsServer] failed after ${delaysMs.length} attempts (${lastError})`,
      )
      return []
    }
  }

  return []
}

/**
 * Fetch available Sim AI tools for a project (server-side).
 * Hits the Sim API directly instead of going through the Next.js API route.
 */
export async function fetchToolsServer(
  courseName: string,
  signal?: AbortSignal,
): Promise<UIUCTool[]> {
  const resolved = await resolveSimCredentials(courseName)

  if (!resolved.ok) {
    if (resolved.reason !== 'not_configured') {
      console.error(
        `[Agent] Sim credentials unavailable for ${courseName}:`,
        resolved.reason,
      )
    }
    return []
  }

  const creds = resolved.creds

  if (!creds.workspace_id) {
    console.error(`[Agent] Sim workspace ID is not set for ${courseName}`)
    return []
  }

  const rawBaseUrl = (creds.base_url ?? SIM_DEFAULT_BASE_URL).replace(/\/$/, '')
  const simBaseUrl = validateSimBaseUrl(rawBaseUrl)
  if (!simBaseUrl) return []

  try {
    const { workflows, failed } = await discoverSimWorkflows({
      simBaseUrl,
      apiKey: creds.api_key,
      workspaceId: creds.workspace_id,
      signal,
    })

    // Omitted rather than offered with a fabricated signature — see
    // discoverSimWorkflows. Log so a partially-degraded tool list is visible.
    if (failed.length > 0) {
      console.error(
        `[Agent] Omitted ${failed.length} Sim workflow(s) that could not be described for ${courseName}:`,
        failed,
      )
    }

    return getUIUCToolFromSim(workflows)
  } catch (error) {
    console.error(
      `[Agent] Error fetching Sim tools for course ${courseName}:`,
      error,
    )
    return []
  }
}

/**
 * Server-side presigned URL generation - bypasses API auth requirement.
 * Wraps the exported generatePresignedUrl from download.ts with null-safe error handling.
 */
export async function generatePresignedUrlServer(
  filePath: string,
  courseName: string,
): Promise<string | null> {
  try {
    return await generatePresignedUrl(filePath, courseName)
  } catch (error) {
    console.error('Error generating presigned URL:', error)
    return null
  }
}

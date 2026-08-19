import { useQuery } from '@tanstack/react-query'
import { type ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'
import posthog from 'posthog-js'
import type { ToolOutput } from '~/types/chat'
import { type Conversation, type Message, type UIUCTool } from '~/types/chat'
import { type ToolParameter, type OpenAICompatibleTool } from '~/types/tools'
import { type SimInputField, type SimWorkflow } from '~/types/sim'
import { type SimWorkflowFailure } from '~/utils/simDiscovery'

// ---------------------------------------------------------------------------
// handleFunctionCall — sends conversation + tools to OpenAI, gets tool_calls
// ---------------------------------------------------------------------------

export async function handleFunctionCall(
  message: Message,
  availableTools: UIUCTool[],
  imageUrls: string[],
  imageDescription: string,
  selectedConversation: Conversation,
  openaiKey: string,
  course_name: string,
  base_url?: string,
): Promise<UIUCTool[]> {
  try {
    const openAITools = getOpenAIToolFromUIUCTool(availableTools)

    const baseEndpoint = base_url
      ? `${base_url}/api/chat/openaiFunctionCall`
      : '/api/chat/openaiFunctionCall'
    const url = course_name
      ? `${baseEndpoint}?course_name=${encodeURIComponent(course_name)}`
      : baseEndpoint

    // The server resolves the router (project providers -> NCSA default);
    // only the client-resolved OpenAI key (project or personal) is sent.
    const body = {
      conversation: selectedConversation,
      tools: openAITools,
      imageUrls: imageUrls,
      imageDescription: imageDescription,
      course_name: course_name,
      openaiKey: openaiKey,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      let errorBody = ''
      try {
        errorBody = await response.text()
      } catch {}
      console.error(
        'Error calling openaiFunctionCall: ',
        response.status,
        errorBody,
      )
      return []
    }
    const openaiFunctionCallResponse = await response.json()
    const modelMessage =
      openaiFunctionCallResponse.choices?.[0]?.message?.content
    const openaiResponse: ChatCompletionMessageToolCall[] =
      openaiFunctionCallResponse.choices?.[0]?.message?.tool_calls || []

    if (openaiResponse.length === 0) {
      if (modelMessage && selectedConversation.messages.length > 0) {
        const lastMsg =
          selectedConversation.messages[
            selectedConversation.messages.length - 1
          ]
        if (lastMsg && lastMsg.role === 'user') {
          ;(lastMsg as any)._toolRoutingResponse = modelMessage
        }
      }
      return []
    }
    console.log('OpenAI tools to run: ', openaiResponse)

    const healToolArguments = (args: string): any => {
      try {
        return JSON.parse(args)
      } catch (parseError) {
        const trimmed = args.trim()
        if (!trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            return JSON.parse('{' + trimmed)
          } catch {
            throw new Error(
              `Failed to parse tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}. Original arguments: ${args.substring(0, 200)}`,
            )
          }
        }
        throw new Error(
          `Failed to parse tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}. Arguments: ${args.substring(0, 200)}`,
        )
      }
    }

    const uiucToolsToRun: UIUCTool[] = openaiResponse.map((openaiTool) => {
      const baseTool = availableTools.find(
        (availableTool) => availableTool.name === openaiTool.function.name,
      )

      const parsedArguments = healToolArguments(openaiTool.function.arguments)

      if (!baseTool) {
        console.error(
          `Tool ${openaiTool.function.name} not found in available tools.`,
        )
        return {
          id: 'error',
          invocationId: openaiTool.id,
          name: openaiTool.function.name,
          readableName: `Error: ${openaiTool.function.name} not found`,
          description: 'Tool definition not found',
          aiGeneratedArgumentValues: parsedArguments,
          error: 'Tool definition not found in available tools list.',
        } as UIUCTool
      }

      // Create a new object for this specific invocation
      return {
        ...baseTool, // Copy properties from the base tool definition
        invocationId: openaiTool.id, // Add the unique invocation ID from OpenAI
        aiGeneratedArgumentValues: parsedArguments, // Add the specific arguments for this call
      }
    })

    // Filter out any tools that weren't found (if we didn't throw an error)
    const validUiucToolsToRun = uiucToolsToRun.filter(
      (tool) => tool.id !== 'error',
    )

    // Update the message object with the array of tool invocations
    // In agent mode (iterative), append to existing tools; otherwise replace
    message.tools = message.tools
      ? [...message.tools, ...validUiucToolsToRun]
      : [...validUiucToolsToRun]
    selectedConversation.messages[selectedConversation.messages.length - 1] =
      message
    console.log(
      'UIUC tools to run (with invocation IDs): ',
      validUiucToolsToRun,
    )

    return validUiucToolsToRun
  } catch (error) {
    console.error(
      'Error calling openaiFunctionCall from handleFunctionCall: ',
      error,
    )
    return []
  }
}

// ---------------------------------------------------------------------------
// handleToolCall — executes tools in parallel, stores outputs in message
// ---------------------------------------------------------------------------

/**
 * How a tool is actually run. The browser posts to our API route
 * (`callSimFunction`); server-side callers pass an executor that talks to Sim
 * directly, because that route is cookie-authenticated and a server has no
 * cookie to present.
 */
export type SimToolExecutor = (
  tool: UIUCTool,
  projectName: string,
  base_url?: string,
) => Promise<ToolOutput>

export async function handleToolCall(
  uiucToolsToRun: UIUCTool[],
  selectedConversation: Conversation,
  projectName: string,
  base_url?: string,
  executeTool: SimToolExecutor = callSimFunction,
) {
  try {
    if (uiucToolsToRun.length > 0) {
      console.log('Running tools in parallel')
      const toolResultsPromises = uiucToolsToRun.map(async (tool) => {
        if (!tool.invocationId) {
          console.error(
            `Tool ${tool.readableName} is missing an invocationId. Skipping.`,
          )
          return
        }

        const lastMessageIndex = selectedConversation.messages.length - 1
        const lastMessage = selectedConversation.messages[lastMessageIndex]

        if (!lastMessage || !lastMessage.tools) {
          console.error(
            'handleToolCall: Last message or its tools array is missing.',
          )
          return
        }

        const targetToolInMessage = lastMessage.tools.find(
          (t) => t.invocationId === tool.invocationId,
        )

        if (!targetToolInMessage) {
          console.error(
            `handleToolCall: Tool invocation with ID "${tool.invocationId}" (Name: ${tool.readableName}) not found in the last message's tools list.`,
          )
          return
        }

        try {
          const toolOutput = await executeTool(tool, projectName, base_url)
          targetToolInMessage.output = toolOutput
        } catch (error: unknown) {
          console.error(`Error running tool ${tool.readableName}: ${error}`)
          targetToolInMessage.error = `Error running tool: ${error}`
        }
      })
      await Promise.all(toolResultsPromises)
    }
    const lastMessage =
      selectedConversation.messages.length > 0
        ? selectedConversation.messages[
            selectedConversation.messages.length - 1
          ]
        : null
    console.log(
      'tool outputs:',
      lastMessage ? lastMessage.tools : 'No last message found',
    )
  } catch (error) {
    console.error('Error running tools from handleToolCall: ', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// handleToolsServer — orchestrates function call + tool execution
// ---------------------------------------------------------------------------

export async function handleToolsServer(
  message: Message,
  availableTools: UIUCTool[],
  imageUrls: string[],
  imageDescription: string,
  selectedConversation: Conversation,
  openaiKey: string,
  projectName: string,
  base_url?: string,
  executeTool: SimToolExecutor = callSimFunction,
): Promise<Conversation> {
  try {
    const uiucToolsToRun = await handleFunctionCall(
      message,
      availableTools,
      imageUrls,
      imageDescription,
      selectedConversation,
      openaiKey,
      projectName,
      base_url,
    )

    if (uiucToolsToRun.length > 0) {
      await handleToolCall(
        uiucToolsToRun,
        selectedConversation,
        projectName,
        base_url,
        executeTool,
      )
    }

    return selectedConversation
  } catch (error) {
    console.error('Error in handleToolsServer: ', error)
  }
  return selectedConversation
}

// ---------------------------------------------------------------------------
// getOpenAIToolFromUIUCTool — converts UIUCTool[] to OpenAI function schemas
// ---------------------------------------------------------------------------

export function getOpenAIToolFromUIUCTool(
  tools: UIUCTool[],
): OpenAICompatibleTool[] {
  return tools.map((tool) => {
    const properties = tool.inputParameters?.properties
    const parameters: OpenAICompatibleTool['function']['parameters'] =
      properties
        ? {
            type: 'object' as const,
            properties: Object.keys(properties).reduce(
              (acc, key) => {
                const param = properties[key]
                acc[key] = {
                  type:
                    param?.type === 'number'
                      ? 'number'
                      : param?.type === 'Boolean'
                        ? 'Boolean'
                        : 'string',
                  description: param?.description,
                  enum: param?.enum,
                }
                return acc
              },
              {} as {
                [key: string]: {
                  type: 'string' | 'number' | 'Boolean'
                  description?: string
                  enum?: string[]
                }
              },
            ),
            required: tool.inputParameters?.required ?? [],
          }
        : undefined

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// useFetchAllWorkflows — React Query hook for tool discovery
// ---------------------------------------------------------------------------

/**
 * How long a discovered tool list stays usable without re-asking Sim.
 * Discovery costs one list call plus one detail call per workflow, and it runs
 * on every page that offers tools, so the result is kept across reloads rather
 * than only for the lifetime of a tab.
 */
const TOOL_CACHE_TTL_MS = 60_000
const TOOL_CACHE_PREFIX = 'sim_tools_'

interface CachedTools {
  tools: UIUCTool[]
  cachedAt: number
}

/**
 * Read a project's cached tool list, or null when absent, expired or unusable.
 *
 * Only the tool descriptions live here — names, descriptions and input schemas,
 * all of which the user can already see. Credentials are resolved server-side
 * and never reach the browser, so nothing secret is being persisted.
 */
export function readCachedSimTools(course_name: string): CachedTools | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${TOOL_CACHE_PREFIX}${course_name}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedTools>
    if (!Array.isArray(parsed.tools) || typeof parsed.cachedAt !== 'number') {
      return null
    }
    if (Date.now() - parsed.cachedAt >= TOOL_CACHE_TTL_MS) return null
    return { tools: parsed.tools, cachedAt: parsed.cachedAt }
  } catch {
    // Malformed or unavailable storage is a cache miss, never a failure.
    return null
  }
}

function writeCachedSimTools(course_name: string, tools: UIUCTool[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      `${TOOL_CACHE_PREFIX}${course_name}`,
      JSON.stringify({ tools, cachedAt: Date.now() } satisfies CachedTools),
    )
  } catch {
    // A full or disabled localStorage costs a re-fetch, nothing more.
  }
}

/** Forget a project's cached tools, so the next read re-runs discovery. */
export function clearCachedSimTools(course_name: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(`${TOOL_CACHE_PREFIX}${course_name}`)
  } catch {
    // Nothing to do — a stale entry expires on its own.
  }
}

export const useFetchAllWorkflows = (course_name?: string) => {
  if (!course_name) {
    throw new Error('course_name is required')
  }

  const cached = readCachedSimTools(course_name)

  return useQuery({
    queryKey: ['tools', course_name],
    // Errors deliberately propagate so callers can show what actually failed
    // rather than an empty list that reads as "no tools configured".
    queryFn: async (): Promise<UIUCTool[]> => {
      const tools = await fetchSimTools(course_name)
      writeCachedSimTools(course_name, tools)
      return tools
    },
    // Seeding with the persisted entry — and telling React Query when it was
    // taken — means a page load reuses a fresh list and refetches an expired
    // one, rather than re-running discovery on every mount.
    initialData: cached?.tools,
    initialDataUpdatedAt: cached?.cachedAt,
    retry: false,
    staleTime: TOOL_CACHE_TTL_MS,
  })
}

// ---------------------------------------------------------------------------
// Sim AI helpers — discovery, conversion, execution
// ---------------------------------------------------------------------------

/**
 * An explicit "this one is needed" wins over any optional wording elsewhere in
 * the same description. `not required` is matched first so it is read as the
 * phrase it is, rather than as the word `required`.
 */
const EXPLICITLY_OPTIONAL = [
  /\bnot\s+required\b/i,
  /\bnot\s+mandatory\b/i,
  /\bnot\s+needed\b/i,
]

const EXPLICITLY_REQUIRED = [
  /\bnot\s+optional\b/i,
  /\brequired\b/i,
  /\bmandatory\b/i,
]

/**
 * Optional wording. `optional` also covers `optionally`.
 *
 * `blank` is only read as optional in phrases that grant permission to leave it
 * empty — the bare word appears just as readily in "must not be blank".
 */
const OPTIONAL_MARKERS = [
  /\boptional/i,
  /leave\s+(?:it\s+|them\s+|this\s+|the\s+field\s+)?blank/i,
  /\bblank\s+if\b/i,
  /\bif\s+(?:left\s+)?blank\b/i,
  /\b(?:may|can|could)\s+be\s+(?:left\s+)?blank\b/i,
  /\b(?:may|can)\s+be\s+omitted\b/i,
]

/**
 * Decide whether a Sim input field is optional, from its description alone.
 *
 * Sim exposes no required flag and the API strips the per-field defaults, so
 * prose is the only channel carrying this information — and workflow authors do
 * use it: MRTN Tool's description text marks four of its seven fields
 * "Optional", two of them mutually exclusive. Marking all seven required forced
 * the model to supply both sides of an either/or pair and to invent values for
 * fields the workflow was written to receive empty.
 *
 * This is a heuristic over free text and will not be perfect. It errs toward
 * required — a field with no marker stays required — because that is the
 * behaviour every existing workflow was published under.
 */
export function isOptionalInputField(field: SimInputField): boolean {
  const description = field.description?.trim()
  if (!description) return false

  if (EXPLICITLY_OPTIONAL.some((pattern) => pattern.test(description))) {
    return true
  }
  if (EXPLICITLY_REQUIRED.some((pattern) => pattern.test(description))) {
    return false
  }
  return OPTIONAL_MARKERS.some((pattern) => pattern.test(description))
}

/**
 * Convert SimWorkflow[] (from API) to UIUCTool[] for the function-calling pipeline.
 * Tool names are prefixed with 'sim_' for consistent identification.
 */
export function getUIUCToolFromSim(workflows: SimWorkflow[]): UIUCTool[] {
  return workflows.map((wf) => {
    const slug = wf.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 59)

    // A workflow with no declared inputs takes no arguments. Emit an empty
    // schema rather than inventing a generic `input` parameter: discovery now
    // omits workflows it could not describe, so an empty field list means the
    // workflow genuinely accepts nothing, and a fabricated required parameter
    // would make the model pass an argument the workflow never asked for.
    const properties: Record<string, ToolParameter> = Object.fromEntries(
      wf.inputFields.map((f) => [
        f.name,
        {
          type:
            f.type === 'number'
              ? 'number'
              : f.type === 'boolean'
                ? 'Boolean'
                : 'string',
          description: f.description ?? f.name,
        } satisfies ToolParameter,
      ]),
    )

    // Sim has no required flag, so optionality is read out of the field's own
    // description — see isOptionalInputField.
    const required: string[] = wf.inputFields
      .filter((f) => !isOptionalInputField(f))
      .map((f) => f.name)

    // The router LLM decides whether to call a tool almost entirely on this
    // string. When the workflow author wrote nothing, fold the input field
    // names and descriptions into the fallback — often (as with MRTN) the
    // fields are well-described even when the workflow is not, and they are
    // the only signal Sim gives us about what the workflow does.
    const authoredDescription = wf.description?.trim()
    const fieldSummary = wf.inputFields
      .map((f) => (f.description ? `${f.name} (${f.description})` : f.name))
      .join(', ')
    const fallbackDescription =
      `Execute the "${wf.name}" Sim workflow` +
      (fieldSummary ? `. Inputs: ${fieldSummary}` : '')

    return {
      id: wf.id,
      name: `sim_${slug}`,
      readableName: wf.name,
      description: authoredDescription || fallbackDescription,
      hasAuthoredDescription: Boolean(authoredDescription),
      enabled: true,
      inputParameters: { type: 'object', properties, required },
    } satisfies UIUCTool
  })
}

/**
 * Fetch deployed Sim workflows for a project and return as UIUCTool[].
 *
 * Browser-only: the route resolves the project's credentials server-side, so
 * nothing is passed in, and the URL is relative. Server-side callers must use
 * `fetchToolsServer`, which talks to Sim directly — calling this one there used
 * to yield an empty list rather than an error, which read as "this project has
 * no tools".
 */
export async function fetchSimTools(course_name?: string): Promise<UIUCTool[]> {
  if (!course_name) return []

  if (typeof window === 'undefined') {
    throw new Error(
      'fetchSimTools is browser-only; use fetchToolsServer on the server',
    )
  }

  const params = new URLSearchParams({ course_name })
  const url = `/api/UIUC-api/getSimWorkflows?${params}`
  const response = await fetch(url)

  if (!response.ok) {
    // Surface the server's reason. Swallowing this renders a configuration or
    // connectivity failure as "this project has no tools", which is false.
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(
      body.error ?? `Failed to load Sim workflows (${response.status})`,
    )
  }

  const data = (await response.json()) as {
    workflows: SimWorkflow[]
    failed?: SimWorkflowFailure[]
  }

  // Workflows we could not describe are omitted server-side rather than
  // published with a fabricated signature. Surface them so a partial result
  // is not mistaken for the whole workspace.
  if (data.failed?.length) {
    console.warn(
      '[fetchSimTools] omitted workflows that could not be described:',
      data.failed.map((f) => `${f.name} (${f.reason})`).join(', '),
    )
  }

  if (!data.workflows?.length) return []

  const tools = getUIUCToolFromSim(data.workflows)
  console.debug(
    '[fetchSimTools] loaded',
    tools.length,
    'Sim tools for',
    course_name,
  )
  return tools
}

/**
 * Sim returns whatever the workflow's terminal block emitted as `output`, so
 * there is no single result contract. When the terminal block is an HTTP/API
 * block the value is a transport envelope — `{ data, status, headers }` — and
 * the upstream response headers must never reach the model or the stored
 * conversation. Unwrap to the payload when that shape is recognised; otherwise
 * pass the value through untouched.
 */
export function unwrapSimOutput(output: unknown): unknown {
  if (
    output !== null &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    'data' in output &&
    'status' in output &&
    'headers' in output
  ) {
    return (output as { data: unknown }).data
  }
  return output
}

/**
 * Normalize a Sim execution result into the app's ToolOutput contract.
 * `image_urls` / `s3_paths` are looked for on the unwrapped payload, which is
 * the closest equivalent to where the n8n integration found them.
 */
export function toolOutputFromSim(output: unknown): ToolOutput {
  const payload = unwrapSimOutput(output)

  let toolOutput: ToolOutput
  if (typeof payload === 'string') {
    toolOutput = { text: payload }
  } else if (payload != null) {
    toolOutput = { data: payload as Record<string, unknown> }
  } else {
    toolOutput = {}
  }

  if (
    payload !== null &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
  ) {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.image_urls)) {
      toolOutput = { ...toolOutput, imageUrls: record.image_urls as string[] }
    }
    // Raw object keys, re-signed from scratch each render. Prefer these over
    // image_urls for anything that must outlive the 1h presign: recovering a key
    // from an expired URL depends on the URL style, but a key needs no parsing.
    if (Array.isArray(record.s3_paths)) {
      toolOutput = { ...toolOutput, s3Paths: record.s3_paths as string[] }
    }
  }

  return toolOutput
}

/**
 * Execute a Sim workflow via our server-side proxy route.
 *
 * The route resolves the project's credentials and checks the workflow against
 * its workspace, so this sends only what identifies the call.
 */
export async function callSimFunction(
  tool: UIUCTool,
  projectName: string,
  base_url?: string,
): Promise<ToolOutput> {
  const timeStart = Date.now()
  const endpoint = base_url
    ? `${base_url}/api/UIUC-api/runSimWorkflow`
    : '/api/UIUC-api/runSimWorkflow'

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_id: tool.id,
      input: tool.aiGeneratedArgumentValues ?? {},
      course_name: projectName,
    }),
  })

  const secondsToRun = (Date.now() - timeStart) / 1000

  if (!response.ok) {
    const err = (await response.json().catch(() => ({
      error: response.statusText,
    }))) as { error?: string }
    posthog.capture('sim_tool_error', {
      course_name: projectName,
      readableToolName: tool.readableName,
      secondsToRunTool: secondsToRun,
      error: err.error,
    })
    throw new Error(
      err.error ?? `Sim workflow failed with status ${response.status}`,
    )
  }

  const result = (await response.json()) as {
    success: boolean
    output?: unknown
    error?: string
  }

  if (!result.success || result.error) {
    posthog.capture('sim_tool_error', {
      course_name: projectName,
      readableToolName: tool.readableName,
      secondsToRunTool: secondsToRun,
      error: result.error,
    })
    throw new Error(result.error ?? 'Sim workflow returned success=false')
  }

  const toolOutput = toolOutputFromSim(result.output)

  posthog.capture('sim_tool_invoked', {
    course_name: projectName,
    readableToolName: tool.readableName,
    secondsToRunTool: secondsToRun,
    success: true,
  })

  console.debug('[callSimFunction] success', {
    tool: tool.readableName,
    secondsToRun,
  })

  return toolOutput
}

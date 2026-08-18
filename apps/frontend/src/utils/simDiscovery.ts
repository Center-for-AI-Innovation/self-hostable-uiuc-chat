import {
  type SimInputField,
  type SimWorkflow,
  type SimWorkflowListItem,
} from '~/types/sim'

/**
 * Sim's list endpoint returns metadata only — input fields come from a
 * per-workflow detail call, so discovery is necessarily an N+1. These bound it:
 * a handful of requests in flight at once, each with its own deadline, so a
 * large workspace or a hung Sim cannot pin the caller open indefinitely.
 */
const DETAIL_CONCURRENCY = 5
const DETAIL_TIMEOUT_MS = 15_000

/** A workflow that could not be described, and why. */
export interface SimWorkflowFailure {
  id: string
  name: string
  reason: string
}

export interface SimDiscoveryResult {
  workflows: SimWorkflow[]
  failed: SimWorkflowFailure[]
}

/** Thrown when the workspace listing itself fails. Carries Sim's status. */
export class SimListError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SimListError'
  }
}

/**
 * Extract input fields from the workflow detail response.
 * Sim returns: { data: { inputs: [{ name, type, description }] } }
 */
export function extractInputFields(
  detail: Record<string, unknown>,
): SimInputField[] {
  // Unwrap the `data` envelope if present
  const inner = (detail.data ?? detail) as Record<string, unknown>

  const inputs = inner.inputs
  if (Array.isArray(inputs)) {
    return inputs.map((f: Record<string, unknown>) => ({
      name: String(f.name ?? ''),
      type: String(f.type ?? 'string'),
      description: f.description ? String(f.description) : undefined,
    }))
  }

  return []
}

/** Run `fn` over `items`, keeping at most `limit` calls in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor++
        const item = items[index]
        if (index >= items.length || item === undefined) return
        results[index] = await fn(item)
      }
    },
  )

  await Promise.all(workers)
  return results
}

type DetailOutcome =
  | { ok: true; workflow: SimWorkflow }
  | { ok: false; failure: SimWorkflowFailure }

/**
 * How long an authorization listing stays usable. Short, because it decides
 * access: a workflow that is undeployed or moved out of the workspace stops
 * being executable within this window rather than at the next process restart.
 */
const WORKSPACE_MEMBERSHIP_TTL_MS = 60_000

const workspaceMembership = new Map<
  string,
  { ids: Set<string>; expiresAt: number }
>()

/** Reset memoized workspace listings. Exported for tests. */
export function clearWorkspaceMembershipCache(): void {
  workspaceMembership.clear()
}

/**
 * List the deployed workflows in a workspace. This single call defines what a
 * project may see *and* what it may run — discovery describes these, and
 * `assertWorkflowInWorkspace` authorizes execution against the same set, so
 * the two can never disagree about which workflows belong to a project.
 *
 * Every listing also refreshes the membership cache, so a discovery pass leaves
 * the subsequent authorization checks with nothing to fetch.
 */
export async function listDeployedWorkflows(params: {
  simBaseUrl: string
  apiKey: string
  workspaceId: string
  signal?: AbortSignal
}): Promise<SimWorkflowListItem[]> {
  const { simBaseUrl, apiKey, workspaceId, signal } = params

  const listUrl = `${simBaseUrl}/api/v1/workflows?workspaceId=${encodeURIComponent(workspaceId)}&deployedOnly=true`
  const listRes = await fetch(listUrl, {
    headers: { 'X-API-Key': apiKey },
    signal,
  })

  if (!listRes.ok) {
    throw new SimListError(listRes.status, `Sim API returned ${listRes.status}`)
  }

  const listData = (await listRes.json()) as { data?: SimWorkflowListItem[] }
  const items = listData.data ?? []

  workspaceMembership.set(`${simBaseUrl}|${workspaceId}`, {
    ids: new Set(items.map((item) => item.id)),
    expiresAt: Date.now() + WORKSPACE_MEMBERSHIP_TTL_MS,
  })

  return items
}

/**
 * True when `workflowId` is one of the workspace's deployed workflows.
 *
 * Execution is authorized here, at the point where a project's workspace is
 * known, rather than by each caller. Discovery only ever advertises workflows
 * from this list, so a request naming anything else did not come from a tool
 * the model was offered — it was constructed by hand, and pairing it with the
 * project's API key would let any member of a project with
 * `allow_logged_in_users` run undeployed or internal workflows.
 */
export async function assertWorkflowInWorkspace(params: {
  simBaseUrl: string
  apiKey: string
  workspaceId: string
  workflowId: string
  signal?: AbortSignal
}): Promise<boolean> {
  const { simBaseUrl, workspaceId, workflowId } = params
  const cacheKey = `${simBaseUrl}|${workspaceId}`
  const now = Date.now()

  // The listing is trusted for its whole TTL, including for misses. Re-reading
  // on every miss would let a caller with a made-up id drive an upstream
  // request per attempt, and a newly deployed workflow is not advertised to the
  // model any sooner than this anyway — discovery is cached for the same span.
  const cached = workspaceMembership.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.ids.has(workflowId)

  const items = await listDeployedWorkflows(params)
  return items.some((item) => item.id === workflowId)
}

/**
 * List a workspace's deployed workflows and describe each one.
 *
 * A workflow whose detail call fails is *excluded* rather than returned with an
 * empty field list: an empty list is indistinguishable from a genuinely
 * input-less workflow, and publishing it would advertise a fabricated
 * single-parameter signature to the model. Callers get the failures separately
 * so they can report them instead of silently offering a wrong tool.
 */
export async function discoverSimWorkflows(params: {
  simBaseUrl: string
  apiKey: string
  workspaceId: string
  signal?: AbortSignal
}): Promise<SimDiscoveryResult> {
  const { simBaseUrl, apiKey, workspaceId, signal } = params
  const headers = { 'X-API-Key': apiKey }

  const items = await listDeployedWorkflows(params)
  if (items.length === 0) return { workflows: [], failed: [] }

  const outcomes = await mapWithConcurrency<SimWorkflowListItem, DetailOutcome>(
    items,
    DETAIL_CONCURRENCY,
    async (item) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DETAIL_TIMEOUT_MS)
      const onAbort = () => controller.abort()
      signal?.addEventListener('abort', onAbort, { once: true })

      try {
        const detailRes = await fetch(
          `${simBaseUrl}/api/v1/workflows/${encodeURIComponent(item.id)}`,
          { headers, signal: controller.signal },
        )

        if (!detailRes.ok) {
          return {
            ok: false,
            failure: {
              id: item.id,
              name: item.name,
              reason: `detail request returned ${detailRes.status}`,
            },
          }
        }

        const detail = (await detailRes.json()) as Record<string, unknown>
        return {
          ok: true,
          workflow: {
            id: item.id,
            name: item.name,
            description: item.description ?? '',
            inputFields: extractInputFields(detail),
          },
        }
      } catch (err) {
        const reason =
          err instanceof Error && err.name === 'AbortError'
            ? 'detail request timed out'
            : err instanceof Error
              ? err.message
              : String(err)
        return { ok: false, failure: { id: item.id, name: item.name, reason } }
      } finally {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  )

  return {
    workflows: outcomes.flatMap((o) => (o.ok ? [o.workflow] : [])),
    failed: outcomes.flatMap((o) => (o.ok ? [] : [o.failure])),
  }
}

/**
 * Map an upstream Sim status onto a response of our own. Sim's status is never
 * forwarded verbatim: a 401 from Sim means its API key was rejected, which is
 * not the same claim as a 401 from this app and must not read as one.
 */
export function simUpstreamErrorResponse(status: number): {
  status: number
  error: string
} {
  if (status === 401 || status === 403) {
    return {
      status: 502,
      error: 'Sim rejected the API key configured for this project',
    }
  }
  if (status === 404) {
    return {
      status: 502,
      error: 'Sim could not find the workspace configured for this project',
    }
  }
  if (status === 429) {
    // Semantically correct to pass through — the caller should back off.
    return { status: 429, error: 'Sim rate limit exceeded, try again shortly' }
  }
  return { status: 502, error: `Sim API error (${status})` }
}

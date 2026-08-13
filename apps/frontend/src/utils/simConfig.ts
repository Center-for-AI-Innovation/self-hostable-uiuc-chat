import { eq } from 'drizzle-orm'
import { db } from '~/db/dbClient'
import { projects } from '~/db/schema'
import { type SimProjectConfig } from '~/types/sim'

/** Resolved credentials. `api_key` is guaranteed present on the success path. */
export interface SimCredentials {
  api_key: string
  workspace_id: string | null
  base_url: string | null
}

/**
 * Why Sim credentials could not be resolved. Callers map these to responses so
 * a configuration problem is never reported to the user as "no tools exist".
 */
export type SimConfigError =
  | 'not_configured'
  | 'missing_workspace_id'
  | 'db_error'

export type SimCredentialsResult =
  | { ok: true; creds: SimCredentials }
  | { ok: false; reason: SimConfigError }

const useLocalStorage = process.env.NEXT_PUBLIC_SIM_STORAGE !== 'supabase'
const LOCAL_SIM_HOSTS = new Set(['localhost', '127.0.0.1', 'simstudio'])

export const SIM_DEFAULT_BASE_URL =
  process.env.SIM_API_BASE_URL ?? 'https://www.sim.ai'

async function loadSimProjectConfig(
  course_name: string,
): Promise<SimProjectConfig | null> {
  const rows = await db
    .select({
      sim_api_key: projects.sim_api_key,
      sim_base_url: projects.sim_base_url,
      sim_workspace_id: projects.sim_workspace_id,
    })
    .from(projects)
    .where(eq(projects.course_name, course_name))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Resolve Sim credentials for a project.
 *
 * - NEXT_PUBLIC_SIM_STORAGE=local (default) → uses values from `fromRequest`
 * - NEXT_PUBLIC_SIM_STORAGE=supabase → merges `fromRequest` over the DB row
 *
 * Precedence is per field: an explicit request value wins for that field only,
 * and every other field still falls back to the stored config.
 */
export async function resolveSimCredentials(
  course_name?: string,
  fromRequest?: {
    api_key?: string
    workspace_id?: string
    base_url?: string
  },
): Promise<SimCredentialsResult> {
  let stored: SimProjectConfig | null = null

  if (!useLocalStorage && course_name) {
    try {
      stored = await loadSimProjectConfig(course_name)
    } catch (err) {
      console.error('[resolveSimCredentials] DB query failed', err)
      return { ok: false, reason: 'db_error' }
    }
  }

  // `||` rather than `??` so an empty string is treated as "not provided".
  const api_key = fromRequest?.api_key || stored?.sim_api_key || null
  const workspace_id =
    fromRequest?.workspace_id || stored?.sim_workspace_id || null
  const base_url = fromRequest?.base_url || stored?.sim_base_url || null

  if (!api_key) {
    return { ok: false, reason: 'not_configured' }
  }

  return { ok: true, creds: { api_key, workspace_id, base_url } }
}

/**
 * Map a resolution failure to an HTTP status and a message the user can act on.
 * Note `not_configured` is not always an error — discovery treats it as an
 * empty result — so callers decide whether to use this mapping.
 */
export function simConfigErrorResponse(reason: SimConfigError): {
  status: number
  error: string
} {
  switch (reason) {
    case 'missing_workspace_id':
      return {
        status: 400,
        error: 'Sim workspace ID is not set for this project',
      }
    case 'db_error':
      return {
        status: 503,
        error: 'Could not read the Sim configuration for this project',
      }
    case 'not_configured':
    default:
      return {
        status: 400,
        error: 'Sim AI is not configured for this project',
      }
  }
}

const ALLOWED_SIM_HOSTS = new Set(['www.sim.ai', 'sim.ai', 'api.sim.ai'])

/**
 * Validate that a base URL points to a known Sim AI host.
 * Returns the sanitized URL or null if invalid (prevents SSRF).
 */
export function validateSimBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const configuredBase = process.env.SIM_API_BASE_URL
    const configuredOrigin = configuredBase
      ? new URL(configuredBase).origin
      : null
    const isAllowedSimHost =
      parsed.protocol === 'https:' && ALLOWED_SIM_HOSTS.has(parsed.hostname)
    const isAllowedLocalHost =
      parsed.protocol === 'http:' &&
      LOCAL_SIM_HOSTS.has(parsed.hostname) &&
      (process.env.NODE_ENV !== 'production' ||
        parsed.origin === configuredOrigin)
    if (!isAllowedSimHost && !isAllowedLocalHost) return null
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

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

const LOCAL_SIM_HOSTS = new Set(['localhost', '127.0.0.1', 'simstudio'])

export const SIM_DEFAULT_BASE_URL =
  process.env.SIM_API_BASE_URL ?? 'https://www.sim.ai'

/**
 * The `projects` row is the only source of truth for Sim credentials, and the
 * key never leaves the server.
 *
 * The earlier design let the browser hold the key in localStorage and send it
 * with each call. That could not work: every server-side caller (agent mode,
 * the public chat API) has no localStorage, and `getSimConfig` is owner/admin
 * gated, so no ordinary user could ever obtain a key to send. The feature was
 * reachable only by the one admin who typed it, in the one browser they typed
 * it in.
 *
 * Reading the row on every tool call would be correct but wasteful, so reads
 * go through a short-lived in-process cache: check it, use it while fresh,
 * otherwise re-read and refresh. `upsertSimConfig` invalidates on write.
 *
 * The cache is per-process and therefore best-effort — a multi-instance
 * deployment can serve a stale key for up to the TTL after a save. That is the
 * reason the TTL is small rather than generous.
 */
const CONFIG_CACHE_TTL_MS = 60_000

/** Bound on distinct projects held at once; prevents unbounded growth. */
const CONFIG_CACHE_MAX_ENTRIES = 500

interface CachedConfig {
  config: SimProjectConfig | null
  expiresAt: number
}

const configCache = new Map<string, CachedConfig>()

/**
 * Drop cached credentials so the next read hits the database.
 * Call after any write to a project's Sim columns.
 */
export function invalidateSimConfigCache(course_name?: string): void {
  if (course_name === undefined) {
    configCache.clear()
    return
  }
  configCache.delete(course_name)
}

/** Evict expired entries, then oldest-first if still over the cap. */
function pruneConfigCache(now: number): void {
  for (const [key, entry] of configCache) {
    if (entry.expiresAt <= now) configCache.delete(key)
  }
  // Map iterates in insertion order, so the head is the least recently written.
  while (configCache.size > CONFIG_CACHE_MAX_ENTRIES) {
    const oldest = configCache.keys().next()
    if (oldest.done) break
    configCache.delete(oldest.value)
  }
}

async function loadSimProjectConfig(
  course_name: string,
): Promise<SimProjectConfig | null> {
  const now = Date.now()
  const cached = configCache.get(course_name)
  if (cached && cached.expiresAt > now) return cached.config

  const rows = await db
    .select({
      sim_api_key: projects.sim_api_key,
      sim_base_url: projects.sim_base_url,
      sim_workspace_id: projects.sim_workspace_id,
    })
    .from(projects)
    .where(eq(projects.course_name, course_name))
    .limit(1)

  const config = rows[0] ?? null
  // Only successful reads are cached: a failed read throws before reaching here
  // and must not be remembered as "this project has no Sim configuration".
  configCache.set(course_name, {
    config,
    expiresAt: now + CONFIG_CACHE_TTL_MS,
  })
  pruneConfigCache(now)
  return config
}

/**
 * Resolve Sim credentials for a project from its stored configuration.
 *
 * There is no caller-supplied override: accepting credentials from the request
 * would let any authenticated user drive this deployment's outbound Sim calls
 * with a key of their choosing, and no legitimate caller has one to send.
 */
export async function resolveSimCredentials(
  course_name?: string,
): Promise<SimCredentialsResult> {
  if (!course_name) return { ok: false, reason: 'not_configured' }

  let stored: SimProjectConfig | null
  try {
    stored = await loadSimProjectConfig(course_name)
  } catch (err) {
    console.error('[resolveSimCredentials] DB query failed', err)
    return { ok: false, reason: 'db_error' }
  }

  // `||` rather than `??` so an empty string is treated as "not provided".
  const api_key = stored?.sim_api_key || null
  const workspace_id = stored?.sim_workspace_id || null
  const base_url = stored?.sim_base_url || null

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
 * Origins the deployment operator has declared as trusted Sim instances:
 * `SIM_API_BASE_URL`'s origin, plus any in `SIM_ALLOWED_SIM_ORIGINS`
 * (comma-separated full origins, e.g. "https://sim.internal.illinois.edu").
 * Malformed entries are skipped. Read per call — negligible cost, and env
 * changes (tests, hot config) apply immediately.
 */
function operatorTrustedOrigins(): Set<string> {
  const origins = new Set<string>()
  const entries = [
    process.env.SIM_API_BASE_URL ?? '',
    ...(process.env.SIM_ALLOWED_SIM_ORIGINS ?? '').split(','),
  ]
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    try {
      origins.add(new URL(trimmed).origin)
    } catch {
      // Ignore a malformed entry rather than poisoning the whole list.
    }
  }
  return origins
}

/**
 * Validate that a base URL points to a trusted Sim host. Returns the
 * sanitized URL or null if invalid (prevents SSRF — attacker-influenceable
 * outbound requests must not reach arbitrary hosts).
 *
 * Trusted means one of:
 * - Sim's cloud hosts, over https.
 * - Local/dev hostnames over http (in production only when it *is* the
 *   configured origin).
 * - An origin the deployment operator wrote into the environment —
 *   `SIM_API_BASE_URL` itself or the `SIM_ALLOWED_SIM_ORIGINS` list. Project
 *   admins can point a project at any of these but cannot introduce new
 *   origins, which keeps the reachable set operator-controlled.
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
    const isOperatorTrusted = operatorTrustedOrigins().has(parsed.origin)
    if (!isAllowedSimHost && !isAllowedLocalHost && !isOperatorTrusted) {
      return null
    }
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

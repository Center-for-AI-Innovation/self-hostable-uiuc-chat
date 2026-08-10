// POST /api/UIUC-api/projectConnections/test
// Probes an external connection without persisting anything. Two modes:
//   - supplied: `{ kind, config }` — probe a config before it is saved.
//   - stored:   `{ kind, project_name }` — probe the config already saved
//     for a project (decrypted server-side; never echoed back).
// Server-side SSRF protections live in ~/utils/projectConnections/tester.

import type { NextApiResponse } from 'next'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'
import {
  getConnectionByProject,
  writeAuditEntry,
} from '~/db/projectConnectionsRepo'
import { decryptProjectConfig, type EncryptedField } from '~/utils/crypto'
import { testBodySchema } from '~/utils/projectConnections/validation'
import {
  testS3,
  testDatabase,
  testQdrant,
  testEmbedding,
  type TestResult,
} from '~/utils/projectConnections/tester'
import {
  extractRequestMeta,
  formatZodError,
} from '~/utils/projectConnections/handlerShared'
import type {
  ConnectionKind,
  TestSuppliedBody,
} from '~/utils/projectConnections/validation'

const KIND_COLUMN: Record<ConnectionKind, string> = {
  s3: 's3_config',
  database: 'database_config',
  qdrant: 'qdrant_config',
  embedding: 'embedding_config',
}

// Build a host-only, secrets-free one-line summary of the probe target for
// stdout logging. Anything that could leak credentials (api_key,
// aws_secret_access_key, query string, userinfo on a postgres URI, full
// connection_uri) is dropped — only scheme + host + port + kind-specific
// non-secret fields are emitted.
function summarizeForLog(body: TestSuppliedBody): string {
  try {
    if (body.kind === 's3') {
      const { endpoint_url, bucket_name, region } = body.config
      const parts: string[] = []
      if (endpoint_url) {
        const u = new URL(endpoint_url)
        parts.push(`endpoint=${u.protocol}//${u.host}`)
      } else {
        parts.push('endpoint=aws')
      }
      if (region) parts.push(`region=${region}`)
      if (bucket_name) parts.push(`bucket=${bucket_name}`)
      return parts.join(' ')
    }
    if (body.kind === 'database') {
      const u = new URL(body.config.connection_uri)
      return `host=${u.hostname} port=${u.port || '(default)'} db=${u.pathname.replace(/^\//, '') || '(default)'}`
    }
    if (body.kind === 'qdrant') {
      const { url, port } = body.config
      const u = new URL(url)
      return `url_host=${u.host} url_scheme=${u.protocol.replace(':', '')} port=${port}`
    }
    // embedding
    const c = body.config
    if (c.provider === 'ollama') {
      const u = new URL(c.base_url!)
      return `provider=ollama base=${u.protocol}//${u.host} model=${c.model}`
    }
    const apiBase = c.api_base || '(default)'
    const apiHost = (() => {
      try {
        const u = new URL(apiBase)
        return `${u.protocol}//${u.host}`
      } catch {
        return apiBase
      }
    })()
    return `provider=${c.provider} api_base=${apiHost} model=${c.model}`
  } catch {
    return '(unparseable target)'
  }
}

// Exported for unit tests — see projectConnections.ts for the same pattern.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const parsed = testBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  const body = parsed.data
  const meta = extractRequestMeta(req)
  const actorEmail = req.user?.email ?? 'unknown'

  // Stored mode: resolve the saved config into the same shape the supplied
  // mode probes, so both modes share one probe/audit path below.
  const storedProjectName = 'config' in body ? null : body.project_name
  let probeBody: TestSuppliedBody
  if ('config' in body) {
    probeBody = body
  } else {
    const row = await getConnectionByProject(body.project_name)
    const encrypted = row
      ? (row as unknown as Record<string, unknown>)[KIND_COLUMN[body.kind]]
      : null
    const config = encrypted
      ? await decryptProjectConfig<Record<string, unknown>>(
          encrypted as EncryptedField,
        )
      : null
    if (!config) {
      const result: TestResult = {
        ok: false,
        code: 'not_found',
        message: `No stored ${body.kind} config for project '${body.project_name}'`,
      }
      await writeAuditEntry({
        actor_email: actorEmail,
        action: 'test',
        project_name: body.project_name,
        kind: body.kind,
        outcome: 'failure',
        failure_reason: result.code ?? 'unknown',
        changed_fields: null,
        ...meta,
      })
      return res.status(200).json(result)
    }
    // Stored configs were schema-validated at upsert time, so the cast back
    // to the kind-specific shape is safe.
    probeBody = { kind: body.kind, config } as TestSuppliedBody
  }

  // Log the probe attempt with a host-only summary — never the api_key,
  // aws_secret_access_key, or full connection_uri. Mirrors the DB audit row
  // written below but goes to stdout for live debugging.
  const summary = summarizeForLog(probeBody)
  console.log(
    `[projectConnections/test] probe kind=${probeBody.kind} mode=${storedProjectName ? 'stored' : 'supplied'} actor=${actorEmail} ${summary}`,
  )

  let result: TestResult
  try {
    if (probeBody.kind === 's3') result = await testS3(probeBody.config)
    else if (probeBody.kind === 'database')
      result = await testDatabase(probeBody.config)
    else if (probeBody.kind === 'qdrant')
      result = await testQdrant(probeBody.config)
    else result = await testEmbedding(probeBody.config)
  } catch (e) {
    result = {
      ok: false,
      code: 'unknown',
      message: 'Probe threw unexpectedly',
    }
    console.error('[projectConnections/test] threw:', e)
  }

  if (result.ok) {
    console.log(`[projectConnections/test] ok kind=${probeBody.kind}`)
  } else {
    console.warn(
      `[projectConnections/test] fail kind=${probeBody.kind} code=${result.code} message=${result.message}`,
    )
  }

  // Audit the test attempt. The connection_uri / api_key / etc. are NOT
  // included — only the kind and outcome. project_name is set only for the
  // stored mode; a supplied-config probe happens before the config is
  // associated with a project.
  await writeAuditEntry({
    actor_email: actorEmail,
    action: 'test',
    project_name: storedProjectName,
    kind: probeBody.kind,
    outcome: result.ok ? 'success' : 'failure',
    failure_reason: result.ok ? null : (result.code ?? 'unknown'),
    changed_fields: null,
    ...meta,
  })

  return res.status(200).json(result)
}

export default withSuperAdminOnly(handler)

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/** Max connections per pool. Keep low to avoid "too many clients" on Postgres. */
const POOL_MAX = Number(process.env.POSTGRES_POOL_MAX) || 10

function resolvePostgresSsl(ssl: string | undefined, endpoint: string) {
  if (ssl === undefined) {
    const isLoopback = endpoint === 'localhost' || endpoint === '127.0.0.1'
    return isLoopback ? false : { rejectUnauthorized: false }
  }

  switch (ssl.trim().toLowerCase()) {
    case 'false':
      return false
    case 'true':
      return { rejectUnauthorized: false }
    default:
      throw new Error(`Invalid PostgreSQL SSL setting: ${ssl}`)
  }
}

function createPostgresClient(
  username?: string,
  password?: string,
  endpoint?: string,
  port?: string,
  database?: string,
  ssl?: string,
) {
  if (!username || !password || !endpoint || !port || !database) {
    return postgres('postgres://postgres:postgres@localhost:5432/postgres', {
      max: 2,
      idle_timeout: 20,
    })
  }

  const connectionString = `postgres://${username}:${password}@${endpoint}:${port}/${database}`
  return postgres(connectionString, {
    max: POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: resolvePostgresSsl(ssl, endpoint),
  })
}

// Pools are cached on globalThis: pages-router bundles each API route with
// its own copy of this module, so module-scope pools would be per-route (and
// re-created on every dev HMR recompile). globalThis is shared across bundles
// in the Node process, so every route reuses the same pool.
type PgClient = ReturnType<typeof createPostgresClient>

const globalForDb = globalThis as unknown as {
  __illinoisChatHostPg?: PgClient
  __illinoisChatKeycloakPg?: PgClient
}

export const client: PgClient =
  globalForDb.__illinoisChatHostPg ??
  createPostgresClient(
    process.env.POSTGRES_USERNAME,
    process.env.POSTGRES_PASSWORD,
    process.env.POSTGRES_ENDPOINT,
    process.env.POSTGRES_PORT,
    process.env.POSTGRES_DATABASE,
    process.env.POSTGRES_SSL,
  )
globalForDb.__illinoisChatHostPg = client

const keycloakClient: PgClient =
  globalForDb.__illinoisChatKeycloakPg ??
  createPostgresClient(
    process.env.KEYCLOAK_DB_USERNAME,
    process.env.KEYCLOAK_DB_PASSWORD,
    process.env.KEYCLOAK_DB_ENDPOINT,
    process.env.KEYCLOAK_DB_PORT,
    process.env.KEYCLOAK_DB_DATABASE,
    process.env.KEYCLOAK_DB_SSL,
  )
globalForDb.__illinoisChatKeycloakPg = keycloakClient

export const db = drizzle(client, { schema: schema })
export const keycloakDB = drizzle(keycloakClient, { schema: schema })

export * from './schema'

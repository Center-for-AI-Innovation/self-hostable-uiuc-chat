import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('superAdmins', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is empty when neither env var is set', async () => {
    vi.stubEnv('SUPER_ADMIN_EMAILS', '')
    vi.stubEnv('NEXT_PUBLIC_SUPER_ADMIN_EMAILS', '')
    const { superAdmins, isSuperAdmin } = await import('../superAdmins')
    expect(superAdmins).toEqual([])
    expect(isSuperAdmin('anyone@example.com')).toBe(false)
  })

  it('lowercases, trims, and de-dupes across both env vars', async () => {
    vi.stubEnv(
      'SUPER_ADMIN_EMAILS',
      'Foo@Example.com,  bar@example.com  , foo@example.com',
    )
    vi.stubEnv(
      'NEXT_PUBLIC_SUPER_ADMIN_EMAILS',
      'BAR@example.com,baz@example.com',
    )
    const { superAdmins } = await import('../superAdmins')
    expect(superAdmins).toContain('foo@example.com')
    expect(superAdmins).toContain('bar@example.com')
    expect(superAdmins).toContain('baz@example.com')
    expect(superAdmins).toHaveLength(3)
  })

  it('isSuperAdmin matches case-insensitively and rejects empties', async () => {
    vi.stubEnv('SUPER_ADMIN_EMAILS', 'admin@example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPER_ADMIN_EMAILS', '')
    const { isSuperAdmin } = await import('../superAdmins')
    expect(isSuperAdmin('admin@example.com')).toBe(true)
    expect(isSuperAdmin('ADMIN@example.com')).toBe(true)
    expect(isSuperAdmin('stranger@example.com')).toBe(false)
    expect(isSuperAdmin('')).toBe(false)
    expect(isSuperAdmin(null)).toBe(false)
    expect(isSuperAdmin(undefined)).toBe(false)
  })
})

/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
}))

// withAuth is exercised by authMiddleware.test.ts; here it passes straight
// through so the guard's own two rejections are what's under test.
vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (handler: any) => handler,
}))

vi.mock('~/utils/superAdmins', () => ({
  isSuperAdmin: hoisted.isSuperAdmin,
}))

import { withSuperAdminOnly } from '~/utils/superAdminGuard'

function createRes() {
  const res: any = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

describe('withSuperAdminOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401s when the request carries no authenticated user', async () => {
    const handler = vi.fn()
    const res = createRes()

    await withSuperAdminOnly(handler)({} as any, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'User not authenticated' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('403s when the authenticated user is not a super-admin', async () => {
    hoisted.isSuperAdmin.mockReturnValue(false)
    const handler = vi.fn()
    const res = createRes()

    await withSuperAdminOnly(handler)(
      { user: { email: 'student@illinois.edu' } } as any,
      res,
    )

    expect(hoisted.isSuperAdmin).toHaveBeenCalledWith('student@illinois.edu')
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'This action requires super-admin privileges.',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('delegates to the wrapped handler for a super-admin', async () => {
    hoisted.isSuperAdmin.mockReturnValue(true)
    const handler = vi.fn()
    const res = createRes()
    const req = { user: { email: 'admin@illinois.edu' } } as any

    await withSuperAdminOnly(handler)(req, res)

    expect(handler).toHaveBeenCalledWith(req, res)
    expect(res.status).not.toHaveBeenCalled()
  })
})

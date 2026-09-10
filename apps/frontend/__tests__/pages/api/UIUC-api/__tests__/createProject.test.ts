import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => {
  return {
    checkCourseExists: vi.fn(),
  }
})

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: any) => h,
}))

vi.mock('~/pages/api/UIUC-api/getCourseExists', () => ({
  checkCourseExists: hoisted.checkCourseExists,
}))

vi.mock('~/utils/apiUtils', () => ({
  getBackendUrl: () => 'http://backend',
}))

import handler from '~/pages/api/UIUC-api/createProject'

describe('UIUC-api/createProject', () => {
  it('returns 405 for non-POST', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 400 for missing required fields', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: { project_name: 'x' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 for invalid names without touching Redis or the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    for (const badName of ['my bot', '.hidden', 'a'.repeat(65)]) {
      hoisted.checkCourseExists.mockClear()
      const res = createMockRes()
      await handler(
        createMockReq({
          method: 'POST',
          body: { project_name: badName, project_owner_email: 'o@example.com' },
        }) as any,
        res as any,
      )
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid project name',
          message: expect.stringMatching(
            /letters, numbers|characters or fewer/,
          ),
        }),
      )
      expect(hoisted.checkCourseExists).not.toHaveBeenCalled()
    }

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('forwards the backend JSON error body and preserves the status', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Project name already exists',
          message: "A project named 'x' already exists.",
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    )

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Project name already exists',
        message: "A project named 'x' already exists.",
      }),
    )

    fetchSpy.mockRestore()
  })

  it('returns 409 when project exists and 503 when existence check fails', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(true)
    const res1 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(409)

    hoisted.checkCourseExists.mockRejectedValueOnce(new Error('redis down'))
    const res2 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(503)
  })

  it('returns 200 on success and propagates backend failure status', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res1 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(200)

    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    fetchSpy.mockResolvedValueOnce(new Response('nope', { status: 500 }))
    const res2 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(500)

    fetchSpy.mockRestore()
  })
})

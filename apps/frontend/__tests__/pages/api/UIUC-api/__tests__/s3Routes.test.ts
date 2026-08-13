/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  getSignedUrl: vi.fn(),
}))

vi.mock('~/pages/api/authorization', () => ({
  withCourseAccessFromRequest: () => (handler: any) => handler,
}))

vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: hoisted.createPresignedPost,
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: hoisted.getSignedUrl,
}))

vi.mock('~/utils/s3Client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/s3Client')>()
  return {
    ...actual,
    s3Client: {},
    getPresignedUrlClient: () => ({}),
  }
})

const cmHoisted = vi.hoisted(() => ({
  getS3Client: vi.fn(async () => ({
    client: {},
    bucket: 'default-bucket',
    endpoint: null,
    region: 'us-east-1',
  })),
}))

vi.mock('~/utils/connectionManager', () => ({
  connectionManager: { getS3Client: cmHoisted.getS3Client },
}))

import getPresignedUrlHandler from '~/pages/api/UIUC-api/getPresignedUrl'
import uploadToS3Handler from '~/pages/api/UIUC-api/uploadToS3'

describe('UIUC-api S3 routes', () => {
  beforeEach(() => {
    hoisted.createPresignedPost.mockReset()
    hoisted.getSignedUrl.mockReset()
    cmHoisted.getS3Client.mockClear()
    cmHoisted.getS3Client.mockImplementation(async () => ({
      client: {},
      bucket: 'default-bucket',
      endpoint: null,
      region: 'us-east-1',
    }))
  })

  it('uploadToS3 validates chat upload and returns a presigned post for normal courses', async () => {
    const res1 = createMockRes()
    await uploadToS3Handler(
      createMockReq({
        method: 'POST',
        body: {
          uniqueFileName: 'file.txt',
          courseName: 'CS101',
          uploadType: 'chat',
        },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    hoisted.createPresignedPost.mockResolvedValueOnce({
      url: 'u',
      fields: { key: 'k' },
    })
    const res2 = createMockRes()
    await uploadToS3Handler(
      createMockReq({
        method: 'POST',
        body: {
          uniqueFileName: 'file.txt',
          courseName: 'CS101',
        },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
    expect(res2.json).toHaveBeenCalledWith({
      message: 'Presigned URL generated successfully',
      post: { url: 'u', fields: { key: 'k' } },
    })
  })

  it('getPresignedUrl returns 405 for non-GET and 200 for normal courses', async () => {
    const res1 = createMockRes()
    await getPresignedUrlHandler(
      createMockReq({ method: 'POST' }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(405)

    hoisted.getSignedUrl.mockResolvedValueOnce('https://signed.example')
    const res2 = createMockRes()
    await getPresignedUrlHandler(
      createMockReq({
        method: 'GET',
        query: { s3_path: 'courses/CS101/file.txt', course_name: 'CS101' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
    expect(res2.json).toHaveBeenCalledWith({
      presignedUrl: 'https://signed.example',
    })
  })

  it('getPresignedUrl returns 500 when ConnectionManager throws', async () => {
    cmHoisted.getS3Client.mockRejectedValueOnce(
      new Error('S3 client not configured'),
    )
    const res = createMockRes()
    await getPresignedUrlHandler(
      createMockReq({
        method: 'GET',
        query: { s3_path: 'users/u/file.txt', course_name: 'vyriad' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('UIUC-api S3 routes — validation and failure paths', () => {
  beforeEach(() => {
    hoisted.createPresignedPost.mockReset()
    hoisted.getSignedUrl.mockReset()
    cmHoisted.getS3Client.mockClear()
    cmHoisted.getS3Client.mockImplementation(async () => ({
      client: {},
      bucket: 'default-bucket',
      endpoint: null,
      region: 'us-east-1',
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('getPresignedUrl 400s when s3_path or course_name is missing', async () => {
    const res = createMockRes()
    await getPresignedUrlHandler(
      createMockReq({ method: 'GET', query: { course_name: 'CS101' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(hoisted.getSignedUrl).not.toHaveBeenCalled()
  })

  it('getPresignedUrl 400s when the params are the wrong type', async () => {
    // Repeated query params arrive as arrays; signing with one would produce
    // a URL for an unintended key.
    const res = createMockRes()
    await getPresignedUrlHandler(
      createMockReq({
        method: 'GET',
        query: { s3_path: ['a', 'b'], course_name: 'CS101' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('getPresignedUrl 500s when the project has no bucket configured', async () => {
    cmHoisted.getS3Client.mockResolvedValueOnce({
      client: {},
      bucket: null,
      endpoint: null,
      region: 'us-east-1',
    } as any)
    const res = createMockRes()
    await getPresignedUrlHandler(
      createMockReq({
        method: 'GET',
        query: { s3_path: 'courses/CS101/f.txt', course_name: 'CS101' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
    expect(hoisted.getSignedUrl).not.toHaveBeenCalled()
  })

  it('getPresignedUrl signs with the project client when the project overrides S3', async () => {
    // An override means the bucket lives on the project's own endpoint, so
    // the browser-facing default client must not be substituted.
    const projectClient = { kind: 'project' }
    cmHoisted.getS3Client.mockResolvedValueOnce({
      client: projectClient,
      bucket: 'project-bucket',
      endpoint: 'https://minio.project.example',
      region: 'us-east-1',
      isOverride: true,
    } as any)
    hoisted.getSignedUrl.mockResolvedValueOnce('https://signed.project')

    const res = createMockRes()
    await getPresignedUrlHandler(
      createMockReq({
        method: 'GET',
        query: { s3_path: 'courses/CS101/f.txt', course_name: 'CS101' },
      }) as any,
      res as any,
    )
    expect(hoisted.getSignedUrl).toHaveBeenCalledWith(
      projectClient,
      expect.anything(),
      { expiresIn: 3600 },
    )
    expect(res.json).toHaveBeenCalledWith({
      presignedUrl: 'https://signed.project',
    })
  })

  it('uploadToS3 500s when the project has no bucket configured', async () => {
    cmHoisted.getS3Client.mockResolvedValueOnce({
      client: {},
      bucket: null,
      endpoint: null,
      region: 'us-east-1',
    } as any)
    const res = createMockRes()
    await uploadToS3Handler(
      createMockReq({
        method: 'POST',
        body: { uniqueFileName: 'f.txt', courseName: 'CS101' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('uploadToS3 500s when presigning throws', async () => {
    hoisted.createPresignedPost.mockRejectedValueOnce(new Error('s3 down'))
    const res = createMockRes()
    await uploadToS3Handler(
      createMockReq({
        method: 'POST',
        body: { uniqueFileName: 'f.txt', courseName: 'CS101' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error generating presigned URL' }),
    )
  })

  it('uploadToS3 keys chat uploads under the user and uses the project client on override', async () => {
    const projectClient = { kind: 'project' }
    cmHoisted.getS3Client.mockResolvedValueOnce({
      client: projectClient,
      bucket: 'project-bucket',
      endpoint: null,
      region: 'us-east-1',
      isOverride: true,
    } as any)
    hoisted.createPresignedPost.mockResolvedValueOnce({ url: 'u', fields: {} })

    const res = createMockRes()
    await uploadToS3Handler(
      createMockReq({
        method: 'POST',
        body: {
          uniqueFileName: 'f.txt',
          courseName: 'CS101',
          uploadType: 'chat',
          user_id: 'user-1',
        },
      }) as any,
      res as any,
    )
    expect(hoisted.createPresignedPost).toHaveBeenCalledWith(
      projectClient,
      expect.objectContaining({
        Bucket: 'project-bucket',
        Key: 'users/user-1/f.txt',
      }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })
})

/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'

describe('s3Client', () => {
  it('creates an S3Client with explicit credentials when AWS_KEY/AWS_SECRET are set', async () => {
    const ctor = vi.fn()
    vi.doMock('@aws-sdk/client-s3', () => ({ S3Client: ctor }))

    vi.stubEnv('AWS_REGION', 'us-east-1')
    vi.stubEnv('AWS_KEY', 'k')
    vi.stubEnv('AWS_SECRET', 's')
    vi.stubEnv('LOCAL_MINIO', '')
    vi.stubEnv('MINIO_ENDPOINT', '')

    vi.resetModules()
    const mod = await import('../s3Client')
    expect(mod.s3Client).toBeTruthy()
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        credentials: { accessKeyId: 'k', secretAccessKey: 's' },
      }),
    )
  })

  it('adds MinIO endpoint + forcePathStyle when LOCAL_MINIO=true', async () => {
    const ctor = vi.fn()
    vi.doMock('@aws-sdk/client-s3', () => ({ S3Client: ctor }))

    vi.stubEnv('AWS_REGION', 'us-east-1')
    vi.stubEnv('AWS_KEY', 'k')
    vi.stubEnv('AWS_SECRET', 's')
    vi.stubEnv('LOCAL_MINIO', 'true')
    vi.stubEnv('MINIO_ENDPOINT', 'http://minio:9000')

    vi.resetModules()
    await import('../s3Client')
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://minio:9000',
        forcePathStyle: true,
      }),
    )
  })

  it('prefers MINIO_PUBLIC_ENDPOINT for presigned URLs', async () => {
    const ctor = vi.fn()
    vi.doMock('@aws-sdk/client-s3', () => ({ S3Client: ctor }))

    vi.stubEnv('AWS_REGION', 'us-east-1')
    vi.stubEnv('AWS_KEY', 'k')
    vi.stubEnv('AWS_SECRET', 's')
    vi.stubEnv('LOCAL_MINIO', 'true')
    vi.stubEnv('MINIO_ENDPOINT', 'http://minio:9000')
    vi.stubEnv('MINIO_PUBLIC_ENDPOINT', 'http://localhost:9000')

    vi.resetModules()
    const mod = await import('../s3Client')
    mod.getPresignedUrlClient()
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
      }),
    )
  })

  it('creates a region-only S3Client when credentials are missing', async () => {
    const ctor = vi.fn()
    vi.doMock('@aws-sdk/client-s3', () => ({ S3Client: ctor }))

    vi.stubEnv('AWS_REGION', 'us-east-1')
    vi.stubEnv('AWS_KEY', '')
    vi.stubEnv('AWS_SECRET', '')

    vi.resetModules()
    await import('../s3Client')
    expect(ctor).toHaveBeenCalledWith({ region: 'us-east-1' })
  })
})

describe('normalizeS3Key', () => {
  it('strips a leading bucket segment (path-style MinIO / legacy AWS)', async () => {
    vi.resetModules()
    const { normalizeS3Key } = await import('../s3Client')
    expect(normalizeS3Key('uiuc-chat/courses/cs101/out.png', 'uiuc-chat')).toBe(
      'courses/cs101/out.png',
    )
  })

  it('getPresignedUrlClient falls back to a region-only client when credentials are missing', async () => {
    const ctor = vi.fn()
    vi.doMock('@aws-sdk/client-s3', () => ({ S3Client: ctor }))

    vi.stubEnv('AWS_REGION', '')
    vi.stubEnv('AWS_KEY', '')
    vi.stubEnv('AWS_SECRET', '')

    vi.resetModules()
    const mod = await import('../s3Client')
    ctor.mockClear()
    mod.getPresignedUrlClient()
    expect(ctor).toHaveBeenCalledWith({ region: 'us-east-1' })
  })

  it('leaves a virtual-hosted-style key untouched', async () => {
    vi.resetModules()
    const { normalizeS3Key } = await import('../s3Client')
    expect(normalizeS3Key('courses/cs101/out.png', 'uiuc-chat')).toBe(
      'courses/cs101/out.png',
    )
  })

  it('only strips the bucket as a whole leading segment', async () => {
    vi.resetModules()
    const { normalizeS3Key } = await import('../s3Client')
    // A key beginning with the bucket name but not the bucket path must survive.
    expect(normalizeS3Key('uiuc-chat-archive/out.png', 'uiuc-chat')).toBe(
      'uiuc-chat-archive/out.png',
    )
  })

  it('strips only the first occurrence', async () => {
    vi.resetModules()
    const { normalizeS3Key } = await import('../s3Client')
    expect(normalizeS3Key('bkt/bkt/out.png', 'bkt')).toBe('bkt/out.png')
  })
})

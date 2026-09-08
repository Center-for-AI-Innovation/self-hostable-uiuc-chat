import { S3Client } from '@aws-sdk/client-s3'

const region = process.env.AWS_REGION

// Since AWS SDK 3.729.0, uploads default to CRC32 checksums and downloads to
// checksum validation, which MinIO and other S3-compatible stores may reject.
// 'WHEN_REQUIRED' restores the pre-3.729 behavior for custom-endpoint clients.
const s3CompatibleChecksumConfig = {
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
} as const

// Default S3 client used when a project has no per-project s3_config override.
// Per-project clients are built dynamically by ConnectionManager.
// With LOCAL_MINIO=true this points at the Docker-internal MinIO endpoint.
let s3Client: S3Client | null = null
if (region && process.env.AWS_KEY && process.env.AWS_SECRET) {
  const baseConfig: any = {
    region,
    credentials: {
      accessKeyId: process.env.AWS_KEY!,
      secretAccessKey: process.env.AWS_SECRET!,
    },
  }

  if (process.env.LOCAL_MINIO === 'true' && process.env.MINIO_ENDPOINT) {
    baseConfig.endpoint = process.env.MINIO_ENDPOINT
    baseConfig.forcePathStyle = true // required for MinIO / LocalStack
    Object.assign(baseConfig, s3CompatibleChecksumConfig)
  }

  s3Client = new S3Client(baseConfig)
} else if (region) {
  s3Client = new S3Client({ region })
}

// MinIO Client configuration
let vyriadMinioClient: S3Client | null = null
if (
  process.env.MINIO_KEY &&
  process.env.MINIO_SECRET &&
  process.env.MINIO_ENDPOINT
) {
  vyriadMinioClient = new S3Client({
    region: process.env.MINIO_REGION || 'us-east-1', // MinIO requires a region, but it can be arbitrary
    credentials: {
      accessKeyId: process.env.MINIO_KEY,
      secretAccessKey: process.env.MINIO_SECRET,
    },
    endpoint: process.env.MINIO_ENDPOINT,
    forcePathStyle: true, // Required for MinIO
    ...s3CompatibleChecksumConfig,
  })
}

// Client for generating presigned URLs handed to the browser. Signs against
// the public MinIO endpoint (MINIO_PUBLIC_ENDPOINT) so the URL is reachable
// from outside the Docker network. Only used on the default (no per-project
// s3_config override) path — override clients sign against the project's own
// endpoint, which is presumed publicly reachable.
function getPresignedUrlClient(): S3Client | null {
  const publicEndpoint =
    process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT
  const region = process.env.AWS_REGION || 'us-east-1'

  if (process.env.AWS_KEY && process.env.AWS_SECRET) {
    const baseConfig: any = {
      region,
      credentials: {
        accessKeyId: process.env.AWS_KEY,
        secretAccessKey: process.env.AWS_SECRET,
      },
    }

    if (process.env.LOCAL_MINIO === 'true' && publicEndpoint) {
      baseConfig.endpoint = publicEndpoint
      baseConfig.forcePathStyle = true
      Object.assign(baseConfig, s3CompatibleChecksumConfig)
    }

    return new S3Client(baseConfig)
  }

  return new S3Client({ region })
}

function getPresignedUrlVyriadClient(): S3Client | null {
  const publicEndpoint =
    process.env.VYRIAD_MINIO_PUBLIC_ENDPOINT ||
    process.env.VYRIAD_MINIO_ENDPOINT

  if (
    process.env.VYRIAD_MINIO_KEY &&
    process.env.VYRIAD_MINIO_SECRET &&
    publicEndpoint
  ) {
    return new S3Client({
      region: process.env.VYRIAD_MINIO_REGION || 'us-east-1',
      endpoint: publicEndpoint,
      credentials: {
        accessKeyId: process.env.VYRIAD_MINIO_KEY,
        secretAccessKey: process.env.VYRIAD_MINIO_SECRET,
      },
      forcePathStyle: true,
      ...s3CompatibleChecksumConfig,
    })
  }

  return vyriadMinioClient
}

// Keys reaching the presign routes are often recovered from a URL pathname by the
// client. Path-style S3/MinIO URLs are `<endpoint>/<bucket>/<key>`, so that pathname
// carries the bucket and signing it verbatim yields a valid signature for an object
// that does not exist. Presigning never touches the bucket, so the error surfaces as
// a silent 404 on the image rather than an API failure. No-op for virtual-hosted AWS.
// A key that genuinely begins with the bucket name would be mis-stripped; no current
// key layout does.
function normalizeS3Key(key: string, bucket: string): string {
  const prefix = `${bucket}/`
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}

export {
  s3Client,
  vyriadMinioClient,
  getPresignedUrlClient,
  getPresignedUrlVyriadClient,
  normalizeS3Key,
}

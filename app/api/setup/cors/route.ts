import { NextResponse } from 'next/server'
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3'

export async function POST() {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION ?? 'eu-central',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  })

  await s3.send(new PutBucketCorsCommand({
    Bucket: process.env.S3_BUCKET!,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? '*'],
        AllowedMethods: ['GET', 'PUT', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      }],
    },
  }))

  return NextResponse.json({ ok: true })
}

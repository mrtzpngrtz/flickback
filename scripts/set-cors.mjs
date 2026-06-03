import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'eu-central',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
})

await s3.send(new PutBucketCorsCommand({
  Bucket: process.env.S3_BUCKET,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: [process.env.APP_ORIGIN ?? '*'],
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    }],
  },
}))

console.log('CORS configured on bucket:', process.env.S3_BUCKET)

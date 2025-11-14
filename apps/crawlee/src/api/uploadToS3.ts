// upload.ts
import * as path from 'path';
import axios from 'axios';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { supabase } from '../utils/supabaseClient.js';

export const aws_config = {
  bucketName: process.env.S3_BUCKET_NAME,
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
};

// Upload PDF to S3 and send the S3 path to the ingest function
export async function uploadPdfToS3(url: string, courseName: string) {
  // Sanitize filename
  const humanURI = decodeURI(path.basename(url));
  const extension = path.extname(humanURI);
  const nameWithoutExtension = path.basename(humanURI, extension);
  const filename = nameWithoutExtension.replace(/[^a-zA-Z0-9]/g, '-') + extension;

  console.log(`Uploading PDF to S3. Filename: ${filename}, Url: ${url}`);
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_KEY as string,
      secretAccessKey: process.env.AWS_SECRET as string,
    },
    // If MINIO_ENDPOINT is defined, use it instead of AWS S3.
    ...(process.env.MINIO_ENDPOINT
      ? {
        endpoint: process.env.MINIO_ENDPOINT,
        forcePathStyle: true,
      }
      : {}),
  })
  const s3BucketName = aws_config.bucketName;

  // Check if the bucket exists, and create it if it does not
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: s3BucketName }));
    console.log(`Bucket ${s3BucketName} already exists.`);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotFound') {
        console.log(`Bucket ${s3BucketName} does not exist. Creating bucket.`);
        try {
          await s3Client.send(new CreateBucketCommand({ Bucket: s3BucketName }));
          console.log(`Bucket ${s3BucketName} created.`);
        } catch (createError) {
          if (createError instanceof Error && createError.name === 'BucketAlreadyOwnedByYou') {
            console.log(`Bucket ${s3BucketName} already owned by you.`);
          } else {
            throw createError;
          }
        }
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const s3Key = `courses/${courseName}/${filename}`;

  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const pdfBuffer = response.data;

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: s3Key,
      Body: pdfBuffer,
    }));
    console.log(`PDF uploaded to S3 at key: ${s3Key}`);
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchBucket') {
      console.log(`Bucket ${s3BucketName} does not exist. Creating bucket.`);
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: s3BucketName }));
        console.log(`Bucket ${s3BucketName} created.`);
        // Retry the upload after creating the bucket
        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName,
          Key: s3Key,
          Body: pdfBuffer,
        }));
        console.log(`PDF uploaded to S3 at key: ${s3Key}`);
      } catch (createError) {
        if (createError instanceof Error && createError.name === 'BucketAlreadyOwnedByYou') {
          console.log(`Bucket ${s3BucketName} already owned by you.`);
          // Retry the upload after confirming the bucket is owned by you
          await s3Client.send(new PutObjectCommand({
            Bucket: s3BucketName,
            Key: s3Key,
            Body: pdfBuffer,
          }));
          console.log(`PDF uploaded to S3 at key: ${s3Key}`);
        } else {
          throw createError;
        }
      }
    } else {
      throw error;
    }
  }

  return s3Key;
}

export async function ingestPdf(s3Key: string, courseName: string, base_url: string, url: string, documentGroups: string[]) {
  const ingestUrl = process.env.INGEST_URL;
  if (!ingestUrl) {
    console.error('Error: INGEST_URL environment variable is not defined.');
    return;
  }

  try {
    const { error } = await supabase.from('documents_in_progress').insert({
      base_url: base_url,
      url: url,
      readable_filename: path.basename(s3Key),
      s3_path: s3Key,
      course_name: courseName,
      doc_groups: documentGroups,
    })

    if (error) {
      console.error(
        '❌❌ Supabase failed to insert into `documents_in_progress`:',
        error,)
    }

    fetch(ingestUrl, {
      "method": "POST",
      "headers": {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
        "Authorization": `Bearer ${process.env.BEAM_API_KEY}`,
        "Content-Type": "application/json"
      },
      "body": JSON.stringify({
        base_url: base_url,
        url: url,
        readable_filename: path.basename(s3Key),
        s3_paths: s3Key,
        course_name: courseName,
        groups: documentGroups,
      })
    })
      .then(response => response.text())
      // .then(text => {
      //   console.log(`IN PDF success case -- Data ingested for pdf: ${path.basename(s3Key)}`);
      //   console.log(text)
      // })
      .catch(err => console.error(err));
  } catch (error) {
    if (error instanceof Error) {
      // Now TypeScript knows 'error' is of type 'Error'
      console.error('Error message:', error.message);
    } else {
      // Handle other types of errors (if any)
      console.error('Unknown error:', error);
    }
  }
}

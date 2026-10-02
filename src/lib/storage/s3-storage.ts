import "server-only";

import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getServerEnv, isStorageConfigured } from "@/lib/config/env";

import type { StorageService } from "./storage-service";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string | undefined;
  forcePathStyle: boolean;
}

/** S3-compatible adapter: AWS S3, MinIO, Cloudflare R2, etc. via `endpoint`. */
export function createS3Storage(config: S3StorageConfig): StorageService {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucket;

  return {
    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async objectExists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (error) {
        if (error instanceof NotFound) return false;
        throw error;
      }
    },
    async ping() {
      await client.send(new HeadBucketCommand({ Bucket }));
    },
  };
}

const globalForStorage = globalThis as unknown as { peosStorage?: StorageService | null };

/** The configured storage service, or `null` when object storage is not configured. */
export function getStorage(): StorageService | null {
  if (globalForStorage.peosStorage !== undefined) return globalForStorage.peosStorage;
  const env = getServerEnv();
  globalForStorage.peosStorage = isStorageConfigured(env)
    ? createS3Storage({
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION!,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      })
    : null;
  return globalForStorage.peosStorage;
}

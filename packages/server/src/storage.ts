import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ArgusConfig } from '@argus/shared';

/**
 * StorageProvider abstracts file storage so that client code is identical
 * regardless of whether the system is running in local or cloud mode.
 *
 * Clients always POST to `/upload/:nodeId` and GET from `/composite/:sessionId` —
 * only the server-side backend changes.
 */
export interface StorageProvider {
  /** Save a file by key. Returns the path (local) or URL (S3/CloudFront). */
  saveFile(key: string, data: Buffer): Promise<string>;
  /** Retrieve a file by key. Returns null if not found. */
  getFile(key: string): Promise<Buffer | null>;
  /** Check whether a file exists for the given key. */
  exists(key: string): Promise<boolean>;
}

/**
 * Local filesystem storage provider.
 * Writes files to `./uploads/<key>`.
 */
class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(uploadDir: string) {
    this.baseDir = uploadDir;
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async saveFile(key: string, data: Buffer): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, data);
    return filePath;
  }

  async getFile(key: string): Promise<Buffer | null> {
    const filePath = path.join(this.baseDir, key);
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, key);
    return existsSync(filePath);
  }
}

/**
 * S3 storage provider (stubbed).
 *
 * In production this would use @aws-sdk/client-s3 to put/get objects
 * from the configured S3 bucket. The interface is what matters — the
 * actual AWS SDK calls would be added when aws-sdk is installed.
 */
class S3StorageProvider implements StorageProvider {
  private readonly bucket: string;
  private readonly region: string;

  constructor(config: ArgusConfig['aws']) {
    this.bucket = config.s3Bucket;
    this.region = config.region;
  }

  async saveFile(key: string, _data: Buffer): Promise<string> {
    // In production:
    // const client = new S3Client({ region: this.region });
    // await client.send(new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: key,
    //   Body: data,
    // }));
    // return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    console.log(`[S3 Stub] Would upload to: ${url}`);
    return url;
  }

  async getFile(key: string): Promise<Buffer | null> {
    // In production:
    // const client = new S3Client({ region: this.region });
    // const response = await client.send(new GetObjectCommand({
    //   Bucket: this.bucket,
    //   Key: key,
    // }));
    // return Buffer.from(await response.Body!.transformToByteArray());

    console.log(`[S3 Stub] Would get object: s3://${this.bucket}/${key}`);
    return null;
  }

  async exists(key: string): Promise<boolean> {
    // In production:
    // const client = new S3Client({ region: this.region });
    // try {
    //   await client.send(new HeadObjectCommand({
    //     Bucket: this.bucket,
    //     Key: key,
    //   }));
    //   return true;
    // } catch {
    //   return false;
    // }

    console.log(`[S3 Stub] Would check head object: s3://${this.bucket}/${key}`);
    return false;
  }
}

/**
 * Factory function that returns the appropriate storage provider based on config.
 *
 * - When `config.aws.enabled === false` → LocalStorageProvider (filesystem)
 * - When `config.aws.enabled === true` → S3StorageProvider (cloud)
 *
 * Client code is identical in both modes — only the storage backend changes.
 */
export function createStorage(config: ArgusConfig, uploadDir = './uploads'): StorageProvider {
  if (config.aws.enabled) {
    return new S3StorageProvider(config.aws);
  }
  return new LocalStorageProvider(uploadDir);
}

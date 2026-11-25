import type { ImageMimeType } from "../domain/image-policy.js";

/** Private object store. Keys are server-generated ids, never caller paths. */
export interface ObjectStore {
  /** Replaces any previous object at `key`. */
  put(key: string, bytes: Buffer): Promise<void>;
  /** The stored bytes, or `null` when the key is absent. */
  get(key: string): Promise<Buffer | null>;
  /** Removes the object. Missing keys are success (idempotent cleanup). */
  delete(key: string): Promise<void>;
}

/** Result of decoding and rewriting an upload (ASVS 5.0.0 V5.2.2). */
export interface InspectedImage {
  bytes: Buffer;
  height: number;
  mimeType: ImageMimeType;
  width: number;
}

/**
 * Decodes untrusted bytes and returns a rewritten image.
 *
 * @throws {import("../domain/image-policy.js").ImageRejectedError} When the bytes are not one acceptable still image.
 */
export type ImageInspector = (bytes: Buffer) => Promise<InspectedImage>;

export type MediaUploadStatus =
  "attached" | "pending" | "rejected" | "verified";

/** One upload grant, as stored. The plaintext token is never stored. */
export interface MediaUpload {
  declaredByteSize: number;
  declaredMimeType: ImageMimeType;
  expiresAt: Date;
  height: number | null;
  id: string;
  mimeType: ImageMimeType | null;
  objectKey: string;
  ownerId: string;
  status: MediaUploadStatus;
  tokenHash: Buffer;
  width: number | null;
  byteSize: number | null;
}

export interface NewMediaUpload {
  declaredByteSize: number;
  declaredMimeType: ImageMimeType;
  expiresAt: Date;
  id: string;
  now: Date;
  objectKey: string;
  ownerId: string;
  tokenHash: Buffer;
}

export interface VerifiedMedia {
  byteSize: number;
  height: number;
  mimeType: ImageMimeType;
  width: number;
}

/** Image row copied onto a tweet inside the tweet's transaction. */
export interface ClaimedMedia {
  alt: string;
  byteSize: number;
  height: number;
  mimeType: ImageMimeType;
  objectKey: string;
  width: number;
}

export interface MediaRepository {
  /** Deletes expired unattached uploads and returns object keys that have bytes. */
  reapExpired(now: Date): Promise<string[]>;
  insert(upload: NewMediaUpload): Promise<void>;
  find(id: string): Promise<MediaUpload | null>;
  markRejected(id: string): Promise<void>;
  /** Pending and unexpired only. Returns false when the row can no longer be verified. */
  markVerified(id: string, image: VerifiedMedia, now: Date): Promise<boolean>;
  /** An attached image that may be served, or null when the key is not public. */
  findAttached(objectKey: string): Promise<{ mimeType: ImageMimeType } | null>;
}

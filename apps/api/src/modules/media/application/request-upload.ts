import { UPLOAD_INTENT_TTL_SECONDS } from "@twitter-clone/contracts";

import { hashUploadToken, newUploadToken } from "../domain/upload-token.js";

import type { MediaRepository, ObjectStore } from "./ports.js";

export interface RequestUploadInput {
  byteSize: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  ownerId: string;
}

export interface RequestUploadResult {
  expiresAt: Date;
  uploadId: string;
  uploadToken: string;
}

export interface RequestUploadDependencies {
  clock: () => Date;
  generateId: () => string;
  media: MediaRepository;
  objects: ObjectStore;
}

export type RequestUpload = ReturnType<typeof createRequestUpload>;

/** Grants a short-lived upload and drops expired unattached objects (AC-F02.1, AC-F02.5). */
export function createRequestUpload(dependencies: RequestUploadDependencies) {
  return async (input: RequestUploadInput): Promise<RequestUploadResult> => {
    const now = dependencies.clock();
    const expired = await dependencies.media.reapExpired(now);
    await Promise.all(expired.map((key) => dependencies.objects.delete(key)));
    const uploadId = dependencies.generateId();
    const uploadToken = newUploadToken();
    const expiresAt = new Date(
      now.getTime() + UPLOAD_INTENT_TTL_SECONDS * 1000,
    );
    await dependencies.media.insert({
      declaredByteSize: input.byteSize,
      declaredMimeType: input.mimeType,
      expiresAt,
      id: uploadId,
      now,
      objectKey: dependencies.generateId(),
      ownerId: input.ownerId,
      tokenHash: hashUploadToken(uploadToken),
    });
    return { expiresAt, uploadId, uploadToken };
  };
}

import {
  ImageRejectedError,
  ImageUnavailableError,
} from "../domain/image-policy.js";
import { uploadTokenMatches } from "../domain/upload-token.js";

import type { ImageInspector, MediaRepository, ObjectStore } from "./ports.js";

export interface ReceiveUploadInput {
  bytes: Buffer;
  ownerId: string;
  uploadId: string;
  uploadToken: string;
}

export interface ReceiveUploadDependencies {
  clock: () => Date;
  inspect: ImageInspector;
  media: MediaRepository;
  objects: ObjectStore;
}

export type ReceiveUpload = ReturnType<typeof createReceiveUpload>;

/**
 * Decodes one upload and stores the rewritten bytes (AC-F02.2).
 *
 * A repeat of an already verified upload by its owner is success, so a lost
 * response can be retried. Anything else about a row the caller can name is
 * {@link ImageUnavailableError}, which does not describe why.
 *
 * @throws {ImageUnavailableError} When the upload cannot be completed by this member.
 * @throws {import("../domain/image-policy.js").ImageRejectedError} When the bytes are not an acceptable image.
 */
export function createReceiveUpload(dependencies: ReceiveUploadDependencies) {
  return async (input: ReceiveUploadInput): Promise<void> => {
    const upload = await dependencies.media.find(input.uploadId);
    if (upload === null) {
      throw new ImageUnavailableError();
    }
    const tokenOk = uploadTokenMatches(upload.tokenHash, input.uploadToken);
    const ownerOk = upload.ownerId === input.ownerId;
    if (!tokenOk || !ownerOk) {
      throw new ImageUnavailableError();
    }
    if (upload.status === "verified") {
      return;
    }
    if (
      upload.status !== "pending" ||
      upload.expiresAt.getTime() <= dependencies.clock().getTime() ||
      input.bytes.length !== upload.declaredByteSize
    ) {
      throw new ImageUnavailableError();
    }

    try {
      const image = await dependencies.inspect(input.bytes);
      if (image.mimeType !== upload.declaredMimeType) {
        throw new ImageRejectedError();
      }
      await dependencies.objects.put(upload.objectKey, image.bytes);
      const verified = await dependencies.media.markVerified(
        upload.id,
        {
          byteSize: image.bytes.length,
          height: image.height,
          mimeType: image.mimeType,
          width: image.width,
        },
        dependencies.clock(),
      );
      if (!verified) {
        const current = await dependencies.media.find(upload.id);
        if (current?.status === "verified") {
          return;
        }
        await dependencies.objects.delete(upload.objectKey);
        throw new ImageUnavailableError();
      }
    } catch (error: unknown) {
      if (error instanceof ImageUnavailableError) {
        throw error;
      }
      await dependencies.media.markRejected(upload.id);
      await dependencies.objects.delete(upload.objectKey);
      if (error instanceof ImageRejectedError) {
        throw error;
      }
      throw error;
    }
  };
}

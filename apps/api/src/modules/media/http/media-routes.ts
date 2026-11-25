import {
  IMAGE_MAX_BYTES,
  uploadIntentRequestSchema,
  uploadIntentResponseSchema,
  type UploadIntentResponse,
} from "@twitter-clone/contracts";
import { z } from "zod";

import { AppError } from "../../../platform/http/errors.js";
import { authContext, type AuthGuard } from "../../auth/http/authentication.js";
import {
  authRateLimitConfig,
  type AuthRateLimit,
} from "../../auth/http/rate-limit.js";
import { parseBody } from "../../auth/http/validation.js";
import {
  ImageRejectedError,
  ImageUnavailableError,
} from "../domain/image-policy.js";

import type { MediaRepository, ObjectStore } from "../application/ports.js";
import type { ReceiveUpload } from "../application/receive-upload.js";
import type { RequestUpload } from "../application/request-upload.js";
import type { FastifyInstance } from "fastify";

const OBJECT_KEY = z.uuid();

const INTENT_LIMIT: AuthRateLimit = { max: 20, timeWindowMs: 60_000 };
const READ_LIMIT: AuthRateLimit = { max: 120, timeWindowMs: 60_000 };

const EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export interface MediaRouteDependencies {
  media: MediaRepository;
  objects: ObjectStore;
  receiveUpload: ReceiveUpload;
  requestUpload: RequestUpload;
  requireCsrf: AuthGuard;
  requireSession: AuthGuard;
}

/**
 * Upload intents, the byte upload, and public reads of attached images
 * (US-F02). Bytes never arrive on `POST /tweets`.
 *
 * ASVS 5.0.0 V5.3.1: objects are not executed; the response type is the
 * verified image type. V5.4.1: the download name is a fixed name we choose.
 */
export async function mediaRoutes(
  app: FastifyInstance,
  dependencies: MediaRouteDependencies,
): Promise<void> {
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.post(
    "/media/upload-intents",
    {
      config: { rateLimit: authRateLimitConfig(INTENT_LIMIT) },
      preHandler: [dependencies.requireSession, dependencies.requireCsrf],
    },
    async (request, reply) => {
      const declared = parseBody(uploadIntentRequestSchema, request.body);
      const auth = authContext(request);
      const intent = await dependencies.requestUpload({
        byteSize: declared.byteSize,
        mimeType: declared.mimeType,
        ownerId: auth.user.id,
      });
      request.log.info(
        { ownerId: auth.user.id, uploadId: intent.uploadId },
        "upload intent created",
      );
      const body: UploadIntentResponse = {
        expiresAt: intent.expiresAt.toISOString(),
        uploadId: intent.uploadId,
        uploadPath: `/v1/media/uploads/${intent.uploadId}/content`,
        uploadToken: intent.uploadToken,
      };
      return reply
        .code(201)
        .header("cache-control", "no-store")
        .send(uploadIntentResponseSchema.parse(body));
    },
  );

  app.put<{ Params: { id: string } }>(
    "/media/uploads/:id/content",
    {
      bodyLimit: IMAGE_MAX_BYTES,
      config: { rateLimit: authRateLimitConfig(INTENT_LIMIT) },
      preHandler: [dependencies.requireSession, dependencies.requireCsrf],
    },
    async (request, reply) => {
      const uploadId = OBJECT_KEY.safeParse(request.params.id);
      if (!uploadId.success) {
        throw new AppError("VALIDATION_ERROR", "That image is not available.", {
          image: ["That image is not available."],
        });
      }
      const token = request.headers["x-upload-token"];
      if (typeof token !== "string" || token.length === 0) {
        throw new AppError("VALIDATION_ERROR", "That image is not available.", {
          image: ["That image is not available."],
        });
      }
      const bytes = request.body;
      if (!Buffer.isBuffer(bytes)) {
        throw new ImageRejectedError("Choose an image.");
      }
      const auth = authContext(request);
      try {
        await dependencies.receiveUpload({
          bytes,
          ownerId: auth.user.id,
          uploadId: uploadId.data,
          uploadToken: token,
        });
      } catch (error: unknown) {
        if (error instanceof ImageUnavailableError) {
          throw new AppError("VALIDATION_ERROR", error.message, {
            image: [error.message],
          });
        }
        if (error instanceof ImageRejectedError) {
          throw new AppError("VALIDATION_ERROR", error.message, {
            image: [error.message],
          });
        }
        throw error;
      }
      request.log.info(
        { ownerId: auth.user.id, uploadId: uploadId.data },
        "upload verified",
      );
      return reply.code(204).header("cache-control", "no-store").send();
    },
  );

  app.get<{ Params: { objectKey: string } }>(
    "/media/objects/:objectKey",
    { config: { rateLimit: authRateLimitConfig(READ_LIMIT) } },
    async (request, reply) => {
      const objectKey = OBJECT_KEY.safeParse(request.params.objectKey);
      if (!objectKey.success) {
        throw new AppError("NOT_FOUND", "That image does not exist.");
      }
      const row = await dependencies.media.findAttached(objectKey.data);
      if (row === null) {
        throw new AppError("NOT_FOUND", "That image does not exist.");
      }
      const bytes = await dependencies.objects.get(objectKey.data);
      if (bytes === null) {
        throw new AppError("NOT_FOUND", "That image does not exist.");
      }
      const extension = EXTENSION[row.mimeType];
      return reply
        .header("cache-control", "public, max-age=86400, immutable")
        .header("content-disposition", `inline; filename="image.${extension}"`)
        .header("content-type", row.mimeType)
        .header("cross-origin-resource-policy", "cross-origin")
        .header("x-content-type-options", "nosniff")
        .send(bytes);
    },
  );
}

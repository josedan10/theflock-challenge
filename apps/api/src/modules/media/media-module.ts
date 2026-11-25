import { v7 as uuidv7 } from "uuid";

import { createReceiveUpload } from "./application/receive-upload.js";
import { createRequestUpload } from "./application/request-upload.js";
import { mediaRoutes } from "./http/media-routes.js";
import { createMediaRepository } from "./infrastructure/drizzle-media-repository.js";
import { inspectImage } from "./infrastructure/sharp-image-inspector.js";

import type { Database } from "../../platform/database/client.js";
import type { AuthGuard } from "../auth/http/authentication.js";
import type { ObjectStore } from "./application/ports.js";
import type { FastifyInstance } from "fastify";

export interface MediaModuleOptions {
  clock?: () => Date;
  db: Database;
  objects: ObjectStore;
  requireCsrf: AuthGuard;
  requireSession: AuthGuard;
}

/** Composition root for tweet image uploads (IMG-01). */
export function mediaModule(options: MediaModuleOptions) {
  const media = createMediaRepository(options.db);
  const clock = options.clock ?? (() => new Date());
  const requestUpload = createRequestUpload({
    clock,
    generateId: uuidv7,
    media,
    objects: options.objects,
  });
  const receiveUpload = createReceiveUpload({
    clock,
    inspect: inspectImage,
    media,
    objects: options.objects,
  });
  return async (app: FastifyInstance): Promise<void> => {
    await mediaRoutes(app, {
      media,
      objects: options.objects,
      receiveUpload,
      requestUpload,
      requireCsrf: options.requireCsrf,
      requireSession: options.requireSession,
    });
  };
}

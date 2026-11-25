import { IMAGE_MAX_BYTES, IMAGE_MAX_EDGE_PX } from "@twitter-clone/contracts";
import sharp from "sharp";

import {
  acceptDecodedImage,
  ImageRejectedError,
} from "../domain/image-policy.js";

import type { ImageInspector } from "../application/ports.js";

const FORMAT_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

/**
 * Decodes with libvips and writes a new image, dropping metadata and any
 * trailing payload (ASVS 5.0.0 V5.2.2, V5.2.6).
 */
export const inspectImage: ImageInspector = async (bytes) => {
  try {
    const source = sharp(bytes, {
      failOn: "error",
      limitInputPixels: IMAGE_MAX_EDGE_PX * IMAGE_MAX_EDGE_PX,
      sequentialRead: true,
    });
    const metadata = await source.metadata();
    const mimeType =
      metadata.format === undefined
        ? ""
        : (FORMAT_MIME[metadata.format as keyof typeof FORMAT_MIME] ?? "");
    const accepted = acceptDecodedImage({
      byteSize: bytes.length,
      height: metadata.height ?? 0,
      mimeType,
      pages: metadata.pages ?? 1,
      width: metadata.width ?? 0,
    });
    const format =
      metadata.format === "jpeg" || metadata.format === "webp"
        ? metadata.format
        : "png";
    const rewritten = await source.rotate().toFormat(format).toBuffer();
    if (rewritten.length > IMAGE_MAX_BYTES) {
      throw new ImageRejectedError("Images must be 5 MB or smaller.");
    }
    return {
      bytes: rewritten,
      height: accepted.height,
      mimeType: accepted.mimeType,
      width: accepted.width,
    };
  } catch (error: unknown) {
    if (error instanceof ImageRejectedError) {
      throw error;
    }
    throw new ImageRejectedError();
  }
};

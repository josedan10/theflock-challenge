import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_EDGE_PX,
  IMAGE_MIME_TYPES,
} from "@twitter-clone/contracts";

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** A decoded image the policy has accepted. */
export interface DecodedImage {
  byteSize: number;
  height: number;
  mimeType: ImageMimeType;
  width: number;
}

/**
 * The upload cannot be stored. The message is safe to show to the member
 * (ASVS 5.0.0 V5.2.1, V5.2.2, V5.2.6).
 */
export class ImageRejectedError extends Error {
  override readonly name = "ImageRejectedError";

  constructor(
    message = "That image could not be verified. Choose a different JPEG, PNG, or WebP.",
  ) {
    super(message);
  }
}

/** The upload exists but this member cannot use it, or it is no longer usable. */
export class ImageUnavailableError extends Error {
  override readonly name = "ImageUnavailableError";

  constructor() {
    super("That image is not available.");
  }
}

const MIME_TYPES: ReadonlySet<string> = new Set(IMAGE_MIME_TYPES);

/** Declared type and size, checked before any bytes are accepted (AC-F02.1). */
export function acceptDeclaredUpload(mimeType: string, byteSize: number): void {
  if (!MIME_TYPES.has(mimeType)) {
    throw new ImageRejectedError("Choose a JPEG, PNG, or WebP image.");
  }
  if (
    !Number.isInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > IMAGE_MAX_BYTES
  ) {
    throw new ImageRejectedError("Images must be 5 MB or smaller.");
  }
}

/**
 * Decoded type, pixel size, and rewritten byte size (AC-F02.2).
 *
 * @throws {ImageRejectedError} When the image is not a single still JPEG, PNG, or WebP inside the limits.
 */
export function acceptDecodedImage(image: {
  byteSize: number;
  height: number;
  mimeType: string;
  pages: number;
  width: number;
}): DecodedImage {
  if (image.pages !== 1 || !MIME_TYPES.has(image.mimeType)) {
    throw new ImageRejectedError();
  }
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > IMAGE_MAX_EDGE_PX ||
    image.height > IMAGE_MAX_EDGE_PX
  ) {
    throw new ImageRejectedError(
      "Images must be at most 4096 pixels on each side.",
    );
  }
  if (
    !Number.isInteger(image.byteSize) ||
    image.byteSize < 1 ||
    image.byteSize > IMAGE_MAX_BYTES
  ) {
    throw new ImageRejectedError("Images must be 5 MB or smaller.");
  }
  return {
    byteSize: image.byteSize,
    height: image.height,
    mimeType: image.mimeType as ImageMimeType,
    width: image.width,
  };
}

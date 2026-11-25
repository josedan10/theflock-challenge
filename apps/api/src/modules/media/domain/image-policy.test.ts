import { IMAGE_MAX_BYTES, IMAGE_MAX_EDGE_PX } from "@twitter-clone/contracts";
import { describe, expect, it } from "vitest";

import {
  acceptDecodedImage,
  acceptDeclaredUpload,
  ImageRejectedError,
} from "./image-policy.js";

describe("image upload policy", () => {
  it("US-F02 AC-F02.1 accepts a JPEG, PNG, or WebP inside the size limit", () => {
    expect(() => acceptDeclaredUpload("image/jpeg", 1)).not.toThrow();
    expect(() =>
      acceptDeclaredUpload("image/png", IMAGE_MAX_BYTES),
    ).not.toThrow();
    expect(() => acceptDeclaredUpload("image/webp", 32)).not.toThrow();
  });

  it.each([
    ["gif", "image/gif", 10],
    ["svg", "image/svg+xml", 10],
    ["empty", "image/png", 0],
    ["oversize", "image/png", IMAGE_MAX_BYTES + 1],
    ["fractional", "image/png", 1.5],
  ])(
    "US-F02 AC-F02.1 rejects a %s declaration",
    (_case, mimeType, byteSize) => {
      expect(() => acceptDeclaredUpload(mimeType, byteSize)).toThrow(
        ImageRejectedError,
      );
    },
  );

  it("US-F02 AC-F02.2 accepts one still image inside the pixel limit", () => {
    expect(
      acceptDecodedImage({
        byteSize: 100,
        height: IMAGE_MAX_EDGE_PX,
        mimeType: "image/png",
        pages: 1,
        width: 1,
      }),
    ).toEqual({
      byteSize: 100,
      height: IMAGE_MAX_EDGE_PX,
      mimeType: "image/png",
      width: 1,
    });
  });

  it.each([
    ["animated", { pages: 2 }],
    ["gif decoded", { mimeType: "image/gif" }],
    ["too wide", { width: IMAGE_MAX_EDGE_PX + 1 }],
    ["too tall", { height: IMAGE_MAX_EDGE_PX + 1 }],
    ["zero width", { width: 0 }],
    ["rewritten oversize", { byteSize: IMAGE_MAX_BYTES + 1 }],
  ])("US-F02 AC-F02.2 rejects a %s image", (_case, patch) => {
    expect(() =>
      acceptDecodedImage({
        byteSize: 100,
        height: 8,
        mimeType: "image/jpeg",
        pages: 1,
        width: 8,
        ...patch,
      }),
    ).toThrow(ImageRejectedError);
  });
});

import { AppError } from "../../../platform/http/errors.js";
import {
  FollowTargetNotFoundError,
  SelfFollowError,
} from "../domain/errors.js";

/** Maps follow failures onto the HTTP error envelope (AC-C01.1, AC-C01.2). */
export function mapFollowError(error: unknown): never {
  if (error instanceof FollowTargetNotFoundError) {
    throw new AppError("NOT_FOUND", "That profile does not exist.");
  }
  if (error instanceof SelfFollowError) {
    throw new AppError("VALIDATION_ERROR", "You cannot follow yourself.", {
      username: ["You cannot follow yourself."],
    });
  }
  throw error;
}
